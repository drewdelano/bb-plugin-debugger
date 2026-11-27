import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
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
});
