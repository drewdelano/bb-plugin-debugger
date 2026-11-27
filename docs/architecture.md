# Architecture

## Goals

- Give every Cloudroom provider the same real debugger tools.
- Run the debugger on the thread's enrolled host beside its checkout.
- Isolate debugger state by Cloudroom thread.
- Keep launch and source paths inside the workspace.
- Bound model-visible output and clean up every child process.

## Components

`server.ts` registers provider-independent agent tools. Every call resolves the thread's attached environment and explicitly targets that environment's `hostId`.

`host.ts` runs inside Cloudroom's full-trust host worker. It starts one MCP debugger child per thread through `StdioClientTransport`, retains the worker while the child exists, and closes children during plugin disposal.

`contract.ts` validates every server-to-host request and response. The host boundary accepts only JSON-safe values and limits calls through Cloudroom's existing RPC limits.

`lib/path-policy.ts` rejects source, program, breakpoint, and working-directory paths outside the workspace before they reach the debugger.

## Lifecycle

1. The first tool call starts the thread's debugger process lazily.
2. Later calls reuse the same MCP client and its debug sessions.
3. Changing the workspace or engine path replaces the process.
4. `debugger_close` closes the MCP client and releases the host-worker lease.
5. Plugin reload, disable, uninstall, daemon shutdown, or host-worker disposal closes every child.
6. The upstream debugger also receives a fifteen-minute session idle limit.

## Security boundary

The initial tool allowlist excludes process attachment, remote attachment, IDE endpoint exposure, and arbitrary MCP operations. All path-bearing arguments are confined to the current workspace.

Expression evaluation remains powerful because it executes in the launched debuggee. The plugin therefore launches only workspace-owned child processes and instructs agents never to debug production, shared clusters, or workloads containing regulated data.

The upstream debugger redacts credential-shaped values. The plugin additionally caps each agent-visible result at 256 KiB.

## Known limitation

The pinned debugger executable currently resolves from the plugin installation on the Cloudroom server host. That works for local environments. Cloud environments need a deterministic host-side provisioning step before their first session. The host contract already separates this concern from the agent-tool API.
