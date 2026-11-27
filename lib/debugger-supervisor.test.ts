import { describe, expect, it, vi } from "vitest";
import type { DebuggerTarget } from "../contract.js";
import {
  DebuggerSupervisor,
  type DebuggerProcess,
  type RetainedWorker,
} from "./debugger-supervisor.js";

function target(threadId: string): DebuggerTarget {
  return {
    threadId,
    workspacePath: `C:\\workspaces\\${threadId}`,
    enginePath: "C:\\plugin\\debugger.js",
  };
}

function processFor(targetValue: DebuggerTarget): DebuggerProcess {
  return {
    workspacePath: targetValue.workspacePath,
    enginePath: targetValue.enginePath,
    close: vi.fn(async () => undefined),
  };
}

function retainedWorker(): RetainedWorker {
  return { dispose: vi.fn(async () => undefined) };
}

describe("debugger process supervisor", () => {
  it("deduplicates concurrent startup calls for one thread", async () => {
    let release: ((value: DebuggerProcess) => void) | undefined;
    const started = new Promise<DebuggerProcess>((resolve) => {
      release = resolve;
    });
    const start = vi.fn(async () => started);
    const supervisor = new DebuggerSupervisor(start);
    const targetValue = target("thread-a");

    const first = supervisor.get(targetValue, retainedWorker);
    const second = supervisor.get(targetValue, retainedWorker);
    const running = processFor(targetValue);
    release?.(running);

    expect(await first).toBe(running);
    expect(await second).toBe(running);
    expect(start).toHaveBeenCalledTimes(1);
    await supervisor.closeAll();
  });

  it("keeps different Cloudroom threads isolated", async () => {
    const start = vi.fn(async (targetValue: DebuggerTarget) => processFor(targetValue));
    const supervisor = new DebuggerSupervisor(start);

    const first = await supervisor.get(target("thread-a"), retainedWorker);
    const second = await supervisor.get(target("thread-b"), retainedWorker);

    expect(first).not.toBe(second);
    expect(start).toHaveBeenCalledTimes(2);
    expect(await supervisor.close("thread-a")).toBe(true);
    expect(await supervisor.close("thread-b")).toBe(true);
  });

  it("removes a failed startup so the same thread can retry", async () => {
    const targetValue = target("thread-retry");
    const running = processFor(targetValue);
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("adapter failed"))
      .mockResolvedValueOnce(running);
    const supervisor = new DebuggerSupervisor(start);

    await expect(supervisor.get(targetValue, retainedWorker)).rejects.toThrow(
      "adapter failed",
    );
    await expect(supervisor.get(targetValue, retainedWorker)).resolves.toBe(running);
    expect(start).toHaveBeenCalledTimes(2);
    await supervisor.closeAll();
  });

  it("closes every active debugger when the host worker is disposed", async () => {
    const first = processFor(target("thread-a"));
    const second = processFor(target("thread-b"));
    const start = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const supervisor = new DebuggerSupervisor(start);
    await supervisor.get(target("thread-a"), retainedWorker);
    await supervisor.get(target("thread-b"), retainedWorker);

    await supervisor.closeAll();

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(await supervisor.close("thread-a")).toBe(false);
  });
});
