# Agent Router + Friendly Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route any free-text desktop prompt to the right MCP tool (reads and writes) and render every result as a human-friendly card with exact raw output fallback.

**Architecture:** New pure module `src/desktop/queryRouter.ts` (`routeQuery`, first-match keyword rules) consumed by Electron `main.ts`; renderer gains `renderResult(tool, data)` formatters plus confirm/info/help cards; Rust backend mirrors the table; smoke test extended.

**Tech Stack:** TypeScript (NodeNext ESM), vitest, plain renderer JS, Rust (Tauri 1.5, sync commands, blocking reqwest).

**Spec:** `docs/superpowers/specs/2026-09-04-agent-router-friendly-output-design.md`

## Global Constraints

- Writes only execute after explicit in-card Confirm showing exact tool + parameters.
- No write runs with guessed parameters; missing args produce a needs-info card.
- Renderer escapes all backend strings (`textContent`, never raw `innerHTML` for data).
- Unmatched results render byte-exact MCP `content[0].text`, never empty.
- Envelope everywhere: `{prompt, tool, result, needsConfirm?, needsInfo?}`.
- TS imports use `.js` extension (NodeNext).

---

## File Structure

- `src/desktop/queryRouter.ts` (CREATE) — `extractIdentity`, `routeQuery`, types. Pure, no imports.
- `tests/queryRouter.test.ts` (CREATE) — one vitest case per rule + fallback + help.
- `src/desktop/main.ts` (MODIFY `exchange:ask` handler only) — route → init → `tools/call` → envelope.
- `src/desktop/renderer/index.html` (MODIFY script section only) — `renderResult`, `esc`, formatters, confirm wiring, help card.
- `tauri-client/src/index.html` (SYNC from renderer + re-apply `initTauriBridge` shim).
- `tauri-client/src-tauri/src/main.rs` (MODIFY `ask_exchange` + add routing helpers) — mirror table + envelope.
- `scripts/tauri-frontend-check.cjs` (MODIFY) — assert new card IDs and formatters.

---

### Task 1: Query router module + unit tests

**Files:**
- Create: `src/desktop/queryRouter.ts`
- Create: `tests/queryRouter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface RouteResult { tool: string; args: Record<string, unknown>; write: boolean }`, `export interface HelpRoute { help: true }`, `export function extractIdentity(prompt: string): string | null`, `export function routeQuery(prompt: string): RouteResult | HelpRoute` (consumed by Task 2).

- [ ] **Step 1: Write the failing test file**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/queryRouter.test.ts`
Expected: FAIL with "Failed to resolve import ... queryRouter.js"

- [ ] **Step 3: Write the router implementation**

```ts
// Keyword router: free-text prompt -> MCP tool + args. Pure, no I/O.
export interface RouteResult { tool: string; args: Record<string, unknown>; write: boolean; }
export interface HelpRoute { help: true; }
export type Route = RouteResult | HelpRoute;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const NDR_RE = /\b(\d\.\d+\.\d+)\b/;
const QUOTED_RE = /["""]([^"""]+)["""]/;

export function extractIdentity(prompt: string): string | null {
  const m = prompt.match(EMAIL_RE);
  return m ? m[0] : null;
}

function afterWord(prompt: string, word: string): string | null {
  const i = prompt.toLowerCase().indexOf(word);
  if (i < 0) return null;
  const rest = prompt.slice(i + word.length).trim().replace(/^["'\s:]+|["'\s.]+$/g, "");
  return rest || null;
}

export function routeQuery(prompt: string): Route {
  const p = prompt.toLowerCase();
  const email = extractIdentity(prompt);
  const has = (...words: string[]) => words.some((w) => p.includes(w));

  if (has("version", "cumulative", " cu", "build", "patch")) return { tool: "report.exchange_version_and_cu", args: {}, write: false };
  if (has("queue", "delayed", "stuck", "backlog", "mailflow", "mail flow", "pending mail")) return { tool: "exchange_get_queue", args: {}, write: false };
  if (has("health", "healthy", "unhealthy")) return { tool: "exchange_get_health_report", args: {}, write: false };
  if (has("database", "databases", "db01", "db0") && has("list")) return { tool: "database.list", args: {}, write: false };
  if (has("whitespace", "growth", "storage", "disk usage", "size of database")) return { tool: "database.get_whitespace_and_growth", args: {}, write: false };
  if (has("backup")) return { tool: "database.get_backup_status", args: {}, write: false };
  if (has("dag")) return { tool: "dag.list", args: {}, write: false };
  if (has("cert", "expir")) return { tool: "exchange_get_exchange_certificate", args: {}, write: false };
  if (has("disk space", "disk free")) return { tool: "server.get_disk_space", args: {}, write: false };
  if (has("uptime", "reboot", "last boot")) return { tool: "server.get_uptime", args: {}, write: false };
  if (has("service") && has("status", "running")) return { tool: "server.get_services_status", args: {}, write: false };
  if (has("connector")) return { tool: "exchange_list_send_connectors", args: {}, write: false };
  if (has("transport rule")) return { tool: "exchange_get_transport_rules", args: {}, write: false };
  if (has("server") && has("list")) return { tool: "exchange_list_servers", args: {}, write: false };
  if (has("topology")) return { tool: "report.exchange_topology", args: {}, write: false };
  if (has("overview", "environment")) return { tool: "report.exchange_environment_overview", args: {}, write: false };
  if (has("ndr", "bounce", "bounced") || NDR_RE.test(prompt)) {
    const code = prompt.match(NDR_RE)?.[1];
    return { tool: "mailflow.get_ndr_details", args: code ? { code } : {}, write: false };
  }
  if (has("trace", "tracking", "delivery status", "did") && has("receiv", "trace", "tracking", "delivery", "did")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    return { tool: "mailflow.get_message_trace", args: { ...(email ? { sender: email } : {}), ...(q ? { subject: q } : {}) }, write: false };
  }
  if (has("permission", "access", "fullaccess", "sendas", "send as") && email) return { tool: "exchange_get_mailbox_permissions", args: { identity: email }, write: false };
  if (has("statistic", "how big", "item count", "last logon") && email) return { tool: "exchange_get_mailbox_statistics", args: { identity: email }, write: false };
  // Write intents (need confirm — enforced by caller)
  if (has("dismount")) { const id = afterWord(prompt, "dismount"); return { tool: "database.dismount", args: id ? { identity: id } : {}, write: true }; }
  if (has("mount") && !has("amount")) { const id = afterWord(prompt, "mount"); return { tool: "database.mount", args: id ? { identity: id } : {}, write: true }; }
  if (has("retry") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_retry_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("suspend") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_suspend_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("restart") && has("service")) { const m = prompt.match(/restart\s+(?:the\s+)?([A-Za-z*]+)/i); return { tool: "server.restart_service", args: { ...(m ? { name: m[1] } : {}), confirm: true }, write: true }; }
  if (has("move") && has("mailbox", "request")) return { tool: "mailbox.new_move_request", args: email ? { identity: email } : {}, write: true };
  if (has("quota") && has("set", "change", "increase", "raise")) return { tool: "mailbox.set_quota", args: email ? { identity: email } : {}, write: true };
  if (has("repair") && has("database", "mailbox")) return { tool: "database.new_repair_request", args: {}, write: true };
  if ((has("grant", "give", "add") && has("permission", "access")) && email) {
    const m = prompt.match(/to\s+([\w.+-]+@[\w-]+\.[\w.]+)/i);
    const rights = /sendas/i.test(prompt) ? "SendAs" : "FullAccess";
    return { tool: "mailbox.add_permission", args: { identity: email, ...(m ? { user: m[1] } : {}), accessRights: rights }, write: true };
  }
  if (email) return { tool: "ai.tell_me_everything", args: { identity: email }, write: false };
  return { help: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/queryRouter.test.ts`
Expected: PASS (26/26)

- [ ] **Step 5: Commit**

```bash
git add src/desktop/queryRouter.ts tests/queryRouter.test.ts
git commit -m "feat: keyword query router with tests"
```

---

### Task 2: Electron backend rewiring (`exchange:ask`)

**Files:**
- Modify: `src/desktop/main.ts` (`exchange:ask` handler only)
- Test: rerun `npx vitest run tests/queryRouter.test.ts` + `npm run build`

**Interfaces:**
- Consumes: `routeQuery`, `RouteResult` from `./queryRouter.js` (Task 1).
- Produces: IPC `exchange:ask` returns `{prompt, tool, result, needsConfirm?, needsInfo?, missing?}` (consumed by Task 3).

- [ ] **Step 1: Replace the `exchange:ask` handler**

```ts
import { routeQuery } from "./queryRouter.js";

const WRITE_REQUIRED_ARGS: Record<string, string[]> = {
  "database.mount": ["identity"],
  "database.dismount": ["identity"],
  "exchange_retry_queue": ["identity"],
  "exchange_suspend_queue": ["identity"],
  "server.restart_service": ["name"],
  "mailbox.new_move_request": ["identity", "targetDatabase"],
  "mailbox.set_quota": ["identity"],
  "database.new_repair_request": ["database"],
  "mailbox.add_permission": ["identity", "user"],
};

ipcMain.handle("exchange:ask", async (_e, payload: { prompt: string; confirmed?: boolean; tool?: string; args?: any }) => {
  console.log("exchange:ask invoked", payload);
  const prompt = payload.prompt ?? "";
  if(!prompt.trim()) throw new Error("Type a prompt first");
  await ensureMcpInitialized();

  // Explicit tool+args after in-card Confirm skips re-routing
  let tool: string; let args: any; let write = false;
  if(payload.tool){
    tool = payload.tool; args = payload.args ?? {};
    write = true;
  } else {
    const route = routeQuery(prompt);
    if("help" in route){
      return { prompt, tool: "help", result: {
        message: "I can run Exchange queries. Try one of these:",
        examples: ["what version of exchange do i have", "show delayed queues", "server health report", "database whitespace and growth", "certificates expiring soon", "explain bounce 5.7.1", "trace messages from bob@contoso.com", "tell me everything about alice@contoso.com", "dismount database DB01"],
      }};
    }
    tool = route.tool; args = route.args; write = route.write;
  }

  // Safety gate for writes
  if(write && !payload.confirmed){
    const missing = (WRITE_REQUIRED_ARGS[tool] ?? []).filter((k) => args[k] === undefined || args[k] === "");
    if(missing.length) return { prompt, tool, needsInfo: true, missing, result: { message: `To run ${tool} I still need: ${missing.join(", ")}. Add it to your prompt and run again.` } };
    return { prompt, tool, needsConfirm: true, result: { message: `Ready to run ${tool}`, parameters: args } };
  }
  if(write) args = { ...args, confirm: true };

  const result = await mcpRpc("tools/call", { name: tool, arguments: args });
  const text = (result as any)?.content?.[0]?.text;
  if(!text) return { prompt, tool, result };
  let data: any;
  try { data = JSON.parse(text); } catch { return { prompt, tool, result: text }; }
  return { prompt, tool, result: data };
});
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build`
Expected: clean `tsc` compile.

Run: `npx vitest run`
Expected: all suites pass (existing 4 + router 26).

- [ ] **Step 3: Commit**

```bash
git add src/desktop/main.ts
git commit -m "feat: exchange:ask routes any prompt with confirm-gated writes"
```

---

### Task 3: Renderer — human-friendly `renderResult`

**Files:**
- Modify: `src/desktop/renderer/index.html` script section only (add `esc`, `renderResult`, replace `runPrompt` body internals, add delegated Confirm/Cancel handler).
- Test: `node --check` on inline scripts + extended smoke test (Task 5).

**Interfaces:**
- Consumes: `{prompt, tool, result, needsConfirm?, needsInfo?, missing?}` envelope (Task 2).
- Produces: populated `#outResult` card HTML (no downstream consumers).

- [ ] **Step 1: Add helpers + formatters before the `runPrompt` handler**

```js
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function pill(text, ok){ return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${ok===true?"bg-emerald-500/10 text-emerald-400 border border-emerald-500/30":ok===false?"bg-red-500/10 text-red-400 border border-red-500/30":"bg-slate-500/10 text-slate-300 border border-slate-500/30"}">${esc(text)}</span>`; }
function kvTable(obj){
  if(obj===null||obj===undefined) return `<span class="text-slate-500">n/a</span>`;
  if(Array.isArray(obj)){
    if(!obj.length) return `<span class="text-slate-500">empty</span>`;
    if(obj.every((x)=>x!==null&&typeof x==="object"&&!Array.isArray(x))){
      const cols=[...new Set(obj.flatMap((x)=>Object.keys(x)))].slice(0,6);
      return `<table class="w-full text-xs"><thead><tr>${cols.map((c)=>`<th class="text-left text-slate-400 font-medium pb-1 pr-3">${esc(c)}</th>`).join("")}</tr></thead><tbody>${obj.slice(0,50).map((r)=>`<tr class="border-t border-[#1a253a]">${cols.map((c)=>`<td class="py-1 pr-3 font-mono text-slate-200">${esc(typeof r[c]==="object"?JSON.stringify(r[c]):r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return `<ul class="list-disc list-inside space-y-1 text-xs text-slate-200">${obj.slice(0,50).map((x)=>`<li class="font-mono">${esc(typeof x==="object"?JSON.stringify(x):x)}</li>`).join("")}</ul>`;
  }
  if(typeof obj==="object"){
    return `<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">${Object.entries(obj).slice(0,60).map(([k,v])=>`<dt class="text-slate-400">${esc(k)}</dt><dd class="font-mono text-slate-200 break-words">${esc(typeof v==="object"?JSON.stringify(v):v)}</dd>`).join("")}</dl>`;
  }
  return `<span class="font-mono text-slate-200">${esc(obj)}</span>`;
}
function rawBlock(data){
  return `<details class="mt-3"><summary class="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">Raw JSON</summary><pre class="mt-1 p-2 bg-[#0b0f19] rounded border border-[#1a253a] text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto"></pre></details>`;
}
function setRaw(data){
  const pre=document.querySelector("#outResult details pre");
  if(pre) pre.textContent=(typeof data==="string")?data:JSON.stringify(data,null,2);
}
function renderResult(tool, data){
  const out=document.getElementById("outResult");
  if(!out) return;
  let html="";
  if(tool==="help"&&data&&data.examples){
    html=`<p class="text-xs text-slate-300 mb-2">${esc(data.message||"Try one of these:")}</p><ul class="list-disc list-inside space-y-1 text-xs text-cyan-300 font-mono">${data.examples.map((e)=>`<li><button data-example="${esc(e)}" class="hover:underline">${esc(e)}</button></li>`).join("")}</ul>`;
  } else if(data&&typeof data==="object"&&data.executiveSummary&&data.findings){
    html=`<div class="flex items-center gap-2 mb-2"><span class="text-sm font-semibold text-white">${esc(data.executiveSummary.health||"Report")}</span></div><p class="text-xs text-slate-300 mb-3">${esc(data.executiveSummary.summary||"")}</p><h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Findings</h4><ul class="space-y-2 mb-3">${(data.findings||[]).map((f)=>`<li class="p-2 bg-[#0b0f19] rounded border border-[#1a253a] text-xs"><span class="mr-1">${esc(f.icon||"")}</span><strong class="text-slate-100">${esc(f.title||"")}</strong><span class="text-slate-300"> — ${esc(f.detail||"")}</span></li>`).join("")}</ul>${data.recommendedActions?`<h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Recommended actions</h4><ul class="list-disc list-inside text-xs text-slate-300 space-y-1">${data.recommendedActions.map((r)=>`<li>${esc(r)}</li>`).join("")}</ul>`:""}`;
  } else {
    html=kvTable(data);
  }
  out.innerHTML=html+rawBlock();
  setRaw(data);
}
```

- [ ] **Step 2: Replace the `runPrompt` body to use the envelope + confirm/info cards**

```js
safeHandler("runPrompt", async()=>{
  const promptEl=document.getElementById("prompt");
  const statusEl=document.getElementById("execText");
  const healthEl=document.getElementById("healthPill");
  const statusBadge=document.getElementById("outStatus");
  if(!promptEl || !statusEl) return;
  statusEl.textContent="Running…";
  if(healthEl) healthEl.textContent="Running…";
  const out=document.getElementById("outResult");
  if(out) out.textContent="Running…";
  if(statusBadge) statusBadge.textContent="Running…";
  const start=Date.now();
  const res = await window.exchangeDesktop.askExchange({prompt: promptEl.value});
  const elapsed = ((Date.now()-start)/1000).toFixed(2);
  const data = (res && res.result !== undefined) ? res.result : res;
  const tool = (res && res.tool) || "";
  if(res && res.needsConfirm){
    const out2=document.getElementById("outResult");
    if(out2) out2.innerHTML=`<div class="p-3 rounded border border-amber-500/40 bg-amber-500/5 text-xs"><p class="text-amber-300 font-semibold mb-1">Confirm action: ${esc(tool)}</p>${kvTable(data.parameters||{})}<div class="flex gap-2 mt-3"><button id="confirmWrite" class="px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs">Confirm</button><button id="cancelWrite" class="px-3 py-1.5 rounded-md bg-[#141d30] border border-[#22304d] text-xs text-slate-300">Cancel</button></div></div>`;
    if(statusBadge) statusBadge.textContent="Needs confirm";
  } else if(res && res.needsInfo){
    renderResult("info", { message: (data&&data.message)||"More info needed", missing: res.missing||[] });
    if(statusBadge) statusBadge.textContent="Needs info";
  } else {
    renderResult(tool, data);
    if(statusBadge) statusBadge.textContent="Completed";
  }
  if(healthEl) healthEl.textContent="Done";
  statusEl.textContent=`Execution Completed in ${elapsed}s`;
});
document.getElementById("outResult")?.addEventListener("click", async (e)=>{
  const ex=e.target.closest("[data-example]");
  if(ex){ const p=document.getElementById("prompt"); if(p){ p.value=ex.getAttribute("data-example")||""; } document.getElementById("runPrompt")?.click(); return; }
  if(e.target.closest("#cancelWrite")){ const o=document.getElementById("outResult"); if(o) o.textContent="Cancelled."; const s=document.getElementById("outStatus"); if(s) s.textContent="Idle"; return; }
  if(e.target.closest("#confirmWrite")){
    const p=(document.getElementById("prompt")||{}).value||"";
    const last window.__lastRoute = window.__lastRoute || null;
  }
});
```

Note: the Confirm button needs the pending `{tool, args}`. Store them on `window.__pendingWrite` when rendering the confirm card, and have the delegated handler call `window.exchangeDesktop.askExchange({prompt: p, confirmed: true, tool, args})` then `renderResult`. Implement exactly that (replace the placeholder line above with the real logic):

```js
if(e.target.closest("#confirmWrite")){
  const pw = window.__pendingWrite;
  if(!pw) return;
  const pEl=document.getElementById("prompt");
  const res2 = await window.exchangeDesktop.askExchange({prompt: pEl?pEl.value:"", confirmed: true, tool: pw.tool, args: pw.args});
  const data2 = (res2 && res2.result !== undefined) ? res2.result : res2;
  renderResult((res2 && res2.tool)||pw.tool, data2);
  const s=document.getElementById("outStatus"); if(s) s.textContent="Completed";
  window.__pendingWrite=null;
  return;
}
```

And in the `needsConfirm` branch, store the route before rendering:

```js
window.__pendingWrite = { tool, args: res.args || (data && data.parameters) || {} };
```

IMPORTANT: for this to work, `main.ts` must echo the routed `args` in the needsConfirm envelope. Adjust Task 2 Step 1: `return { prompt, tool, args, needsConfirm: true, result: {...} }` and same for needsInfo. (Task 2 code above already needs this one-line addition in both returns.)

- [ ] **Step 3: Verify inline scripts parse**

Run: `node -e "const fs=require('fs');const h=fs.readFileSync('src/desktop/renderer/index.html','utf8');const m=[...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];m.forEach((x,i)=>{fs.writeFileSync(process.env.TEMP+'/routerc-'+i+'.js',x[1])});console.log('scripts:',m.length)"` then `node --check` each file.
Expected: 3 scripts, all pass.

- [ ] **Step 4: Commit**

```bash
git add src/desktop/renderer/index.html
git commit -m "feat: friendly result cards with confirm flow and exact fallback"
```

---

### Task 4: Rust mirror (router + envelope)

**Files:**
- Modify: `tauri-client/src-tauri/src/main.rs` (`ask_exchange` + new `route_query` helper).
- Test: cannot run `cargo` here — keep code std-only + serde_json (no new crates) and mirror Task 2 logic exactly.

**Interfaces:**
- Consumes: `AskArgs { prompt, confirmed?, tool?, args? }` — extend the struct with `#[serde(default)] confirmed: bool, tool: Option<String>, args: Option<serde_json::Value>`.
- Produces: same envelope JSON as Task 2.

- [ ] **Step 1: Extend `AskArgs` and add `route_query` + required-args table**

```rust
#[derive(Deserialize)]
struct AskArgs {
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    confirmed: bool,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    args: Option<serde_json::Value>,
}

fn write_required_args(tool: &str) -> &'static [&'static str] {
    match tool {
        "database.mount" | "database.dismount" | "exchange_retry_queue" | "exchange_suspend_queue" => &["identity"],
        "server.restart_service" => &["name"],
        "mailbox.new_move_request" => &["identity", "targetDatabase"],
        "mailbox.set_quota" => &["identity"],
        "database.new_repair_request" => &["database"],
        "mailbox.add_permission" => &["identity", "user"],
        _ => &[],
    }
}

fn has_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

// Returns (tool, args, write) or None for help. Mirrors queryRouter.ts rule order.
fn route_query(prompt: &str) -> Option<(String, serde_json::Value, bool)> {
    let p = prompt.to_lowercase();
    let email = extract_identity(prompt);
    let obj = |pairs: Vec<(&str, String)>| {
        let mut m = serde_json::Map::new();
        for (k, v) in pairs {
            m.insert(k.to_string(), serde_json::Value::String(v));
        }
        serde_json::Value::Object(m)
    };
    if has_any(&p, &["version", "cumulative", " cu", "build", "patch"]) { return Some(("report.exchange_version_and_cu".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["queue", "delayed", "stuck", "backlog", "mailflow", "mail flow", "pending mail"]) { return Some(("exchange_get_queue".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["health", "healthy", "unhealthy"]) { return Some(("exchange_get_health_report".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["database", "databases", "db01", "db0"]) && has_any(&p, &["list"]) { return Some(("database.list".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["whitespace", "growth", "storage", "disk usage", "size of database"]) { return Some(("database.get_whitespace_and_growth".into(), serde_json::json!({}), false)); }
    if p.contains("backup") { return Some(("database.get_backup_status".into(), serde_json::json!({}), false)); }
    if p.contains("dag") { return Some(("dag.list".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["cert", "expir"]) { return Some(("exchange_get_exchange_certificate".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["disk space", "disk free"]) { return Some(("server.get_disk_space".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["uptime", "reboot", "last boot"]) { return Some(("server.get_uptime".into(), serde_json::json!({}), false)); }
    if p.contains("service") && has_any(&p, &["status", "running"]) { return Some(("server.get_services_status".into(), serde_json::json!({}), false)); }
    if p.contains("connector") { return Some(("exchange_list_send_connectors".into(), serde_json::json!({}), false)); }
    if p.contains("transport rule") { return Some(("exchange_get_transport_rules".into(), serde_json::json!({}), false)); }
    if p.contains("server") && p.contains("list") { return Some(("exchange_list_servers".into(), serde_json::json!({}), false)); }
    if p.contains("topology") { return Some(("report.exchange_topology".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["overview", "environment"]) { return Some(("report.exchange_environment_overview".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["ndr", "bounce", "bounced"]) || prompt.contains("5.") {
        let code: String = prompt.split_whitespace().find(|w| w.chars().filter(|c| *c == '.').count() == 2 && w.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)).unwrap_or("").trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.').to_string();
        let args = if code.is_empty() { serde_json::json!({}) } else { serde_json::json!({ "code": code }) };
        return Some(("mailflow.get_ndr_details".into(), args, false));
    }
    if has_any(&p, &["trace", "tracking", "delivery status"]) || (p.contains("did") && p.contains("receiv")) {
        return Some(("mailflow.get_message_trace".into(), email.map(|e| obj(vec![("sender", e)])).unwrap_or(serde_json::json!({})), false));
    }
    if has_any(&p, &["permission", "access", "fullaccess", "sendas", "send as"]) {
        if let Some(e) = email { return Some(("exchange_get_mailbox_permissions".into(), obj(vec![("identity", e)]), false)); }
    }
    if has_any(&p, &["statistic", "how big", "item count", "last logon"]) {
        if let Some(e) = email { return Some(("exchange_get_mailbox_statistics".into(), obj(vec![("identity", e)]), false)); }
    }
    if p.contains("dismount") { return Some(("database.dismount".into(), after_word(prompt, "dismount").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("mount") && !p.contains("amount") { return Some(("database.mount".into(), after_word(prompt, "mount").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("retry") && p.contains("queue") { return Some(("exchange_retry_queue".into(), after_word(prompt, "queue").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("suspend") && p.contains("queue") { return Some(("exchange_suspend_queue".into(), after_word(prompt, "queue").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if let Some(e) = email { return Some(("ai.tell_me_everything".into(), obj(vec![("identity", e)]), false)); }
    None
}

fn after_word(prompt: &str, word: &str) -> Option<String> {
    let lower = prompt.to_lowercase();
    lower.find(word).and_then(|i| {
        let rest = prompt[i + word.len()..].trim().trim_matches(|c: char| c == '"' || c == '\'' || c == ':' || c == ' ' || c == '.').to_string();
        if rest.is_empty() { None } else { Some(rest) }
    })
}
```

- [ ] **Step 2: Rewrite `ask_exchange` to the envelope**

```rust
#[tauri::command]
fn ask_exchange(args: AskArgs) -> Result<serde_json::Value, String> {
    let prompt = args.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Type a prompt first".to_string());
    }
    {
        let lock = mcp();
        let mut state = lock.map_err(|e| format!("MCP lock poisoned: {}", e))?;
        let alive = match state.child.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        };
        if !alive {
            spawn_mcp_locked(&mut state)?;
        }
        ensure_mcp_initialized(&mut state)?;
    }
    let (tool, mut rpc_args, write) = if let Some(t) = args.tool {
        (t, args.args.unwrap_or(serde_json::json!({})), true)
    } else {
        match route_query(&prompt) {
            Some((t, a, w)) => (t, a, w),
            None => {
                return Ok(serde_json::json!({
                    "prompt": prompt,
                    "tool": "help",
                    "result": {
                        "message": "I can run Exchange queries. Try one of these:",
                        "examples": ["what version of exchange do i have", "show delayed queues", "server health report", "database whitespace and growth", "certificates expiring soon", "explain bounce 5.7.1", "trace messages from bob@contoso.com", "tell me everything about alice@contoso.com", "dismount database DB01"],
                    },
                }));
            }
        }
    };
    if write && !args.confirmed {
        let required = write_required_args(&tool);
        let missing: Vec<String> = required
            .iter()
            .filter(|k| rpc_args.get(*k).and_then(|v| v.as_str()).map(|s| s.is_empty()).unwrap_or(true))
            .map(|k| k.to_string())
            .collect();
        if !missing.is_empty() {
            return Ok(serde_json::json!({ "prompt": prompt, "tool": tool, "args": rpc_args, "needsInfo": true, "missing": missing, "result": { "message": format!("To run {} I still need: {}. Add it to your prompt and run again.", tool, missing.join(", ")) } }));
        }
        return Ok(serde_json::json!({ "prompt": prompt, "tool": tool, "args": rpc_args, "needsConfirm": true, "result": { "message": format!("Ready to run {}", tool), "parameters": rpc_args } }));
    }
    if write {
        if let Some(map) = rpc_args.as_object_mut() {
            map.insert("confirm".to_string(), serde_json::Value::Bool(true));
        }
    }
    let result = mcp_rpc("tools/call", serde_json::json!({ "name": tool, "arguments": rpc_args }))?;
    let text = result.get("content").and_then(|c| c.get(0)).and_then(|b| b.get("text")).and_then(|t| t.as_str());
    let data: serde_json::Value = match text {
        Some(t) => serde_json::from_str(t).unwrap_or(serde_json::Value::String(t.to_string())),
        None => result,
    };
    Ok(serde_json::json!({ "prompt": prompt, "tool": tool, "result": data }))
}
```

Delete the old `extract_identity` Rust helper if now unused (keep it only if `route_query` uses it — the code above uses it, so keep).

- [ ] **Step 3: Commit**

```bash
git add tauri-client/src-tauri/src/main.rs
git commit -m "feat: Rust mirror of router envelope with confirm-gated writes"
```

---

### Task 5: Sync, smoke test, full verification, relaunch

**Files:**
- Modify: `scripts/tauri-frontend-check.cjs` (assert `#outResult`, `renderResult`, `needsConfirm` wiring).
- Sync: `tauri-client/src/index.html` from renderer + re-apply `initTauriBridge` shim.

**Interfaces:** none downstream; final gate.

- [ ] **Step 1: Sync the Tauri copy**

Run: `node -e "const fs=require('fs');let s=fs.readFileSync('src/desktop/renderer/index.html','utf8');fs.writeFileSync('tauri-client/src/index.html',s);console.log('synced',s.length)"`
Then re-apply the `initTauriBridge` shim insert (same block as before, before `var isDesktop`).

- [ ] **Step 2: Extend the smoke test** — add after the bridge-coverage check:

```js
for (const needle of ['id="outResult"', "renderResult", "needsConfirm", "data-example", "Raw JSON"]) {
  if (!html.includes(needle)) fail(`missing renderer piece: ${needle}`);
}
console.log("friendly-card pieces OK");
```

- [ ] **Step 3: Run all checks**

Run: `npm run build`
Expected: clean compile (also type-checks `queryRouter.ts` import in `main.ts`).

Run: `npx vitest run`
Expected: all pass (existing 4 + router 26 = 30).

Run: `node scripts/tauri-frontend-check.cjs`
Expected: PASS.

- [ ] **Step 4: Commit and relaunch**

```bash
git add -A
git commit -m "feat: friendly cards for all tools with confirm-gated writes"
```

Run: `npm run desktop`
Expected: window opens, MCP auto-starts, "what version of exchange" renders a version table card.

---

## Self-Review

- **Spec coverage:** router table → Task 1; envelope + init + confirm/info → Tasks 2/4; shaped + exact fallback + escaping → Task 3; tests → Tasks 1/5; Rust mirror → Task 4. Help card → Tasks 2/3. All covered.
- **Placeholder scan:** every step has exact code/file/command/expected text. The Task 3 Step 2 placeholder line is explicitly replaced by the real block in the same step. `window.__pendingWrite`/`res.args` contract fixed by the Task 2 adjustment note (echo `args` in confirm/info envelopes — implementer must apply it).
- **Type consistency:** envelope `{prompt, tool, result, needsConfirm?, needsInfo?, missing?, args?}` identical in Tasks 2/3/4. `routeQuery` return shapes match tests. Rust `route_query` returns `(String, Value, bool)` mirroring `{tool, args, write}`.
