import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const require = createRequire(import.meta.url);

export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

export interface DebuggerTestClient {
  call<T>(name: string, argumentsValue: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

export async function createDebuggerTestClient(
  enginePath = require.resolve("@debugmcp/mcp-debugger/dist/cli"),
): Promise<DebuggerTestClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [enginePath, "stdio"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "bb-plugin-debugger-tests", version: "0.1.0" });
  await client.connect(transport);

  return {
    async call<T>(name: string, argumentsValue: Record<string, unknown>): Promise<T> {
      const result = (await client.callTool({
        name,
        arguments: argumentsValue,
      })) as { content: Array<{ type: string; text?: string }> };
      const text = result.content.find((part) => part.type === "text");
      if (text === undefined || text.type !== "text") {
        throw new Error(`${name} did not return JSON text`);
      }
      return JSON.parse(text.text ?? "") as T;
    },
    close: () => client.close(),
  };
}

export const javascriptFixture = path.resolve(
  "test-fixtures",
  "javascript",
  "state.cjs",
);

export async function createPausedJavascriptSession(
  debuggerClient: DebuggerTestClient,
  condition?: string,
): Promise<string> {
  const created = await debuggerClient.call<{ sessionId: string }>(
    "create_debug_session",
    { language: "javascript" },
  );
  await debuggerClient.call("set_breakpoint", {
    sessionId: created.sessionId,
    file: javascriptFixture,
    statement: "state.count += index;",
    ...(condition === undefined ? {} : { condition }),
  });
  await debuggerClient.call("start_debugging", {
    sessionId: created.sessionId,
    scriptPath: javascriptFixture,
  });
  return created.sessionId;
}

export async function closeSession(
  debuggerClient: DebuggerTestClient,
  sessionId: string,
): Promise<void> {
  await debuggerClient.call("close_debug_session", { sessionId });
}

export function variableNamed(
  variables: DebugVariable[],
  name: string,
): DebugVariable {
  const variable = variables.find((candidate) => candidate.name === name);
  if (variable === undefined) throw new Error(`Missing variable ${name}`);
  return variable;
}
