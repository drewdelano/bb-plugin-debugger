import { createRequire } from "node:module";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { describe, expect, it } from "vitest";
import hostEntry from "./host.js";

const require = createRequire(import.meta.url);

describe("debugger host", () => {
  it("starts the pinned MCP debugger and reports its tools", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);
    const result = await harness.experimental_call("doctor", {
      threadId: "thread-test",
      workspacePath: process.cwd(),
      enginePath: require.resolve("@debugmcp/mcp-debugger/dist/cli"),
    });

    expect(result.engineVersion).toBe("0.26.0");
    expect(result.tools).toContain("create_debug_session");
    expect(result.tools).toContain("step_over");

    await harness.experimental_dispose();
  }, 30_000);

  it("releases its retained worker lease when a thread closes", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);
    await harness.experimental_call("doctor", {
      threadId: "thread-close",
      workspacePath: process.cwd(),
      enginePath: require.resolve("@debugmcp/mcp-debugger/dist/cli"),
    });
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(1);

    await expect(
      harness.experimental_call("closeThread", { threadId: "thread-close" }),
    ).resolves.toEqual({ closed: true });
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
    await harness.experimental_dispose();
  }, 30_000);

  it("releases its retained worker lease after debugger startup fails", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);

    await expect(
      harness.experimental_call("doctor", {
        threadId: "thread-failed-start",
        workspacePath: process.cwd(),
        enginePath: new URL(
          "./test-fixtures/invalid-engine.mjs",
          import.meta.url,
        ).pathname.replace(/^\/(.:)/, "$1"),
      }),
    ).rejects.toThrow();
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
    await harness.experimental_dispose();
  }, 30_000);

  it("propagates Cloudroom cancellation to an in-flight debugger request", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);
    const target = {
      threadId: "thread-cancelled-call",
      workspacePath: process.cwd(),
      enginePath: require.resolve("@debugmcp/mcp-debugger/dist/cli"),
    };
    const call = async <T>(tool: string, argumentsValue: Record<string, unknown>) => {
      const response = (await harness.experimental_call("callTool", {
        ...target,
        tool,
        arguments: argumentsValue,
      })) as { content: Array<{ type: string; text?: string }> };
      const text = response.content.find((part) => part.type === "text")?.text;
      if (text === undefined) throw new Error(`${tool} did not return JSON text`);
      return JSON.parse(text) as T;
    };
    const created = await call<{ sessionId: string }>("create_debug_session", {
      language: "javascript",
    });
    await call("start_debugging", {
      sessionId: created.sessionId,
      scriptPath: new URL(
        "./test-fixtures/javascript/hanging.cjs",
        import.meta.url,
      ).pathname.replace(/^\/(.:)/, "$1"),
    });

    const controller = new AbortController();
    const waiting = harness.experimental_call(
      "callTool",
      {
        ...target,
        tool: "wait_for_stop",
        arguments: { sessionId: created.sessionId, timeout: 600_000 },
      },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 50);

    await expect(waiting).rejects.toThrow();
    await call("close_debug_session", { sessionId: created.sessionId });
    await harness.experimental_dispose();
  }, 30_000);
});
