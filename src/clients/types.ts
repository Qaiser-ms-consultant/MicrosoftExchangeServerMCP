export interface Message {
  id: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  body: string;
  bodyType: "Text" | "HTML";
  isRead: boolean;
  hasAttachments: boolean;
  importance: "Low" | "Normal" | "High";
  receivedDateTime: string;
  folderId?: string;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: "Text" | "HTML";
  importance?: "Low" | "Normal" | "High";
  saveToSentItems?: boolean;
  attachments?: { name: string; contentBase64: string; contentType?: string }[];
}

export interface CalendarEvent {
  id: string;
  subject: string;
  body?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  organizer?: string;
  isAllDay?: boolean;
}

export interface Contact {
  id: string;
  displayName: string;
  emailAddresses?: string[];
  phoneNumbers?: { type: string; number: string }[];
  companyName?: string;
}

export interface TaskItem {
  id: string;
  subject: string;
  body?: string;
  dueDate?: string;
  status: "NotStarted" | "InProgress" | "Completed" | "WaitingOnOthers" | "Deferred";
  importance?: "Low" | "Normal" | "High";
}

export interface Mailbox {
  identity: string;
  displayName: string;
  primarySmtpAddress: string;
  recipientType?: string;
}

export interface PaginationOpts {
  top?: number;
  skip?: number;
  orderBy?: string;
}

export interface SearchOpts extends PaginationOpts {
  folder?: string;
}
