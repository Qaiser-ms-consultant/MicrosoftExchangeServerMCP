import { describe, expect, it } from "vitest";
import { extractIdentity, routeQuery } from "../src/desktop/queryRouter.js";

describe("extractIdentity", () => {
  it("pulls an email out of free text", () => {
    expect(extractIdentity("Tell me everything about devlabadmin@devlab2025.local")).toBe("devlabadmin@devlab2025.local");
  });
  it("returns null when no email present", () => {
    expect(extractIdentity("what version of exchange")).toBeNull();
  });
});

describe("routeQuery", () => {
  it("routes version prompts", () => {
    expect(routeQuery("what version of exchange i have")).toEqual({ tool: "report.exchange_version_and_cu", args: {}, write: false });
  });
  it("routes queue prompts", () => {
    expect(routeQuery("show delayed queues")).toEqual({ tool: "exchange_get_queue", args: {}, write: false });
  });
  it("routes health prompts", () => {
    expect(routeQuery("is the server healthy")).toEqual({ tool: "exchange_get_health_report", args: {}, write: false });
  });
  it("routes database list prompts", () => {
    expect(routeQuery("list databases")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("routes whitespace prompts", () => {
    expect(routeQuery("database whitespace and growth")).toEqual({ tool: "database.get_whitespace_and_growth", args: {}, write: false });
  });
  it("routes backup prompts", () => {
    expect(routeQuery("last backup status")).toEqual({ tool: "database.get_backup_status", args: {}, write: false });
  });
  it("routes dag prompts", () => {
    expect(routeQuery("show dags")).toEqual({ tool: "dag.list", args: {}, write: false });
  });
  it("routes certificate prompts", () => {
    expect(routeQuery("certificates expiring soon")).toEqual({ tool: "exchange_get_exchange_certificate", args: {}, write: false });
  });
  it("routes disk space prompts", () => {
    expect(routeQuery("disk space on server")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes short disk size prompts", () => {
    expect(routeQuery("disk size")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes disk usage prompts to disk space", () => {
    expect(routeQuery("disk usage")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes database count prompts", () => {
    expect(routeQuery("number of mailbox databases")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("routes bare databases questions", () => {
    expect(routeQuery("mailbox databases?")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("still routes dismount as write, not list", () => {
    expect(routeQuery("dismount database DB01")).toEqual({ tool: "database.dismount", args: { identity: "DB01" }, write: true });
  });
  it("routes capacity forecast prompts", () => {
    expect(routeQuery("capacity forecast")).toEqual({ tool: "database.get_whitespace_and_growth", args: {}, write: false });
  });
  it("routes mailbox count prompts", () => {
    expect(routeQuery("how many mailboxes")).toEqual({ tool: "exchange_list_mailboxes", args: {}, write: false });
  });
  it("routes uptime prompts", () => {
    expect(routeQuery("server uptime")).toEqual({ tool: "server.get_uptime", args: {}, write: false });
  });
  it("routes service status prompts", () => {
    expect(routeQuery("are exchange services running")).toEqual({ tool: "server.get_services_status", args: {}, write: false });
  });
  it("routes connector prompts", () => {
    expect(routeQuery("list send connectors")).toEqual({ tool: "exchange_list_send_connectors", args: {}, write: false });
  });
  it("routes transport rule prompts", () => {
    expect(routeQuery("show transport rules")).toEqual({ tool: "exchange_get_transport_rules", args: {}, write: false });
  });
  it("routes server list prompts", () => {
    expect(routeQuery("list exchange servers")).toEqual({ tool: "exchange_list_servers", args: {}, write: false });
  });
  it("routes topology prompts", () => {
    expect(routeQuery("show topology")).toEqual({ tool: "report.exchange_topology", args: {}, write: false });
  });
  it("routes overview prompts", () => {
    expect(routeQuery("environment overview")).toEqual({ tool: "report.exchange_environment_overview", args: {}, write: false });
  });
  it("routes NDR code prompts", () => {
    expect(routeQuery("explain bounce 5.7.1")).toEqual({ tool: "mailflow.get_ndr_details", args: { code: "5.7.1" }, write: false });
  });
  it("routes NDR keyword prompts without code", () => {
    expect(routeQuery("what does this ndr mean")).toEqual({ tool: "mailflow.get_ndr_details", args: {}, write: false });
  });
  it("routes trace prompts with sender", () => {
    const r = routeQuery("trace messages from bob@contoso.com");
    expect(r).toEqual({ tool: "mailflow.get_message_trace", args: { sender: "bob@contoso.com" }, write: false });
  });
  it("routes permission prompts", () => {
    const r = routeQuery("permissions of alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_permissions", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes statistics prompts", () => {
    const r = routeQuery("mailbox statistics for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_statistics", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("falls back to tell_me_everything on bare email", () => {
    const r = routeQuery("alice@contoso.com");
    expect(r).toEqual({ tool: "ai.tell_me_everything", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes dismount as a write needing confirm", () => {
    const r = routeQuery("dismount database DB01");
    expect(r).toEqual({ tool: "database.dismount", args: { identity: "DB01" }, write: true });
  });
  it("routes queue retry as a write needing confirm", () => {
    const r = routeQuery("retry queue EXCH01\\Submission");
    expect(r).toEqual({ tool: "exchange_retry_queue", args: { identity: "EXCH01\\Submission" }, write: true });
  });
  it("returns help when nothing matches", () => {
    expect(routeQuery("hello there")).toEqual({ help: true });
  });
});
