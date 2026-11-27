import { createRequire } from "node:module";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { hostContract, type DebuggerTarget } from "./contract.js";
import { validateDebuggerArguments } from "./lib/path-policy.js";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("@debugmcp/mcp-debugger/dist/cli");

const supportedTools = [
  "clear_breakpoints",
  "close_debug_session",
  "continue_execution",
  "create_debug_session",
  "evaluate_expression",
  "get_local_variables",
  "get_output",
  "get_scopes",
  "get_source_context",
  "get_stack_trace",
  "get_variables",
  "hot_reload",
  "list_breakpoints",
  "list_debug_sessions",
  "list_supported_languages",
  "list_threads",
  "pause_execution",
  "remove_breakpoint",
  "restart_debugging",
  "set_breakpoint",
  "start_debugging",
  "step_into",
  "step_out",
  "step_over",
  "wait_for_stop",
] as const;

const toolName = z.enum(supportedTools);
const toolArguments = z.record(z.string(), z.unknown()).default({});

interface ResolvedTarget {
  hostId: string;
  target: DebuggerTarget;
}

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  async function resolveTarget(
    threadId: string,
    signal?: AbortSignal,
  ): Promise<ResolvedTarget> {
    const thread = await bb.sdk.threads.get({ threadId, signal });
    if (thread.environmentId === null) {
      throw new Error("The thread does not have an attached environment.");
    }
    const environment = await bb.sdk.environments.get({
      environmentId: thread.environmentId,
      signal,
    });
    if (environment.status !== "ready" || environment.path === null) {
      throw new Error("The thread environment is not ready.");
    }
    return {
      hostId: environment.hostId,
      target: {
        threadId,
        workspacePath: environment.path,
        enginePath,
      },
    };
  }

  function renderResult(value: unknown): string {
    const serialized = JSON.stringify(value, null, 2);
    const limit = 256 * 1024;
    if (serialized.length <= limit) return serialized;
    return JSON.stringify(
      {
        truncated: true,
        originalCharacters: serialized.length,
        preview: serialized.slice(0, limit),
      },
      null,
      2,
    );
  }

  bb.agents.registerTool({
    name: "debugger_doctor",
    description:
      "Check whether the real step-through debugger works in this thread's environment and list its supported languages and tools.",
    parameters: z.object({}).strict(),
    presentation: {
      label: {
        pending: "Checking debugger",
        completed: "Checked debugger",
      },
    },
    async execute(_, context) {
      const resolved = await resolveTarget(context.threadId, context.signal);
      const result = await host.call("doctor", resolved.target, {
        hostId: resolved.hostId,
        signal: context.signal,
        timeoutMs: 120_000,
      });
      return renderResult(result);
    },
  });

  bb.agents.registerTool({
    name: "debugger_call",
    description:
      "Call one operation on the real step-through debugger. Use debugger_doctor first and follow the bundled debugger skill.",
    parameters: z
      .object({
        tool: toolName,
        arguments: toolArguments,
      })
      .strict(),
    presentation: {
      label: {
        pending: "Using debugger",
        completed: "Used debugger",
      },
    },
    async execute(input, context) {
      const resolved = await resolveTarget(context.threadId, context.signal);
      validateDebuggerArguments(
        resolved.target.workspacePath,
        input.tool,
        input.arguments,
      );
      const result = await host.call(
        "callTool",
        {
          ...resolved.target,
          tool: input.tool,
          arguments: input.arguments,
        },
        {
          hostId: resolved.hostId,
          signal: context.signal,
          timeoutMs: 120_000,
        },
      );
      return renderResult(result);
    },
  });

  bb.agents.registerTool({
    name: "debugger_close",
    description:
      "Close every debugger session and the debugger process owned by this Cloudroom thread.",
    parameters: z.object({}).strict(),
    presentation: {
      label: {
        pending: "Closing debugger",
        completed: "Closed debugger",
      },
    },
    async execute(_, context) {
      const resolved = await resolveTarget(context.threadId, context.signal);
      const result = await host.call(
        "closeThread",
        { threadId: context.threadId },
        {
          hostId: resolved.hostId,
          signal: context.signal,
        },
      );
      return renderResult(result);
    },
  });

  bb.agents.configure(() => ({
    tools: ["debugger_doctor", "debugger_call", "debugger_close"],
    skills: ["debugger"],
  }));

  bb.log.info("registered provider-independent debugger tools");
}
