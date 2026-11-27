import type { DebuggerTarget } from "../contract.js";

export interface RetainedWorker {
  dispose(): Promise<void>;
}

export interface DebuggerProcess {
  workspacePath: string;
  enginePath: string | null;
  close(): Promise<void>;
}

export type StartDebuggerProcess<T extends DebuggerProcess> = (
  target: DebuggerTarget,
  retainWorker: () => RetainedWorker,
) => Promise<T>;

export class DebuggerSupervisor<T extends DebuggerProcess> {
  readonly #processes = new Map<string, Promise<T>>();
  readonly #startProcess: StartDebuggerProcess<T>;

  constructor(startProcess: StartDebuggerProcess<T>) {
    this.#startProcess = startProcess;
  }

  async get(
    target: DebuggerTarget,
    retainWorker: () => RetainedWorker,
  ): Promise<T> {
    const existing = this.#processes.get(target.threadId);
    if (existing !== undefined) {
      const running = await existing;
      if (
        running.workspacePath === target.workspacePath &&
        running.enginePath === target.enginePath
      ) {
        return running;
      }
      await this.close(target.threadId);
    }

    const starting = this.#startProcess(target, retainWorker);
    this.#processes.set(target.threadId, starting);
    try {
      return await starting;
    } catch (error) {
      if (this.#processes.get(target.threadId) === starting) {
        this.#processes.delete(target.threadId);
      }
      throw error;
    }
  }

  async close(threadId: string): Promise<boolean> {
    const starting = this.#processes.get(threadId);
    if (starting === undefined) return false;
    this.#processes.delete(threadId);
    const running = await starting.catch(() => null);
    if (running === null) return false;
    await running.close();
    return true;
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.#processes.keys()].map((threadId) => this.close(threadId)),
    );
  }
}
