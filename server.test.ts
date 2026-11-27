import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server.js";

describe("debugger plugin registration", () => {
  it("registers the same debugger tools for every provider", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "debugger",
      agentSkillIds: ["debugger"],
    });

    await plugin(bb);

    expect(harness.registrations.agentTools.map((tool) => tool.name).sort()).toEqual([
      "debugger_call",
      "debugger_close",
      "debugger_doctor",
    ]);

    const codex = await harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({
        provider: {
          id: "codex",
          model: "gpt",
          capabilities: { supportsNativeUserQuestion: false },
        },
      }),
    );
    const fable = await harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({
        provider: {
          id: "claude",
          model: "fable",
          capabilities: { supportsNativeUserQuestion: true },
        },
      }),
    );

    expect(codex).toEqual(fable);
    expect(codex.tools.map((tool) => tool.name)).toEqual([
      "debugger_doctor",
      "debugger_call",
      "debugger_close",
    ]);
    expect(codex.skills).toHaveLength(1);

    await harness.lifecycle.dispose();
  });

  it("routes debugger RPC to the thread environment host and workspace", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "debugger",
      agentSkillIds: ["debugger"],
      sdk: {
        threads: {
          get: async () => makeThreadResponse({ environmentId: "environment-1" }),
        },
        environments: {
          get: async () =>
            ({
              id: "environment-1",
              hostId: "host-7",
              path: "C:\\work\\repo",
              status: "ready",
            }) as never,
        },
      },
      experimental_callHostRpc: async () => ({
        engineVersion: "0.26.0",
        tools: [],
        languages: {},
      }),
    });
    await plugin(bb);
    const doctor = harness.registrations.agentTools.find(
      (tool) => tool.name === "debugger_doctor",
    );

    await doctor?.execute(
      {},
      {
        threadId: "thread-1",
        signal: new AbortController().signal,
      } as never,
    );

    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
    expect(harness.experimental_hostRpcCalls[0]).toEqual(
      expect.objectContaining({
        method: "doctor",
        hostId: "host-7",
        input: expect.objectContaining({
          threadId: "thread-1",
          workspacePath: "C:\\work\\repo",
        }),
      }),
    );
    await harness.lifecycle.dispose();
  });

  it("rejects a thread with no attached environment", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "debugger",
      agentSkillIds: ["debugger"],
      sdk: {
        threads: {
          get: async () => makeThreadResponse({ environmentId: null }),
        },
      },
    });
    await plugin(bb);
    const doctor = harness.registrations.agentTools.find(
      (tool) => tool.name === "debugger_doctor",
    );

    await expect(
      doctor?.execute(
        {},
        { threadId: "thread-1", signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow("does not have an attached environment");
    await harness.lifecycle.dispose();
  });

  it("rejects an environment before its workspace is ready", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "debugger",
      agentSkillIds: ["debugger"],
      sdk: {
        threads: {
          get: async () => makeThreadResponse({ environmentId: "environment-1" }),
        },
        environments: {
          get: async () =>
            ({
              id: "environment-1",
              hostId: "host-7",
              path: null,
              status: "creating",
            }) as never,
        },
      },
    });
    await plugin(bb);
    const doctor = harness.registrations.agentTools.find(
      (tool) => tool.name === "debugger_doctor",
    );

    await expect(
      doctor?.execute(
        {},
        { threadId: "thread-1", signal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow("environment is not ready");
    await harness.lifecycle.dispose();
  });

  it("forwards agent cancellation to the targeted host RPC", async () => {
    const controller = new AbortController();
    const { bb, harness } = createFakePluginHost({
      pluginId: "debugger",
      agentSkillIds: ["debugger"],
      sdk: {
        threads: {
          get: async () => makeThreadResponse({ environmentId: "environment-1" }),
        },
        environments: {
          get: async () =>
            ({
              id: "environment-1",
              hostId: "host-7",
              path: "C:\\work\\repo",
              status: "ready",
            }) as never,
        },
      },
      experimental_callHostRpc: async () => ({ closed: true }),
    });
    await plugin(bb);
    const close = harness.registrations.agentTools.find(
      (tool) => tool.name === "debugger_close",
    );

    await close?.execute(
      {},
      { threadId: "thread-1", signal: controller.signal } as never,
    );

    expect(harness.experimental_hostRpcCalls[0]?.signal).toBe(controller.signal);
    await harness.lifecycle.dispose();
  });
});
