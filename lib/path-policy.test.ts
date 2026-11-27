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

  it("rejects a Windows sibling whose name starts with the workspace name", () => {
    const windowsWorkspace = "C:\\work\\repo";
    expect(() =>
      requirePathInsideWorkspace(windowsWorkspace, "C:\\work\\repo-private\\secret.ts"),
    ).toThrow("Path must stay inside the workspace");
  });

  it("accepts Windows paths with different drive-letter and directory casing", () => {
    expect(
      requirePathInsideWorkspace("C:\\Work\\Repo", "c:\\work\\repo\\src\\main.ts"),
    ).toBe("c:\\work\\repo\\src\\main.ts");
  });

  it("rejects relative traversal hidden in nested launch arguments", () => {
    expect(() =>
      validateDebuggerArguments(workspace, "start_debugging", {
        dapLaunchArgs: {
          cwd: "..\\outside",
        },
      }),
    ).toThrow("Path must stay inside the workspace");
  });
});
