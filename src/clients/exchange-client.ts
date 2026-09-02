import type { AppConfig } from "../config.js";
import { AuthManager } from "../auth/auth-manager.js";
import { EWSProvider } from "./ews-provider.js";
import { RestProvider } from "./rest-provider.js";
import { PowerShellProvider } from "./powershell-provider.js";
import { ExchangeError } from "../errors.js";
import type { Message, SendMessageInput, CalendarEvent, Contact, TaskItem, Mailbox, PaginationOpts, SearchOpts } from "./types.js";

export class ExchangeClient {
  auth: AuthManager;
  ews: EWSProvider;
  rest: RestProvider;
  ps: PowerShellProvider;

  constructor(private config: AppConfig) {
    this.auth = new AuthManager(config);
    this.ews = new EWSProvider(config, this.auth);
    this.rest = new RestProvider(config, this.auth);
    this.ps = new PowerShellProvider(config, this.auth);
  }

  private provider(): "ews" | "rest" {
    if (this.config.exchange.provider === "ews") return "ews";
    if (this.config.exchange.provider === "rest") return "rest";
    // auto: prefer REST for 2016/2019, fallback to EWS
    if (["2016", "2019"].includes(this.config.exchange.version)) return "rest";
    if (this.config.exchange.version === "auto") return "rest";
    return "ews";
  }

  private async withFallback<T>(action: (p: "rest" | "ews") => Promise<T>): Promise<T> {
    const primary = this.provider();
    try {
      return await action(primary);
    } catch (err) {
      if (err instanceof ExchangeError && primary === "rest" && err.code === "SERVER_ERROR") {
        return action("ews");
      }
      throw err;
    }
  }

  // Mail
  listMessages(folder = "inbox", opts: PaginationOpts = {}): Promise<Message[]> {
    return this.withFallback((p) => (p === "rest" ? this.rest.listMessages(folder, opts) : this.ews.listMessages(folder, opts)));
  }
  getMessage(id: string): Promise<Message> {
    return this.withFallback((p) => (p === "rest" ? this.rest.getMessage(id) : this.ews.getMessage(id)));
  }
  sendMessage(input: SendMessageInput): Promise<string> {
    return this.withFallback((p) => (p === "rest" ? this.rest.sendMessage(input) : this.ews.sendMessage(input)));
  }
  deleteMessage(id: string): Promise<void> {
    return this.withFallback((p) => (p === "rest" ? this.rest.deleteMessage(id) : this.ews.deleteMessage(id)));
  }
  moveMessage(id: string, folder: string): Promise<void> {
    return this.withFallback((p) => (p === "rest" ? this.rest.moveMessage(id, folder) : this.ews.moveMessage(id, folder)));
  }
  searchMessages(query: string, opts: SearchOpts = {}): Promise<Message[]> {
    return this.withFallback((p) => (p === "rest" ? this.rest.searchMessages(query, opts) : this.ews.searchMessages(query, opts)));
  }

  // Calendar
  listCalendarEvents(start?: string, end?: string): Promise<CalendarEvent[]> {
    return this.withFallback((p) => (p === "rest" ? this.rest.listCalendarEvents(start, end) : this.ews.listCalendarEvents(start, end)));
  }
  createCalendarEvent(event: Omit<CalendarEvent, "id">): Promise<string> {
    return this.withFallback((p) => (p === "rest" ? this.rest.createCalendarEvent(event) : this.ews.createCalendarEvent(event)));
  }

  // Contacts / Tasks
  listContacts(): Promise<Contact[]> {
    return this.withFallback((p) => (p === "rest" ? this.rest.listContacts() : this.ews.listContacts()));
  }
  listTasks(): Promise<TaskItem[]> {
    return this.withFallback((p) => (p === "rest" ? this.rest.listTasks() : this.ews.listTasks()));
  }

  // Admin (always PowerShell)
  listMailboxes(filter?: string): Promise<Mailbox[]> {
    return this.ps.listMailboxes(filter);
  }
  getMailbox(identity: string): Promise<Mailbox> {
    return this.ps.getMailbox(identity);
  }
  listDistributionGroups(): Promise<any[]> {
    return this.ps.listDistributionGroups();
  }
  getTransportRules(): Promise<any[]> {
    return this.ps.getTransportRules();
  }
}
