import path from "node:path";

export function requirePathInsideWorkspace(
  workspacePath: string,
  candidatePath: string,
): string {
  const workspace = path.resolve(workspacePath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(workspace, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error(`Path must stay inside the workspace: ${candidatePath}`);
}

const pathKeys = new Set([
  "cwd",
  "file",
  "filePath",
  "path",
  "program",
  "scriptPath",
  "sourcePath",
  "workingDirectory",
]);

export function validateDebuggerArguments(
  workspacePath: string,
  tool: string,
  argumentsValue: Record<string, unknown>,
): void {
  if (tool === "list_supported_languages" || tool === "list_debug_sessions") return;
  visit(argumentsValue, null);

  function visit(value: unknown, key: string | null): void {
    if (typeof value === "string" && key !== null && pathKeys.has(key)) {
      requirePathInsideWorkspace(workspacePath, path.resolve(workspacePath, value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey);
      }
    }
  }
}
