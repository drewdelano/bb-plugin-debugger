import { access } from "node:fs/promises";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, type DebuggerTarget } from "./contract.js";

const ENGINE_VERSION = "0.26.0";

interface RetainedWorker {
  dispose(): Promise<void>;
}

interface DebuggerProcess {
  client: Client;
  transport: StdioClientTransport;
  lease: RetainedWorker;
  workspacePath: string;
  enginePath: string;
}

const processes = new Map<string, Promise<DebuggerProcess>>();

async function startProcess(
  target: DebuggerTarget,
  retainWorker: () => RetainedWorker,
): Promise<DebuggerProcess> {
  await access(target.workspacePath);
  await access(target.enginePath);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [target.enginePath, "stdio"],
    cwd: target.workspacePath,
    env: {
      ...process.env,
      MCP_DEBUG_SESSION_IDLE_MS: "900000",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "bb-plugin-debugger", version: "0.1.0" });
  const lease = retainWorker();
  try {
    await client.connect(transport);
    return {
      client,
      transport,
      lease,
      workspacePath: target.workspacePath,
      enginePath: target.enginePath,
    };
  } catch (error) {
    await lease.dispose();
    await transport.close().catch(() => undefined);
    throw error;
  }
}

async function getProcess(
  target: DebuggerTarget,
  retainWorker: () => RetainedWorker,
): Promise<DebuggerProcess> {
  const existing = processes.get(target.threadId);
  if (existing !== undefined) {
    const running = await existing;
    if (
      running.workspacePath !== target.workspacePath ||
      running.enginePath !== target.enginePath
    ) {
      await closeProcess(target.threadId);
    } else {
      return running;
    }
  }
  const starting = startProcess(target, retainWorker);
  processes.set(target.threadId, starting);
  try {
    return await starting;
  } catch (error) {
    processes.delete(target.threadId);
    throw error;
  }
}

async function closeProcess(threadId: string): Promise<boolean> {
  const starting = processes.get(threadId);
  if (starting === undefined) return false;
  processes.delete(threadId);
  const running = await starting.catch(() => null);
  if (running === null) return false;
  try {
    await running.client.close();
  } finally {
    await running.lease.dispose();
  }
  return true;
}

async function closeAll(): Promise<void> {
  await Promise.all([...processes.keys()].map((threadId) => closeProcess(threadId)));
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async doctor(target, context) {
      const running = await getProcess(target, () => context.experimental_retainWorker());
      const listed = await running.client.listTools();
      const languages = await running.client.callTool({
        name: "list_supported_languages",
        arguments: {},
      });
      return {
        engineVersion: ENGINE_VERSION,
        tools: listed.tools.map((tool) => tool.name).sort(),
        languages: JSON.parse(JSON.stringify(languages)) as unknown,
      };
    },
    async callTool(input, context) {
      const running = await getProcess(input, () => context.experimental_retainWorker());
      const result = await running.client.callTool({
        name: input.tool,
        arguments: input.arguments,
      });
      return JSON.parse(JSON.stringify(result)) as unknown;
    },
    async closeThread({ threadId }) {
      return { closed: await closeProcess(threadId) };
    },
  },
  dispose: closeAll,
});
