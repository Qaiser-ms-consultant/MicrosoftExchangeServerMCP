import axios, { type AxiosInstance } from "axios";
import type { AppConfig } from "../config.js";
import type { AuthManager } from "../auth/auth-manager.js";
import { ExchangeError } from "../errors.js";
import { getHttpsAgent } from "../utils/tls.js";
import type { Message, SendMessageInput, CalendarEvent, Contact, TaskItem, PaginationOpts, SearchOpts } from "./types.js";

export class RestProvider {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(
    private config: AppConfig,
    private auth: AuthManager,
  ) {
    this.baseUrl = `${config.exchange.endpoint.replace(/\/$/, "")}${config.exchange.restPath}`;
    this.client = axios.create({ baseURL: this.baseUrl, validateStatus: () => true });
    // Attach insecure agent + auth headers via interceptor so each request honors dev self-signed mode
    this.client.interceptors.request.use(async (cfg) => {
      const authHeader = await this.auth.getAuthHeader();
      const extra = await this.auth.getExtraOptions();
      cfg.headers.set("Authorization", authHeader);
      if ((extra.headers as any)) {
        for (const [k, v] of Object.entries(extra.headers as Record<string, string>)) cfg.headers.set(k, v as string);
      }
      const agent = await getHttpsAgent(this.config, (extra as any).httpsAgent);
      if (agent) (cfg as any).httpsAgent = agent;
      return cfg;
    });
  }

  private async headers(): Promise<Record<string, string>> {
    const authHeader = await this.auth.getAuthHeader();
    const extra = await this.auth.getExtraOptions();
    return { Authorization: authHeader, "Content-Type": "application/json", ...(extra.headers ?? {}) };
  }

  private async handle<T>(promise: Promise<any>, provider = "rest"): Promise<T> {
    try {
      const res = await promise;
      if (res.status === 401) throw new ExchangeError({ message: "REST auth failed", code: "AUTH_FAILED", provider });
      if (res.status === 404) throw new ExchangeError({ message: "Not found", code: "NOT_FOUND", provider });
      if (res.status === 429) throw new ExchangeError({ message: "Rate limited", code: "RATE_LIMITED", provider });
      if (res.status === 403) throw new ExchangeError({ message: "Permission denied", code: "PERMISSION_DENIED", provider });
      if (res.status >= 500) throw new ExchangeError({ message: `Server error ${res.status}`, code: "SERVER_ERROR", provider });
      if (res.status >= 400) throw new ExchangeError({ message: `REST error ${res.status}: ${JSON.stringify(res.data)}`, code: "SERVER_ERROR", provider });
      return res.data as T;
    } catch (err) {
      if (err instanceof ExchangeError) throw err;
      throw new ExchangeError({ message: `REST request failed: ${(err as Error).message}`, code: "SERVER_ERROR", provider, cause: err });
    }
  }

  async listMessages(folder = "inbox", opts: PaginationOpts = {}): Promise<Message[]> {
    const headers = await this.headers();
    const params: Record<string, string> = { $top: String(opts.top ?? 10), $skip: String(opts.skip ?? 0) };
    const data = await this.handle<{ value: any[] }>(this.client.get(`/me/mailfolders/${folder}/messages`, { headers, params }));
    return (data.value ?? []).map(mapRestMessage);
  }

  async getMessage(id: string): Promise<Message> {
    const headers = await this.headers();
    const data = await this.handle<any>(this.client.get(`/me/messages/${encodeURIComponent(id)}`, { headers }));
    return mapRestMessage(data);
  }

  async sendMessage(input: SendMessageInput): Promise<string> {
    const headers = await this.headers();
    const body = {
      message: {
        subject: input.subject,
        body: { contentType: input.bodyType ?? "HTML", content: input.body },
        toRecipients: input.to.map((a) => ({ emailAddress: { address: a } })),
        ccRecipients: (input.cc ?? []).map((a) => ({ emailAddress: { address: a } })),
        bccRecipients: (input.bcc ?? []).map((a) => ({ emailAddress: { address: a } })),
        importance: input.importance ?? "Normal",
      },
      saveToSentItems: input.saveToSentItems !== false,
    };
    await this.handle(this.client.post("/me/sendMail", body, { headers }));
    return `rest-sent-${Date.now()}`;
  }

  async deleteMessage(id: string): Promise<void> {
    const headers = await this.headers();
    await this.handle(this.client.delete(`/me/messages/${encodeURIComponent(id)}`, { headers }));
  }

  async moveMessage(id: string, folder: string): Promise<void> {
    const headers = await this.headers();
    await this.handle(this.client.post(`/me/messages/${encodeURIComponent(id)}/move`, { destinationId: folder }, { headers }));
  }

  async searchMessages(query: string, opts: SearchOpts = {}): Promise<Message[]> {
    const headers = await this.headers();
    const params: Record<string, string> = { $search: `"${query}"`, $top: String(opts.top ?? 10) };
    const data = await this.handle<{ value: any[] }>(this.client.get(`/me/messages`, { headers, params }));
    return (data.value ?? []).map(mapRestMessage);
  }

  async listCalendarEvents(start?: string, end?: string): Promise<CalendarEvent[]> {
    const headers = await this.headers();
    const params: Record<string, string> = {};
    if (start && end) params.$filter = `start/dateTime ge '${start}' and end/dateTime le '${end}'`;
    const data = await this.handle<{ value: any[] }>(this.client.get("/me/calendar/events", { headers, params }));
    return (data.value ?? []).map(mapRestEvent);
  }

  async createCalendarEvent(event: Omit<CalendarEvent, "id">): Promise<string> {
    const headers = await this.headers();
    const body = {
      subject: event.subject,
      body: { contentType: "HTML", content: event.body ?? "" },
      start: { dateTime: event.start, timeZone: "UTC" },
      end: { dateTime: event.end, timeZone: "UTC" },
      location: { displayName: event.location ?? "" },
      attendees: (event.attendees ?? []).map((a) => ({ emailAddress: { address: a }, type: "required" })),
    };
    const data = await this.handle<any>(this.client.post("/me/calendar/events", body, { headers }));
    return data.id ?? `rest-cal-${Date.now()}`;
  }

  async listContacts(): Promise<Contact[]> {
    const headers = await this.headers();
    const data = await this.handle<{ value: any[] }>(this.client.get("/me/contacts", { headers }));
    return (data.value ?? []).map(mapRestContact);
  }

  async listTasks(): Promise<TaskItem[]> {
    const headers = await this.headers();
    const data = await this.handle<{ value: any[] }>(this.client.get("/me/todo/lists/tasks/tasks", { headers }).catch(() => ({ status: 200, data: { value: [] } })));
    return (data.value ?? []).map(mapRestTask);
  }
}

function mapRestMessage(m: any): Message {
  return {
    id: m.id,
    subject: m.subject ?? "",
    from: m.from?.emailAddress?.address ?? "",
    to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
    cc: (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address),
    body: m.body?.content ?? "",
    bodyType: m.body?.contentType === "Text" ? "Text" : "HTML",
    isRead: !!m.isRead,
    hasAttachments: !!m.hasAttachments,
    importance: m.importance ?? "Normal",
    receivedDateTime: m.receivedDateTime ?? m.createdDateTime ?? new Date().toISOString(),
  };
}
function mapRestEvent(e: any): CalendarEvent {
  return {
    id: e.id,
    subject: e.subject ?? "",
    body: e.body?.content,
    start: e.start?.dateTime ?? "",
    end: e.end?.dateTime ?? "",
    location: e.location?.displayName,
    attendees: (e.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean),
    organizer: e.organizer?.emailAddress?.address,
  };
}
function mapRestContact(c: any): Contact {
  return { id: c.id, displayName: c.displayName ?? "", emailAddresses: (c.emailAddresses ?? []).map((e: any) => e.address), companyName: c.companyName };
}
function mapRestTask(t: any): TaskItem {
  return { id: t.id, subject: t.title ?? t.subject ?? "", body: t.body?.content, dueDate: t.dueDateTime?.dateTime, status: t.status ?? "NotStarted" };
}
