# Cloudroom Debugger

`bb-plugin-debugger` gives Cloudroom agents a real step-through debugger. It exposes a pinned MCP debugger as provider-independent Cloudroom tools, so Codex, Fable, and other providers use the same debugging sessions and policy.

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

This project is an early proof of concept. JavaScript and TypeScript are the first end-to-end target, followed by .NET.

## License

MIT
