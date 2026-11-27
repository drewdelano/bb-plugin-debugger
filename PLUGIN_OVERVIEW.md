## What you get

Give Codex, Fable, and other Cloudroom providers the same real step-through debugging tools. The plugin can launch a workspace-owned JavaScript program, bind breakpoints, inspect stack frames and variables, evaluate expressions, step execution, continue, and capture output.

Three agent tools provide the surface: `debugger_doctor` checks the engine and language availability, `debugger_call` performs a curated debugger operation, and `debugger_close` releases the thread's sessions and debugger process. A bundled skill teaches agents the expected evidence-driven workflow.

## Experimental status

**This release is largely untested and is not production-ready.** Its automated coverage uses a narrow JavaScript fixture and lifecycle tests, primarily on a local Windows host. Real repositories, macOS and Linux hosts, Cloud environments, TypeScript source maps, languages other than JavaScript, and sustained Codex/Fable workflows still need validation.

Do not use it to debug production, shared environments, remote processes, Kubernetes workloads, or programs that may contain PHI or other regulated data. .NET debugging is not included in this release.

## How it works

The plugin runs a pinned debugger engine beside the thread checkout. Debugger state is isolated by Cloudroom thread, path-bearing operations are confined to the workspace, model-visible output is capped, and plugin shutdown closes managed child processes.

## Requirements

Cloudroom 171 or later is required. Installation grants the plugin full-trust local code execution because launching and controlling debuggee processes cannot run in a restricted frontend sandbox.

Source, limitations, and issue tracking are available on [GitHub](https://github.com/drewdelano/bb-plugin-debugger).
