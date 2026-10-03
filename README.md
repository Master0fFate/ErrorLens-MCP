# ErrorLens MCP

[![CI](https://github.com/Master0fFate/ErrorLens-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/Master0fFate/ErrorLens-MCP/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-errorlens)](https://www.npmjs.com/package/mcp-errorlens)

**Structured error recovery for MCP agents.**

MCP servers often fail with vague messages. ErrorLens turns those failures into
structured, retry-aware, state-aware guidance that agents can use.

## Why Use It

When an MCP tool call fails, agents need to know more than "something went
wrong." They need to know whether retrying is safe, whether a write may have
partially happened, what evidence matters, and what recovery step should come
next.

ErrorLens MCP is built for that pressure point:

- Prevents blind duplicate writes after ambiguous timeouts.
- Converts opaque upstream failures into stable machine-readable categories.
- Keeps recovery guidance compact enough for agent context windows.
- Preserves successful upstream MCP responses while wrapping failures with
  structured `isError: true` payloads.
- Stores privacy-preserving local JSONL traces for replay and reports.
- Runs locally with no telemetry, no model dependency, and no API key.

## What It Does

- Classifies opaque MCP and tool failures into a compact structured error model.
- Tells agents whether retrying is safe, whether state may have changed, and what
  to do next.
- Exposes a companion MCP server with read-only diagnostic tools.
- Runs as an MCP proxy in front of local stdio and remote Streamable HTTP
  upstream servers, and forwards upstream tool-list changes.
- Serves both over **stdio** and **Streamable HTTP**, speaking every 2025-era
  protocol revision and the 2026-07-28 revision from one process.
- Records local JSONL traces with redaction enabled by default, in a
  per-session OS temp directory that is cleaned up on shutdown.
- Ships a CLI for init, doctor, client-config, traces, replay, report, proxy,
  companion, and adapter rule tests.

ErrorLens is a reliability layer, not a security sandbox. It does not send traces
to a cloud service and it has no model or API-key dependency.

## Requirements

- Node.js 22.12.0 or newer (CI runs Node 22, 24 and 26)
- npm
- Windows, Linux, or macOS

## Install

Run it without installing anything:

```sh
npx -y mcp-errorlens --help
```

Or install globally:

```sh
npm install -g mcp-errorlens
errorlens --help
```

From source:

```sh
git clone https://github.com/Master0fFate/ErrorLens-MCP.git
cd ErrorLens-MCP
npm install
npm run verify
node dist/cli/index.js --help
```

## Connect Your Client

The CLI prints a ready-to-paste snippet for every supported harness:

```sh
npx -y mcp-errorlens client-config claude-desktop
npx -y mcp-errorlens client-config cursor --transport http
npx -y mcp-errorlens client-config codex --mode proxy --config /abs/.errorlens/config.yaml
```

| Client                        | id               | stdio | Streamable HTTP |
| ----------------------------- | ---------------- | :---: | :-------------: |
| Claude Desktop                | `claude-desktop` |  yes  | via Connectors  |
| Claude Code                   | `claude-code`    |  yes  |       yes       |
| Cursor                        | `cursor`         |  yes  |       yes       |
| VS Code (Copilot agent mode)  | `vscode`         |  yes  |       yes       |
| Windsurf                      | `windsurf`       |  yes  |       yes       |
| OpenAI Codex CLI              | `codex`          |  yes  |       yes       |
| Gemini CLI                    | `gemini-cli`     |  yes  |       yes       |
| Zed                           | `zed`            |  yes  |        -        |
| Cline / Roo Code              | `cline`          |  yes  |       yes       |

Any other MCP client works too: launch `npx -y mcp-errorlens companion` over
stdio, or connect to the URL printed by `errorlens companion --transport http`.
See [docs/client-setup.md](docs/client-setup.md) for every snippet, Windows
notes, and troubleshooting. The generated files are in [`examples/`](examples).

## Companion MCP Server

```json
{
  "mcpServers": {
    "errorlens": {
      "command": "npx",
      "args": ["-y", "mcp-errorlens", "companion"]
    }
  }
}
```

Every tool is annotated read-only, idempotent and local (`openWorldHint: false`)
so hosts can auto-approve it, and advertises an `outputSchema` so hosts can
validate `structuredContent`.

| Tool                    | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `classify_error`        | Raw error or `isError` result in, structured error plus recovery out.   |
| `recommend_recovery`    | Short next steps, stop condition, read-only tools that can verify state. |
| `replay_trace`          | Explain a recorded trace by ID.                                         |
| `summarize_failures`    | Failure counts by category, server and tool, with retry safety.         |
| `generate_adapter_rule` | Draft an adapter-rule YAML from a sample message (secrets redacted).    |
| `rules_test`            | Parse adapter-rule YAML and report how many rules loaded.               |

## Proxy Mode

Create a local config:

```sh
errorlens init --dir .errorlens
```

Edit `.errorlens/config.yaml`, then run:

```sh
errorlens proxy --config .errorlens/config.yaml
```

ErrorLens connects to every configured upstream, exposes their tools as
`server__tool`, and forwards calls over stdio or Streamable HTTP. Tool execution
failures are returned as normal MCP tool results with `isError: true`,
machine-readable `structuredContent`, and a structured ErrorLens JSON payload.
Successful tool responses are preserved, including upstream `annotations`,
`outputSchema`, `title` and `icons`. Unknown exposed tools remain protocol
errors, as required by MCP. When an upstream sends
`notifications/tools/list_changed`, the proxy refreshes its table and notifies
its own clients.

Relative trace and adapter-rule paths are resolved against the config file.
Adapter rules can be loaded globally or per upstream server:

```yaml
rules:
  custom_paths: []

servers:
  github:
    transport: streamable_http
    url: https://example.com/mcp
    headers:
      Authorization: ${GITHUB_AUTH_HEADER}
    adapter_rules:
      - rules/github.yaml
    negotiation: auto   # probe for the 2026-07-28 revision; default "legacy" uses initialize
  local-files:
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
```

Runtime trace files are session-scoped and live under the operating system's temp
directory; the proxy and companion server do not write trace data into the working
directory. `errorlens init` only creates the user-requested configuration directory.

## Streamable HTTP Mode

Both servers can listen on HTTP instead of stdio:

```sh
errorlens companion --transport http                    # http://127.0.0.1:3939/mcp
errorlens proxy --config .errorlens/config.yaml --transport http --port 4000
```

Options: `--host` (default `127.0.0.1`), `--port` (`0` picks a free port),
`--path` (default `/mcp`), `--allowed-host`, `--allowed-origin`. Loopback binds
get the SDK's `Host` and `Origin` validation (DNS rebinding protection) by
default. The endpoint is stateless and unauthenticated: keep it on loopback or
behind an authenticating reverse proxy.

## Protocol Compatibility

- Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `@modelcontextprotocol/node`).
- Serves the 2026-07-28 protocol revision and every 2025-era revision
  (`2024-10-07` through `2025-11-25`) from the same factory; the era is
  negotiated per connection over stdio and per request over HTTP.
- Connects to upstream servers with the classic `initialize` handshake by
  default, or probes for 2026-07-28 with `negotiation: auto`.
- Tool input schemas are advertised as JSON Schema 2020-12.
- `errorlens doctor` prints the exact protocol versions the installed build
  supports.

## MCP Registry

The package ships a `server.json` manifest (`io.github.master0ffate/errorlens`)
and declares `mcpName` in `package.json`, ready for publishing to the official
MCP Registry with `mcp-publisher publish`.

## CLI Commands

```sh
errorlens init --dir .errorlens
errorlens doctor --config .errorlens/config.yaml
errorlens companion [--transport http] [--port 3939]
errorlens proxy --config .errorlens/config.yaml [--transport http]
errorlens client-config <client> [--mode companion|proxy] [--transport stdio|http]
errorlens report --trace .errorlens/traces.jsonl
errorlens replay <trace-id> --trace .errorlens/traces.jsonl
errorlens traces --trace .errorlens/traces.jsonl
errorlens rules test --file ./rules/github.yaml
```

The `errorlens-companion` and `errorlens-proxy` bins accept the same flags as
the `companion` and `proxy` subcommands.

## Programmatic Use

```ts
import { classifyError, recommendRecovery, buildDiagnosticServer } from "mcp-errorlens"

const structured = classifyError({
  server_name: "github",
  tool_name: "create_issue",
  raw_error: "HTTP 429 secondary rate limit",
  http_status: 429,
})
console.log(structured.error.code, recommendRecovery(structured).next_steps)
```

`buildDiagnosticServer()` returns the companion `McpServer`, so it can be
mounted inside your own `createMcpHandler` or `serveStdio` factory.

## Demo

The repo includes a fake broken MCP server used by the QA smoke tests:

```sh
npm run verify
npm run smoke
node dist/qa/companion-smoke.js rate-limit --transport http
node dist/qa/proxy-smoke.js write-timeout
node dist/qa/proxy-smoke.js adapter-rule
```

The proxy demo shows a write-like timeout classified as `SIDE_EFFECT_UNKNOWN`
with `retry.safe=false`, which prevents blind duplicate writes. The HTTP
companion smoke connects once as a 2025-era client and once as a 2026-07-28
client against the same endpoint.

## Privacy

- No telemetry.
- Local trace files only.
- Redaction enabled by default.
- Environment variable values are never printed by `doctor`.
- ErrorLens improves recovery semantics; it does not provide formal security
  isolation.

## Development

```sh
npm run lint        # biome
npm run typecheck   # tsc --noEmit
npm run build       # clean + emit dist/ and dist-tests/
npm test            # node:test suite
npm run smoke       # stdio + HTTP smoke checks
npm run verify      # lint + build + test
```

The CI workflow runs the verification suite and the smoke checks on Windows,
Linux, and macOS with Node 22, 24 and 26. See [CHANGELOG.md](CHANGELOG.md) for
release notes.

### Releasing

Bump `version` in `package.json` and `server.json`, add a `## [x.y.z]` section
to `CHANGELOG.md`, and push to `main`. The Release workflow verifies the build,
creates the `vx.y.z` tag, and publishes a GitHub release whose notes are that
changelog section. Publishing to npm (`npm publish`) remains a manual step.
