#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Config helpers (mirror src/desktop/main.ts ensureConfig)
// ---------------------------------------------------------------------------

fn user_config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("exchange-desktop");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".config").join("exchange-desktop");
    }
    // Fallback: current dir
    PathBuf::from(".config").join("exchange-desktop")
}

fn ensure_config() -> PathBuf {
    // Desktop settings file — model/provider keys ONLY. Seeded empty; the
    // MCP server uses its own tool config for Exchange auth.
    let dir = user_config_dir();
    let _ = fs::create_dir_all(&dir);
    let p = dir.join("config.yaml");
    if !p.exists() {
        let _ = fs::write(&p, "{}");
    }
    p
}

// ---------------------------------------------------------------------------
// MCP child-process state (single persistent stdio JSON-RPC child)
// ---------------------------------------------------------------------------

struct McpState {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    reader: Option<BufReader<ChildStdout>>,
    next_id: u64,
    config_path: String,
    initialized: bool,
}

impl McpState {
    fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            reader: None,
            next_id: 1,
            config_path: String::new(),
            initialized: false,
        }
    }
}

static MCP: OnceLock<Mutex<McpState>> = OnceLock::new();

fn mcp() -> &'static Mutex<McpState> {
    MCP.get_or_init(|| Mutex::new(McpState::new()))
}

fn spawn_mcp_locked(state: &mut McpState) -> Result<u32, String> {
    // Kill previous child if any
    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    state.stdin = None;
    state.reader = None;

    // Desktop settings path (model/provider keys only — used for config_path
    // reporting, NOT passed to the MCP child).
    let config_path = ensure_config();
    state.config_path = config_path.to_string_lossy().to_string();

    // dist/server.js is built by `npm run build` from the repo root.
    // When running via `cargo tauri dev`, cwd is tauri-client/src-tauri,
    // so try several candidate server paths.
    let candidates = [
        PathBuf::from("../../dist/server.js"),
        PathBuf::from("../dist/server.js"),
        PathBuf::from("dist/server.js"),
        PathBuf::from("../../ExchangeServer/dist/server.js"),
    ];
    let server_path = candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("../../dist/server.js"));

    // No --config on purpose: the MCP server resolves its own tool config
    // (./config.yaml + env) which holds the Exchange connection + auth.
    let mut child = Command::new("node")
        .arg(&server_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn MCP ({}): {}", server_path.display(), e))?;

    let pid = child.id();
    let stdin = child.stdin.take().ok_or("MCP stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("MCP stdout unavailable")?;
    state.child = Some(child);
    state.stdin = Some(stdin);
    state.reader = Some(BufReader::new(stdout));
    state.initialized = false;
    Ok(pid)
}

fn mcp_rpc(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let lock = mcp();
    let mut state = lock.map_err(|e| format!("MCP lock poisoned: {}", e))?;

    // Ensure child is alive; (re)spawn if missing or exited
    let alive = match state.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            _ => false,
        },
        None => false,
    };
    if !alive {
        spawn_mcp_locked(&mut state)?;
    }

    let id = state.next_id;
    state.next_id += 1;

    let request =
        serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
    let line = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";

    let stdin = state.stdin.as_mut().ok_or("MCP stdin unavailable")?;
    stdin
        .write_all(line.as_bytes())
        .map_err(|e| format!("MCP write failed: {}", e))?;
    stdin.flush().map_err(|e| format!("MCP flush failed: {}", e))?;

    read_matching_response(&mut state, id)
}

fn read_matching_response(state: &mut McpState, id: u64) -> Result<serde_json::Value, String> {
    let reader = state.reader.as_mut().ok_or("MCP stdout unavailable")?;
    let mut buf = String::new();
    loop {
        buf.clear();
        let n = reader
            .read_line(&mut buf)
            .map_err(|e| format!("MCP read failed: {}", e))?;
        if n == 0 {
            return Err("MCP process closed stdout".to_string());
        }
        let trimmed = buf.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue, // non-JSON log line — ignore
        };
        if msg.get("id").and_then(|v| v.as_u64()) == Some(id) {
            if let Some(err) = msg.get("error") {
                return Err(serde_json::to_string(err).unwrap_or_else(|_| "MCP error".to_string()));
            }
            return Ok(msg.get("result").cloned().unwrap_or(serde_json::Value::Null));
        }
        // Response for another id (shouldn't happen with serialized access) — ignore
    }
}

fn ensure_mcp_initialized(state: &mut McpState) -> Result<(), String> {
    if state.initialized {
        return Ok(());
    }
    let id = state.next_id;
    state.next_id += 1;
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "exchange-desktop", "version": "0.1.0" },
        },
    });
    let line = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
    let stdin = state.stdin.as_mut().ok_or("MCP stdin unavailable")?;
    stdin
        .write_all(line.as_bytes())
        .map_err(|e| format!("MCP write failed: {}", e))?;
    stdin.flush().map_err(|e| format!("MCP flush failed: {}", e))?;
    read_matching_response(state, id)?;
    // Initialized notification — fire and forget (no response expected)
    let stdin = state.stdin.as_mut().ok_or("MCP stdin unavailable")?;
    stdin
        .write_all(b"{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n")
        .map_err(|e| format!("MCP write failed: {}", e))?;
    stdin.flush().map_err(|e| format!("MCP flush failed: {}", e))?;
    state.initialized = true;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands (mirror Electron preload.ts bridge)
// ---------------------------------------------------------------------------

#[tauri::command]
fn config_path() -> String {
    ensure_config().to_string_lossy().to_string()
}

#[tauri::command]
fn load_config() -> String {
    let p = ensure_config();
    fs::read_to_string(p).unwrap_or_default()
}

#[tauri::command]
fn save_config(content: String) -> Result<serde_json::Value, String> {
    let p = ensure_config();
    fs::write(&p, content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "path": p.to_string_lossy() }))
}

#[tauri::command]
fn providers_list() -> Vec<String> {
    vec![
        "OpenAI".into(),
        "Anthropic".into(),
        "Google".into(),
        "Azure OpenAI".into(),
        "AWS Bedrock".into(),
        "Ollama".into(),
        "Ollama Cloud".into(),
        "Mistral".into(),
        "Cohere".into(),
        "Groq".into(),
        "Together".into(),
        "OpenRouter".into(),
        "Custom".into(),
        "OpenCode".into(),
    ]
}

#[derive(Deserialize)]
struct TestProviderArgs {
    provider: Option<String>,
    #[serde(default)]
    apikey: Option<String>,
    #[serde(default)]
    apiKey: Option<String>,
    #[serde(default)]
    baseurl: Option<String>,
    #[serde(default)]
    baseUrl: Option<String>,
}

fn provider_url_map(provider: &str) -> &str {
    match provider {
        "OpenAI" => "https://api.openai.com/v1/models",
        "Anthropic" => "https://api.anthropic.com/v1/models",
        "Google" => "https://generativelanguage.googleapis.com/v1/models",
        "Azure OpenAI" => "https://api.openai.azure.com/openai/models?api-version=2023-05-15",
        "AWS Bedrock" => "https://bedrock-runtime.us-east-1.amazonaws.com/models",
        "Ollama" => "http://localhost:11434/api/tags",
        "Ollama Cloud" => "https://api.ollama.com/v1/models",
        "Mistral" => "https://api.mistral.ai/v1/models",
        "Cohere" => "https://api.cohere.ai/v1/models",
        "Groq" => "https://api.groqu.com/openai/v1/models",
        "Together" => "https://api.together.xyz/v1/models",
        "OpenRouter" => "https://openrouter.ai/api/v1/models",
        "OpenCode" => "http://localhost:4096/models",
        _ => "https://api.openai.com/v1/models",
    }
}

#[tauri::command]
fn test_provider(args: TestProviderArgs) -> serde_json::Value {
    let provider = args.provider.unwrap_or_else(|| "OpenAI".to_string());
    let api_key = args.apikey.or(args.apiKey).unwrap_or_default();
    let base_url = args.baseurl.or(args.baseUrl);
    let url = base_url.unwrap_or_else(|| provider_url_map(&provider).to_string());

    let mut req = reqwest::blocking::Client::new().get(&url);
    if provider == "Anthropic" {
        req = req.header("x-api-key", api_key);
    } else if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    match req.send() {
        Ok(res) => {
            let status = res.status().as_u16();
            let json: serde_json::Value = res.json().unwrap_or(serde_json::Value::Null);
            let mut models: Vec<serde_json::Value> = Vec::new();
            if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
                models = arr.clone();
            } else if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
                models = arr.clone();
            } else if let Some(arr) = json.as_array() {
                models = arr.clone();
            } else if let Some(obj) = json.as_object() {
                for v in obj.values() {
                    if let Some(arr) = v.as_array() {
                        models = arr.clone();
                        break;
                    }
                }
            }
            let normalized: Vec<serde_json::Value> = models
                .into_iter()
                .take(50)
                .map(|m| {
                    let id = m
                        .get("id")
                        .or_else(|| m.get("name"))
                        .or_else(|| m.get("model"))
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .unwrap_or_else(|| m.to_string());
                    serde_json::json!({ "id": id, "name": id })
                })
                .collect();
            let raw = serde_json::to_string(&json).unwrap_or_default();
            let raw_short: String = raw.chars().take(600).collect();
            serde_json::json!({ "ok": status >= 200 && status < 300, "status": status, "models": normalized, "raw": raw_short })
        }
        Err(e) => serde_json::json!({ "ok": false, "error": e.to_string() }),
    }
}

#[derive(Serialize)]
struct StartMcpResult {
    pid: u32,
    #[serde(rename = "configPath")]
    config_path: String,
}

#[tauri::command]
fn start_mcp() -> Result<StartMcpResult, String> {
    let lock = mcp();
    let mut state = lock.map_err(|e| format!("MCP lock poisoned: {}", e))?;
    let pid = spawn_mcp_locked(&mut state)?;
    Ok(StartMcpResult {
        pid,
        config_path: state.config_path.clone(),
    })
}

#[tauri::command]
fn stop_mcp() -> serde_json::Value {
    if let Ok(mut state) = mcp().lock() {
        if let Some(mut child) = state.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        state.stdin = None;
        state.reader = None;
        state.initialized = false;
    }
    serde_json::json!({ "ok": true })
}

#[tauri::command]
fn is_mcp_running() -> bool {
    if let Ok(mut state) = mcp().lock() {
        if let Some(child) = state.child.as_mut() {
            return matches!(child.try_wait(), Ok(None));
        }
    }
    false
}

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

fn extract_ndr_code(prompt: &str) -> Option<String> {
    for tok in prompt.split_whitespace() {
        let t = tok.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.');
        let dots = t.chars().filter(|c| *c == '.').count();
        if dots == 2 && t.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            return Some(t.to_string());
        }
    }
    None
}

fn extract_quoted(prompt: &str) -> Option<String> {
    let bytes = prompt.as_bytes();
    let mut start: Option<usize> = None;
    let mut quote = 0u8;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'"' || *b == b'\'' {
            if start.is_none() { start = Some(i + 1); quote = *b; }
            else if *b == quote { return Some(prompt[start.unwrap()..i].to_string()); }
        }
    }
    None
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
    if p.contains("replication") { return Some(("exchange_test_replication_health".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["health", "healthy", "unhealthy"]) && has_any(&p, &["full", "report", "detail", "dag"]) { return Some(("exchange_get_health_report".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["health", "healthy", "unhealthy"]) { return Some(("exchange_test_service_health".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["database", "databases", "db01", "db0"]) && has_any(&p, &["list", "number", "count", "how many", "show", "all"]) { return Some(("database.list".into(), serde_json::json!({}), false)); }
    if p.contains("databases") && !has_any(&p, &["dismount", "mount", "backup", "whitespace", "growth", "repair"]) { return Some(("database.list".into(), serde_json::json!({}), false)); }
    if p.contains("disk") { return Some(("server.get_disk_space".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["whitespace", "growth", "storage", "size of database", "forecast", "capacity"]) { return Some(("database.get_whitespace_and_growth".into(), serde_json::json!({}), false)); }
    if p.contains("backup") { return Some(("database.get_backup_status".into(), serde_json::json!({}), false)); }
    if p.contains("dag") { return Some(("dag.list".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["cert", "expir"]) { return Some(("exchange_get_exchange_certificate".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["uptime", "reboot", "last boot"]) { return Some(("server.get_uptime".into(), serde_json::json!({}), false)); }
    if p.contains("service") && has_any(&p, &["status", "running"]) { return Some(("exchange_test_service_health".into(), serde_json::json!({}), false)); }
    if p.contains("connector") { return Some(("exchange_list_send_connectors".into(), serde_json::json!({}), false)); }
    if p.contains("transport rule") { return Some(("exchange_get_transport_rules".into(), serde_json::json!({}), false)); }
    if p.contains("server") && p.contains("list") { return Some(("exchange_list_servers".into(), serde_json::json!({}), false)); }
    if p.contains("topology") { return Some(("report.exchange_topology".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["overview", "environment"]) { return Some(("report.exchange_environment_overview".into(), serde_json::json!({}), false)); }
    if has_any(&p, &["ndr", "bounce", "bounced"]) || extract_ndr_code(prompt).is_some() {
        let args = match extract_ndr_code(prompt) {
            Some(code) => serde_json::json!({ "code": code }),
            None => serde_json::json!({}),
        };
        return Some(("mailflow.get_ndr_details".into(), args, false));
    }
    if has_any(&p, &["trace", "tracking", "delivery status"]) || (p.contains("did") && p.contains("receiv")) {
        let mut trace_args = serde_json::json!({});
        if let Some(e) = email.clone() { trace_args["sender"] = serde_json::Value::String(e); }
        if let Some(s) = extract_quoted(prompt).filter(|s| !s.is_empty()) { trace_args["subject"] = serde_json::Value::String(s); }
        return Some(("mailflow.get_message_trace".into(), trace_args, false));
    }
    if has_any(&p, &["permission", "access", "fullaccess", "sendas", "send as"]) {
        if let Some(e) = email.clone() { return Some(("exchange_get_mailbox_permissions".into(), obj(vec![("identity", e)]), false)); }
    }
    if has_any(&p, &["statistic", "how big", "item count", "last logon"]) {
        if let Some(e) = email.clone() { return Some(("exchange_get_mailbox_statistics".into(), obj(vec![("identity", e)]), false)); }
    }
    if p.contains("dismount") { return Some(("database.dismount".into(), after_word(prompt, "dismount").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("mount") && !p.contains("amount") { return Some(("database.mount".into(), after_word(prompt, "mount").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("retry") && p.contains("queue") { return Some(("exchange_retry_queue".into(), after_word(prompt, "queue").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("suspend") && p.contains("queue") { return Some(("exchange_suspend_queue".into(), after_word(prompt, "queue").map(|s| obj(vec![("identity", s)])).unwrap_or(serde_json::json!({})), true)); }
    if p.contains("restart") && p.contains("service") {
        let name = prompt.split_whitespace().skip_while(|w| !w.eq_ignore_ascii_case("service")).nth(1).map(|s| s.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '*' && c != '-').to_string()).filter(|s| !s.is_empty());
        let mut m = serde_json::Map::new();
        if let Some(n) = name { m.insert("name".to_string(), serde_json::Value::String(n)); }
        m.insert("confirm".to_string(), serde_json::Value::Bool(true));
        return Some(("server.restart_service".into(), serde_json::Value::Object(m), true));
    }
    if p.contains("move") && has_any(&p, &["mailbox", "request"]) {
        return Some(("mailbox.new_move_request".into(), email.clone().map(|e| obj(vec![("identity", e)])).unwrap_or(serde_json::json!({})), true));
    }
    if p.contains("quota") && has_any(&p, &["set", "change", "increase", "raise"]) {
        return Some(("mailbox.set_quota".into(), email.clone().map(|e| obj(vec![("identity", e)])).unwrap_or(serde_json::json!({})), true));
    }
    if p.contains("repair") && has_any(&p, &["database", "mailbox"]) {
        return Some(("database.new_repair_request".into(), serde_json::json!({}), true));
    }
    if has_any(&p, &["grant", "give", "add"]) && has_any(&p, &["permission", "access"]) {
        if let Some(e) = email.clone() {
            let mut m = serde_json::Map::new();
            m.insert("identity".to_string(), serde_json::Value::String(e));
            m.insert("accessRights".to_string(), serde_json::Value::String(if p.contains("sendas") || p.contains("send as") { "SendAs".to_string() } else { "FullAccess".to_string() }));
            return Some(("mailbox.add_permission".into(), serde_json::Value::Object(m), true));
        }
    }
    if has_any(&p, &["mailbox", "mailboxes"]) && has_any(&p, &["list", "number", "count", "how many", "show", "all"]) { return Some(("exchange_list_mailboxes".into(), serde_json::json!({}), false)); }
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

fn extract_identity(prompt: &str) -> Option<String> {
    // Pull user@domain out of free text; fall back to the raw prompt
    let bytes = prompt.as_bytes();
    let mut at: Option<usize> = None;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'@' {
            at = Some(i);
            break;
        }
    }
    let at = at?;
    let mut start = at;
    while start > 0 {
        let c = bytes[start - 1] as char;
        if c.is_alphanumeric() || c == '.' || c == '_' || c == '%' || c == '+' || c == '-' {
            start -= 1;
        } else {
            break;
        }
    }
    let mut end = at + 1;
    while end < bytes.len() {
        let c = bytes[end] as char;
        if c.is_alphanumeric() || c == '.' || c == '-' {
            end += 1;
        } else {
            break;
        }
    }
    let candidate = &prompt[start..end];
    if candidate.contains('@') && candidate.contains('.') {
        Some(candidate.to_string())
    } else {
        None
    }
}

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
    // Per-query PowerShell trace: clear, run, then read (take semantics).
    // Failures are returned (not propagated) so the trace still reaches the card.
    let _ = mcp_rpc(
        "tools/call",
        serde_json::json!({ "name": "exchange_get_ps_trace", "arguments": {} }),
    );
    let call = mcp_rpc("tools/call", serde_json::json!({ "name": tool, "arguments": rpc_args }));
    let ps_trace = read_ps_trace();
    match call {
        Ok(v) => {
            let text = v
                .get("content")
                .and_then(|c| c.get(0))
                .and_then(|b| b.get("text"))
                .and_then(|t| t.as_str());
            let data: serde_json::Value = match text {
                Some(t) => serde_json::from_str(t).unwrap_or(serde_json::Value::String(t.to_string())),
                None => v,
            };
            Ok(serde_json::json!({ "prompt": prompt, "tool": tool, "result": data, "psTrace": ps_trace }))
        }
        Err(e) => Ok(serde_json::json!({ "prompt": prompt, "tool": tool, "error": e, "psTrace": ps_trace })),
    }
}

fn read_ps_trace() -> serde_json::Value {
    match mcp_rpc(
        "tools/call",
        serde_json::json!({ "name": "exchange_get_ps_trace", "arguments": {} }),
    ) {
        Ok(v) => v
            .get("content")
            .and_then(|c| c.get(0))
            .and_then(|b| b.get("text"))
            .and_then(|t| t.as_str())
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(serde_json::json!([])),
        Err(_) => serde_json::json!([]),
    }
}

#[derive(Deserialize)]
struct DoctorArgs {
    #[serde(default)]
    endpoint: Option<String>,
    #[serde(default)]
    insecure: Option<bool>,
}

#[tauri::command]
fn run_doctor(args: DoctorArgs) -> serde_json::Value {
    // Mirror src/cli/doctor.ts testConnectivity (EWS + REST reachability).
    let endpoint = args
        .endpoint
        .unwrap_or_else(|| "https://mail.contoso.com".to_string());
    let base = endpoint.trim_end_matches('/');
    let client = reqwest::blocking::Client::builder()
        .danger_accept_invalid_certs(args.insecure.unwrap_or(false))
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let mut out = HashMap::new();
    out.insert("endpoint".to_string(), serde_json::json!(endpoint));
    match client {
        Ok(c) => {
            let ews = c
                .post(format!("{}/EWS/Exchange.asmx", base))
                .header("Content-Type", "text/xml")
                .body("<probe/>")
                .send();
            out.insert(
                "ews".to_string(),
                match ews {
                    Ok(r) => serde_json::json!({ "status": r.status().as_u16() }),
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                },
            );
            let rest = c.get(format!("{}/api/v2.0", base)).send();
            out.insert(
                "rest".to_string(),
                match rest {
                    Ok(r) => serde_json::json!({ "status": r.status().as_u16() }),
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                },
            );
        }
        Err(e) => {
            out.insert("error".to_string(), serde_json::json!(e.to_string()));
        }
    }
    serde_json::to_value(out).unwrap_or(serde_json::Value::Null)
}

fn main() {
    // Auto-start MCP so the UI finds it running (mirrors Electron behavior).
    if let Ok(mut state) = mcp().lock() {
        let _ = spawn_mcp_locked(&mut state);
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            config_path,
            load_config,
            save_config,
            providers_list,
            test_provider,
            start_mcp,
            stop_mcp,
            is_mcp_running,
            ask_exchange,
            run_doctor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_url_map_defaults_to_openai() {
        assert_eq!(
            provider_url_map("Unknown-Provider"),
            "https://api.openai.com/v1/models"
        );
    }

    #[test]
    fn providers_list_has_14_entries() {
        assert_eq!(providers_list().len(), 14);
    }
}
