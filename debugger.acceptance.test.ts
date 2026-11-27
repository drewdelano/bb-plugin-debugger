import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeSession,
  createDebuggerTestClient,
  createPausedJavascriptSession,
  javascriptFixture,
  type DebugVariable,
  type DebuggerTestClient,
  variableNamed,
} from "./test/debugger-client.js";

interface VariablesResult {
  variables: DebugVariable[];
}

interface EvaluationResult {
  success: boolean;
  result: string;
  variablesReference: number;
}

describe.sequential("JavaScript debugger acceptance", { timeout: 30_000 }, () => {
  let debuggerClient: DebuggerTestClient;

  beforeAll(async () => {
    debuggerClient = await createDebuggerTestClient();
  });

  afterAll(async () => {
    await debuggerClient.close();
  });

  it("creates a session, launches JavaScript, and hits an ordinary breakpoint", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const result = await debuggerClient.call<{
        sessions: Array<{ id: string; state: string }>;
      }>(
        "list_debug_sessions",
        {},
      );
      expect(result.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: sessionId, state: "paused" }),
        ]),
      );
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("stops a conditional breakpoint only when its expression is true", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient, "index === 2");
    try {
      const result = await debuggerClient.call<VariablesResult>("get_local_variables", {
        sessionId,
        names: ["index"],
      });
      expect(variableNamed(result.variables, "index").value).toBe("2");
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("returns the paused application stack frame", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const result = await debuggerClient.call<{
        stackFrames: Array<{ name: string; file: string; line: number }>;
      }>("get_stack_trace", { sessionId });
      expect(result.stackFrames[0]?.name).toMatch(/compute$/);
      expect(result.stackFrames[0]?.file.toLowerCase()).toBe(
        javascriptFixture.toLowerCase(),
      );
      expect(result.stackFrames[0]?.line).toBe(13);
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("reads primitive local variables", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const result = await debuggerClient.call<VariablesResult>("get_local_variables", {
        sessionId,
        names: ["limit", "index"],
      });
      expect(variableNamed(result.variables, "limit").value).toBe("4");
      expect(variableNamed(result.variables, "index").value).toBe("0");
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("expands nested object, array, and null local values", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const locals = await debuggerClient.call<VariablesResult>("get_local_variables", {
        sessionId,
        names: ["state"],
      });
      const state = variableNamed(locals.variables, "state");
      expect(state.variablesReference).toBeGreaterThan(0);

      const stateChildren = await debuggerClient.call<VariablesResult>("get_variables", {
        sessionId,
        scope: state.variablesReference,
        names: ["nested", "items"],
      });
      const nested = variableNamed(stateChildren.variables, "nested");
      const items = variableNamed(stateChildren.variables, "items");
      expect(nested.variablesReference).toBeGreaterThan(0);
      expect(items.variablesReference).toBeGreaterThan(0);

      const nestedChildren = await debuggerClient.call<VariablesResult>("get_variables", {
        sessionId,
        scope: nested.variablesReference,
        names: ["label", "values", "meta"],
      });
      expect(variableNamed(nestedChildren.variables, "label").value).toBe("'ready'");
      const meta = variableNamed(nestedChildren.variables, "meta");
      const values = variableNamed(nestedChildren.variables, "values");
      expect(values.variablesReference).toBeGreaterThan(0);

      const metaChildren = await debuggerClient.call<VariablesResult>("get_variables", {
        sessionId,
        scope: meta.variablesReference,
        names: ["enabled", "note"],
      });
      expect(variableNamed(metaChildren.variables, "enabled").value).toBe("true");
      expect(variableNamed(metaChildren.variables, "note").value).toBe("null");
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("evaluates a primitive expression in the paused frame", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const result = await debuggerClient.call<EvaluationResult>("evaluate_expression", {
        sessionId,
        expression: "state.count + index",
      });
      expect(result).toEqual(
        expect.objectContaining({ success: true, result: "0", variablesReference: 0 }),
      );
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("evaluates and recursively expands a non-primitive expression", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      const evaluated = await debuggerClient.call<EvaluationResult>(
        "evaluate_expression",
        {
          sessionId,
          expression: "({ nested: state.nested, copy: [...state.nested.values] })",
        },
      );
      expect(evaluated.success).toBe(true);
      expect(evaluated.variablesReference).toBeGreaterThan(0);

      const evaluatedChildren = await debuggerClient.call<VariablesResult>("get_variables", {
        sessionId,
        scope: evaluated.variablesReference,
        names: ["nested", "copy"],
      });
      const copy = variableNamed(evaluatedChildren.variables, "copy");
      expect(copy.variablesReference).toBeGreaterThan(0);

      const copyChildren = await debuggerClient.call<VariablesResult>("get_variables", {
        sessionId,
        scope: copy.variablesReference,
      });
      expect(copyChildren.variables.map((variable) => variable.value).slice(0, 3)).toEqual([
        "2",
        "4",
        "6",
      ]);
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("steps over one statement and observes changed state", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient, "index === 1");
    try {
      const before = await debuggerClient.call<EvaluationResult>("evaluate_expression", {
        sessionId,
        expression: "state.count",
      });
      await debuggerClient.call("step_over", { sessionId });
      const after = await debuggerClient.call<EvaluationResult>("evaluate_expression", {
        sessionId,
        expression: "state.count",
      });
      expect({ before: before.result, after: after.result }).toEqual({
        before: "0",
        after: "1",
      });
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("continues and waits for the next breakpoint", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient);
    try {
      await debuggerClient.call("continue_execution", { sessionId });
      await debuggerClient.call("wait_for_stop", { sessionId, timeout: 10_000 });
      const result = await debuggerClient.call<VariablesResult>("get_local_variables", {
        sessionId,
        names: ["index"],
      });
      expect(variableNamed(result.variables, "index").value).toBe("1");
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("captures debuggee stdout", async () => {
    const sessionId = await createPausedJavascriptSession(debuggerClient, "index === 2");
    try {
      const output = await debuggerClient.call<{
        entries: Array<{ output: string }>;
      }>("get_output", { sessionId });
      expect(output.entries.map((entry) => entry.output).join(""))
        .toContain("iteration:0:count:0");
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });

  it("returns a pending result when a bounded stop wait times out", async () => {
    const created = await debuggerClient.call<{ sessionId: string }>(
      "create_debug_session",
      { language: "javascript" },
    );
    const sessionId = created.sessionId;
    try {
      await debuggerClient.call("start_debugging", {
        sessionId,
        scriptPath: new URL(
          "./test-fixtures/javascript/hanging.cjs",
          import.meta.url,
        ).pathname.replace(/^\/(.:)/, "$1"),
      });
      const result = await debuggerClient.call<{
        pending: boolean;
        state: string;
      }>("wait_for_stop", { sessionId, timeout: 50 });
      expect(result).toEqual(
        expect.objectContaining({ pending: true, state: "running" }),
      );
    } finally {
      await closeSession(debuggerClient, sessionId);
    }
  });
});
