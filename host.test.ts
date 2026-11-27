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

    await harness.experimental_call("closeThread", { threadId: "thread-test" });
    await harness.experimental_dispose();
  }, 30_000);
});
