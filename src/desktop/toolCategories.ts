// Operation category per MCP tool: create | read | update | delete.
// Pure + testable. Derived from the action verb in the tool name
// (exchange_<verb>_… or <family>.<verb>_…), so newly registered tools fall
// into a category automatically with no registry edits. Curated overrides
// below cover the ambiguous few — add an entry here (not new rules) when a
// future tool's verb misleads. tests/toolCategories.test.ts pins behavior.

export type ToolOperation = "create" | "read" | "update" | "delete";

export const TOOL_OPERATION_OVERRIDES: Record<string, ToolOperation> = {
  // Enabling cert services modifies the certificate (verb says "enable").
  "certificate.enable_services": "update",
};

const DELETE_VERBS = new Set(["remove", "delete", "disable"]);
const CREATE_VERBS = new Set(["create", "new", "add", "send", "reply", "forward", "enable"]);
const UPDATE_VERBS = new Set([
  "set",
  "update",
  "modify",
  "mount",
  "dismount",
  "suspend",
  "resume",
  "retry",
  "restart",
  "move",
  "undo",
  "restore",
  "connect",
]);

function actionVerb(tool: string): string {
  const parts = String(tool ?? "").toLowerCase().split(/[._]/);
  return parts.length > 1 ? parts[1] : parts[0] ?? "";
}

export function categorizeTool(tool: string): ToolOperation {
  const override = TOOL_OPERATION_OVERRIDES[tool];
  if (override) return override;
  const verb = actionVerb(tool);
  if (DELETE_VERBS.has(verb)) return "delete";
  if (CREATE_VERBS.has(verb)) return "create";
  if (UPDATE_VERBS.has(verb)) return "update";
  return "read";
}
