# Cloudroom Debugger

`bb-plugin-debugger` gives Cloudroom agents a real step-through debugger. It exposes a pinned MCP debugger as provider-independent Cloudroom tools, so Codex, Fable, and other providers use the same debugging sessions and policy.

> **Experimental and largely untested.** The automated suite exercises a narrow JavaScript fixture and plugin lifecycle behavior, primarily on a local Windows host. Real repositories, additional operating systems, cloud hosts, TypeScript source maps, other languages, and sustained Codex/Fable use have not been validated broadly. Do not use this release against production, shared, or regulated-data workloads.

The first release is deliberately headless. It launches programs from the current thread workspace, sets breakpoints, steps execution, and inspects stack frames and variables. It does not expose arbitrary process attachment or remote production debugging.

## Architecture

The Cloudroom server entry resolves the calling thread to its environment, host, and workspace. It forwards typed requests to the plugin host worker on that enrolled host. The host worker supervises one `@debugmcp/mcp-debugger` MCP process per Cloudroom thread and communicates over stdio.

Each thread receives three native tools:

- `debugger_doctor` verifies the engine and reports available languages and operations.
- `debugger_call` invokes a curated debugger operation.
- `debugger_close` closes the thread's debugger process and sessions.

The bundled `debugger` skill teaches agents a bounded, evidence-driven workflow.

See [docs/architecture.md](docs/architecture.md) for lifecycle and security details.

## Development

```powershell
volta run npm install --include=dev
volta run npm test
volta run npm run typecheck
room-cli plugin build .
```

A live install requires confirmation in the Cloudroom app:

```powershell
room-cli plugin install .
```

## Status

This project is an early proof of concept. JavaScript is the only end-to-end target in the initial release. TypeScript, source maps, cloud-host behavior, macOS/Linux behavior, and broader provider workflows need real-world validation. .NET is explicitly deferred to [issue #1](https://github.com/drewdelano/bb-plugin-debugger/issues/1).

The repository currently has 34 passing automated tests. That is useful regression coverage, not evidence that the plugin is production-ready.

## Installation

Install the experimental `0.1.x` line directly from GitHub:

```powershell
room-cli plugin install git:https://github.com/drewdelano/bb-plugin-debugger.git@^0.1.0
```

Cloudroom will ask for confirmation because plugins execute as full-trust local code.

## License

MIT
