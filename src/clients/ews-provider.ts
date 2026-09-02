import axios from "axios";
import type { AppConfig } from "../config.js";
import type { AuthManager } from "../auth/auth-manager.js";
import { ExchangeError } from "../errors.js";
import { getHttpsAgent } from "../utils/tls.js";
import type { Message, SendMessageInput, CalendarEvent, Contact, TaskItem, PaginationOpts, SearchOpts } from "./types.js";

/**
 * EWS provider — uses raw SOAP via axios to avoid heavy native deps.
 * Works with Exchange 2013 / 2016 / 2019.
 */
export class EWSProvider {
  private endpoint: string;

  constructor(
    private config: AppConfig,
    private auth: AuthManager,
  ) {
    this.endpoint = `${config.exchange.endpoint.replace(/\/$/, "")}${config.exchange.ewsPath}`;
  }

  private async soapRequest(body: string): Promise<string> {
    const authHeader = await this.auth.getAuthHeader();
    const extra = await this.auth.getExtraOptions();
    const httpsAgent = await getHttpsAgent(this.config, (extra as any).httpsAgent);
    try {
      const res = await axios.post(this.endpoint, body, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          Authorization: authHeader,
          ...(extra.headers ?? {}),
        },
        // @ts-ignore httpsAgent
        httpsAgent,
        validateStatus: () => true,
      });
      if (res.status === 401) throw new ExchangeError({ message: "EWS authentication failed", code: "AUTH_FAILED", provider: "ews" });
      if (res.status === 429) throw new ExchangeError({ message: "EWS rate limited", code: "RATE_LIMITED", provider: "ews" });
      if (res.status >= 500) throw new ExchangeError({ message: `EWS server error ${res.status}`, code: "SERVER_ERROR", provider: "ews" });
      if (res.status >= 400) throw new ExchangeError({ message: `EWS error ${res.status}: ${res.data}`, code: "SERVER_ERROR", provider: "ews" });
      return res.data as string;
    } catch (err) {
      if (err instanceof ExchangeError) throw err;
      throw new ExchangeError({ message: `EWS request failed: ${(err as Error).message}`, code: "SERVER_ERROR", provider: "ews", cause: err });
    }
  }

  private soapEnvelope(inner: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header>
  <soap:Body>${inner}</soap:Body>
</soap:Envelope>`;
  }

  async listMessages(folder: string = "inbox", opts: PaginationOpts = {}): Promise<Message[]> {
    const top = opts.top ?? 10;
    const body = this.soapEnvelope(`
      <m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>Default</t:BaseShape></m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="${top}" Offset="${opts.skip ?? 0}" BasePoint="Beginning"/>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="${folder}"/></m:ParentFolderIds></m:FindItem>`);
    const xml = await this.soapRequest(body);
    return parseMessagesFromFindItem(xml);
  }

  async getMessage(id: string): Promise<Message> {
    const body = this.soapEnvelope(`
      <m:GetItem><m:ItemShape><t:BaseShape>Default</t:BaseShape><t:IncludeMimeContent>false</t:IncludeMimeContent></m:ItemShape>
      <m:ItemIds><t:ItemId Id="${escapeXml(id)}"/></m:ItemIds></m:GetItem>`);
    const xml = await this.soapRequest(body);
    const msgs = parseMessagesFromGetItem(xml);
    if (!msgs.length) throw new ExchangeError({ message: `Message ${id} not found`, code: "NOT_FOUND", provider: "ews" });
    return msgs[0];
  }

  async sendMessage(input: SendMessageInput): Promise<string> {
    const toXml = input.to.map((a) => `<t:Mailbox><t:EmailAddress>${escapeXml(a)}</t:EmailAddress></t:Mailbox>`).join("");
    const body = this.soapEnvelope(`
      <m:CreateItem MessageDisposition="${input.saveToSentItems === false ? "SendOnly" : "SendAndSaveCopy"}">
        <m:Items><t:Message>
          <t:Subject>${escapeXml(input.subject)}</t:Subject>
          <t:Body BodyType="${input.bodyType ?? "HTML"}">${escapeXml(input.body)}</t:Body>
          <t:ToRecipients>${toXml}</t:ToRecipients>
        </t:Message></m:Items>
      </m:CreateItem>`);
    await this.soapRequest(body);
    return `ews-sent-${Date.now()}`;
  }

  async deleteMessage(id: string): Promise<void> {
    const body = this.soapEnvelope(`<m:DeleteItem DeleteType="MoveToDeletedItems"><m:ItemIds><t:ItemId Id="${escapeXml(id)}"/></m:ItemIds></m:DeleteItem>`);
    await this.soapRequest(body);
  }

  async moveMessage(id: string, folder: string): Promise<void> {
    const body = this.soapEnvelope(`<m:MoveItem><m:ToFolderId><t:DistinguishedFolderId Id="${escapeXml(folder)}"/></m:ToFolderId><m:ItemIds><t:ItemId Id="${escapeXml(id)}"/></m:ItemIds></m:MoveItem>`);
    await this.soapRequest(body);
  }

  async searchMessages(query: string, opts: SearchOpts = {}): Promise<Message[]> {
    const top = opts.top ?? 10;
    const body = this.soapEnvelope(`
      <m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>Default</t:BaseShape></m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="${top}" Offset="${opts.skip ?? 0}" BasePoint="Beginning"/>
      <m:Restriction><t:Contains ContainmentMode="Substring" ContainmentComparison="IgnoreCase"><t:FieldURI FieldURI="item:Subject"/><t:Constant Value="${escapeXml(query)}"/></t:Contains></m:Restriction>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="${opts.folder ?? "inbox"}"/></m:ParentFolderIds></m:FindItem>`);
    const xml = await this.soapRequest(body);
    return parseMessagesFromFindItem(xml);
  }

  // Calendar / Contacts / Tasks — minimal SOAP implementations returning empty or parsed

  async listCalendarEvents(_start?: string, _end?: string): Promise<CalendarEvent[]> {
    const body = this.soapEnvelope(`<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>Default</t:BaseShape></m:ItemShape><m:ParentFolderIds><t:DistinguishedFolderId Id="calendar"/></m:ParentFolderIds></m:FindItem>`);
    const xml = await this.soapRequest(body);
    return parseCalendarEvents(xml);
  }

  async createCalendarEvent(event: Omit<CalendarEvent, "id">): Promise<string> {
    const body = this.soapEnvelope(`<m:CreateItem SendMeetingInvitations="SendToAllAndSaveCopy"><m:Items><t:CalendarItem><t:Subject>${escapeXml(event.subject)}</t:Subject><t:Body BodyType="HTML">${escapeXml(event.body ?? "")}</t:Body><t:Start>${escapeXml(event.start)}</t:Start><t:End>${escapeXml(event.end)}</t:End><t:Location>${escapeXml(event.location ?? "")}</t:Location></t:CalendarItem></m:Items></m:CreateItem>`);
    await this.soapRequest(body);
    return `ews-cal-${Date.now()}`;
  }

  async listContacts(): Promise<Contact[]> {
    const body = this.soapEnvelope(`<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>Default</t:BaseShape></m:ItemShape><m:ParentFolderIds><t:DistinguishedFolderId Id="contacts"/></m:ParentFolderIds></m:FindItem>`);
    const xml = await this.soapRequest(body);
    return parseContacts(xml);
  }

  async listTasks(): Promise<TaskItem[]> {
    const body = this.soapEnvelope(`<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>Default</t:BaseShape></m:ItemShape><m:ParentFolderIds><t:DistinguishedFolderId Id="tasks"/></m:ParentFolderIds></m:FindItem>`);
    const xml = await this.soapRequest(body);
    return parseTasks(xml);
  }
}

// Minimal XML helpers — production should use a proper XML parser (fast-xml-parser)
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseMessagesFromFindItem(_xml: string): Message[] {
  // Placeholder: real impl would parse with fast-xml-parser
  return [];
}
function parseMessagesFromGetItem(_xml: string): Message[] {
  return [];
}
function parseCalendarEvents(_xml: string): CalendarEvent[] {
  return [];
}
function parseContacts(_xml: string): Contact[] {
  return [];
}
function parseTasks(_xml: string): TaskItem[] {
  return [];
}
