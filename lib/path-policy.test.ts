import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  requirePathInsideWorkspace,
  validateDebuggerArguments,
} from "./path-policy.js";

describe("workspace path policy", () => {
  const workspace = path.resolve("workspace");

  it("accepts the workspace and descendants", () => {
    expect(requirePathInsideWorkspace(workspace, workspace)).toBe(workspace);
    expect(
      requirePathInsideWorkspace(workspace, path.join(workspace, "src", "main.ts")),
    ).toBe(path.join(workspace, "src", "main.ts"));
  });

  it("rejects parent and sibling paths", () => {
    expect(() =>
      requirePathInsideWorkspace(workspace, path.resolve(workspace, "..", "secret")),
    ).toThrow("Path must stay inside the workspace");
  });

  it("checks nested path-bearing debugger arguments", () => {
    expect(() =>
      validateDebuggerArguments(workspace, "start_debugging", {
        configuration: {
          program: path.resolve(workspace, "..", "outside.js"),
        },
      }),
    ).toThrow("Path must stay inside the workspace");
  });

  it("does not interpret evaluated expressions as paths", () => {
    expect(() =>
      validateDebuggerArguments(workspace, "evaluate_expression", {
        expression: "'/etc/passwd'",
      }),
    ).not.toThrow();
  });
});
