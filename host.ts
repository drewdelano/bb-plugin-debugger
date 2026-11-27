import { access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, type DebuggerTarget } from "./contract.js";
import {
  debuggerCliSource,
  exitCodeShimSource,
  jsDebugFiles,
  proxyFiles,
} from "./generated/debugger-engine.js";
import {
  DebuggerSupervisor,
  type DebuggerProcess,
  type RetainedWorker,
} from "./lib/debugger-supervisor.js";

const ENGINE_VERSION = "0.26.0";
let materializedEngine: Promise<string> | undefined;

async function materializeBundledEngine(): Promise<string> {
  materializedEngine ??= (async () => {
    const engineRoot = path.join(tmpdir(), "bb-plugin-debugger", ENGINE_VERSION);
    const distributionDirectory = path.join(engineRoot, "dist");
    const cliPath = path.join(distributionDirectory, "cli.mjs");
    const assetsDirectory = path.join(distributionDirectory, "assets");
    const jsDebugDirectory = path.join(distributionDirectory, "vendor", "js-debug");
    const proxyDirectory = path.join(distributionDirectory, "proxy");
    await mkdir(assetsDirectory, { recursive: true });
    await Promise.all(
      jsDebugFiles.map(async ([relativePath, content]) => {
        const destination = path.join(jsDebugDirectory, ...relativePath.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, Buffer.from(content, "base64"));
      }),
    );
    await Promise.all(
      proxyFiles.map(async ([relativePath, content]) => {
        const destination = path.join(proxyDirectory, ...relativePath.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, Buffer.from(content, "base64"));
      }),
    );
    await Promise.all([
      writeFile(cliPath, debuggerCliSource, "utf8"),
      writeFile(
        path.join(assetsDirectory, "exitcode-shim.cjs"),
        exitCodeShimSource,
        "utf8",
      ),
    ]);
    return cliPath;
  })();
  return materializedEngine;
}

interface McpDebuggerProcess extends DebuggerProcess {
  client: Client;
  transport: StdioClientTransport;
  lease: RetainedWorker;
}

export async function startProcess(
  target: DebuggerTarget,
  retainWorker: () => RetainedWorker,
): Promise<McpDebuggerProcess> {
  await access(target.workspacePath);
  const executablePath = target.enginePath ?? (await materializeBundledEngine());
  await access(executablePath);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executablePath, "stdio"],
    cwd: target.workspacePath,
    env: {
      ...process.env,
      MCP_DEBUG_SESSION_IDLE_MS: "900000",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => undefined);
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
      async close() {
        try {
          await client.close();
        } finally {
          await lease.dispose();
        }
      },
    };
  } catch (error) {
    await lease.dispose();
    await transport.close().catch(() => undefined);
    throw error;
  }
}

const supervisor = new DebuggerSupervisor(startProcess);

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async doctor(target, context) {
      const running = await supervisor.get(target, () =>
        context.experimental_retainWorker(),
      );
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
      const running = await supervisor.get(input, () =>
        context.experimental_retainWorker(),
      );
      const result = await running.client.callTool(
        {
          name: input.tool,
          arguments: input.arguments,
        },
        undefined,
        { signal: context.signal },
      );
      return JSON.parse(JSON.stringify(result)) as unknown;
    },
    async closeThread({ threadId }) {
      return { closed: await supervisor.close(threadId) };
    },
  },
  dispose: () => supervisor.closeAll(),
});
