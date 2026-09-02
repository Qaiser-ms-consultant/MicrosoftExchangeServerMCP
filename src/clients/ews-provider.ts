import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import type { AppConfig } from "../config.js";
import type { AuthManager } from "../auth/auth-manager.js";
import { ExchangeError } from "../errors.js";
import { getHttpsAgent } from "../utils/tls.js";
import type { Message, SendMessageInput, CalendarEvent, Contact, TaskItem, PaginationOpts, SearchOpts } from "./types.js";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, textNodeName: "#text" });

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

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseMessagesFromFindItem(xml: string): Message[] {
  try {
    const j = xmlParser.parse(xml);
    const resp = j.Envelope?.Body?.FindItemResponse?.ResponseMessages?.FindItemResponseMessage;
    const msg = Array.isArray(resp) ? resp[0] : resp;
    if (msg?.["@_ResponseClass"] === "Error") throw new Error(msg.MessageText ?? "FindItem error");
    const root = msg?.RootFolder;
    if (!root || root.TotalItemsInView === "0" || root.TotalItemsInView === 0) return [];
    const items = root.Items;
    if (!items) return [];
    const rawItems = items.Message ? (Array.isArray(items.Message) ? items.Message : [items.Message]) : [];
    return rawItems.map((m: any) => ({
      id: m.ItemId?.["@_Id"] ?? m.ItemId?.Id ?? "",
      subject: m.Subject ?? "",
      from: m.From?.Mailbox?.EmailAddress ?? m.Sender?.Mailbox?.EmailAddress ?? "",
      to: (() => {
        const to = m.ToRecipients?.Mailbox;
        if (!to) return [];
        const arr = Array.isArray(to) ? to : [to];
        return arr.map((x: any) => x.EmailAddress).filter(Boolean);
      })(),
      body: m.Body?.["#text"] ?? m.Body ?? "",
      bodyType: (m.Body?.["@_BodyType"] as any) ?? "HTML",
      isRead: m.IsRead === "true" || m.IsRead === true,
      hasAttachments: m.HasAttachments === "true",
      importance: (m.Importance as any) ?? "Normal",
      receivedDateTime: m.DateTimeReceived ?? m.DateTimeCreated ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
function parseMessagesFromGetItem(xml: string): Message[] {
  try {
    const j = xmlParser.parse(xml);
    const resp = j.Envelope?.Body?.GetItemResponse?.ResponseMessages?.GetItemResponseMessage;
    const msg = Array.isArray(resp) ? resp[0] : resp;
    const items = msg?.Items;
    if (!items) return [];
    const raw = items.Message ? (Array.isArray(items.Message) ? items.Message : [items.Message]) : [];
    return raw.map((m: any) => ({
      id: m.ItemId?.["@_Id"] ?? "",
      subject: m.Subject ?? "",
      from: m.From?.Mailbox?.EmailAddress ?? "",
      to: (() => {
        const to = m.ToRecipients?.Mailbox;
        if (!to) return [];
        const arr = Array.isArray(to) ? to : [to];
        return arr.map((x: any) => x.EmailAddress);
      })(),
      body: m.Body?.["#text"] ?? "",
      bodyType: (m.Body?.["@_BodyType"] as any) ?? "HTML",
      isRead: m.IsRead === "true",
      hasAttachments: m.HasAttachments === "true",
      importance: (m.Importance as any) ?? "Normal",
      receivedDateTime: m.DateTimeReceived ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
function parseCalendarEvents(xml: string): CalendarEvent[] {
  try {
    const j = xmlParser.parse(xml);
    const resp = j.Envelope?.Body?.FindItemResponse?.ResponseMessages?.FindItemResponseMessage;
    const msg = Array.isArray(resp) ? resp[0] : resp;
    const items = msg?.RootFolder?.Items;
    if (!items) return [];
    const raw = items.CalendarItem ? (Array.isArray(items.CalendarItem) ? items.CalendarItem : [items.CalendarItem]) : [];
    return raw.map((c: any) => ({
      id: c.ItemId?.["@_Id"] ?? "",
      subject: c.Subject ?? "",
      body: c.Body?.["#text"] ?? "",
      start: c.Start ?? "",
      end: c.End ?? "",
      location: c.Location ?? "",
      attendees: [],
    }));
  } catch {
    return [];
  }
}
function parseContacts(xml: string): Contact[] {
  try {
    const j = xmlParser.parse(xml);
    const resp = j.Envelope?.Body?.FindItemResponse?.ResponseMessages?.FindItemResponseMessage;
    const items = (Array.isArray(resp) ? resp[0] : resp)?.RootFolder?.Items;
    if (!items) return [];
    const raw = items.Contact ? (Array.isArray(items.Contact) ? items.Contact : [items.Contact]) : [];
    return raw.map((c: any) => ({ id: c.ItemId?.["@_Id"] ?? "", displayName: c.DisplayName ?? c.Subject ?? "", emailAddresses: [] }));
  } catch {
    return [];
  }
}
function parseTasks(xml: string): TaskItem[] {
  try {
    const j = xmlParser.parse(xml);
    const resp = j.Envelope?.Body?.FindItemResponse?.ResponseMessages?.FindItemResponseMessage;
    const items = (Array.isArray(resp) ? resp[0] : resp)?.RootFolder?.Items;
    if (!items) return [];
    const raw = items.Task ? (Array.isArray(items.Task) ? items.Task : [items.Task]) : [];
    return raw.map((t: any) => ({ id: t.ItemId?.["@_Id"] ?? "", subject: t.Subject ?? "", status: (t.Status as any) ?? "NotStarted" }));
  } catch {
    return [];
  }
}
