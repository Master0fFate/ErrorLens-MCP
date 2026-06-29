# ErrorLens MCP

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
- Exposes a companion MCP server for diagnostics.
- Runs as a stdio MCP proxy for existing stdio upstream servers.
- Records local JSONL traces with redaction enabled by default.
- Ships a CLI for init, doctor, traces, replay, report, proxy, and adapter rule tests.

ErrorLens is a reliability layer, not a security sandbox. It does not send traces
to a cloud service and it has no model or API-key dependency.

## Requirements

- Node.js 22.12.0 or newer
- npm
- Windows, Linux, or macOS

## Install

```sh
git clone https://github.com/Master0fFate/ErrorLens-MCP.git
cd ErrorLens-MCP
npm install
npm run build
npm run verify
```

Run the CLI from source:

```sh
node dist/cli/index.js --help
```

Or link it locally while developing:

```sh
npm link
errorlens --help
```

The compiled package uses portable Node APIs and is designed to work on Windows,
Linux, and macOS.

## Companion MCP Server

Build the project first, then add the companion server to an MCP client:

```json
{
  "mcpServers": {
    "errorlens": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-errorlens/dist/companion/diagnostic-server.js"]
    }
  }
}
```

Tools:

- `classify_error`
- `recommend_recovery`
- `replay_trace`
- `summarize_failures`
- `generate_adapter_rule`
- `rules_test`

## Proxy Mode

Create a local config:

```sh
node dist/cli/index.js init --dir .errorlens
```

Edit `.errorlens/config.yaml`, then run:

```sh
node dist/cli/index.js proxy --config .errorlens/config.yaml
```

For stdio upstreams, ErrorLens lists the upstream tools and forwards calls. Tool
execution failures are returned as normal MCP tool results with `isError: true`
and a structured ErrorLens JSON payload. Successful tool responses are preserved.

## CLI Commands

```sh
node dist/cli/index.js init --dir .errorlens
node dist/cli/index.js doctor --config .errorlens/config.yaml
node dist/cli/index.js report --trace .errorlens/traces.jsonl
node dist/cli/index.js replay --trace .errorlens/traces.jsonl
node dist/cli/index.js traces --trace .errorlens/traces.jsonl
node dist/cli/index.js rules test --config .errorlens/config.yaml
node dist/cli/index.js proxy --config .errorlens/config.yaml
```

## Demo

The repo includes a fake broken MCP server used by the QA smoke tests:

```sh
npm run verify
node dist/qa/companion-smoke.js rate-limit
node dist/qa/proxy-smoke.js write-timeout
```

The proxy demo shows a write-like timeout classified as `SIDE_EFFECT_UNKNOWN`
with `retry.safe=false`, which prevents blind duplicate writes.

## Privacy

- No telemetry.
- Local trace files only.
- Redaction enabled by default.
- Environment variable values are never printed by `doctor`.
- ErrorLens improves recovery semantics; it does not provide formal security
  isolation.

## Development

```sh
npm run lint
npm run build
npm test
npm run verify
```

The CI workflow runs the verification suite across Windows, Linux, and macOS.
