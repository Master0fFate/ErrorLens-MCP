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
- Runs as an MCP proxy for local stdio and remote Streamable HTTP upstream servers.
- Records local JSONL traces with redaction enabled by default.
- Ships a CLI for init, doctor, traces, replay, report, proxy, and adapter rule tests.

ErrorLens is a reliability layer, not a security sandbox. It does not send traces
to a cloud service and it has no model or API-key dependency.

## Requirements

- Node.js 22.12.0 or newer
- npm
- Windows, Linux, or macOS

## Install

Install from npm:

```sh
npm install -g mcp-errorlens
errorlens --help
```

Or run it without a global install:

```sh
npx mcp-errorlens --help
```

Install the tagged GitHub release from source:

```sh
git clone --branch v0.1.0 https://github.com/Master0fFate/ErrorLens-MCP.git
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

For a global npm install:

```json
{
  "mcpServers": {
    "errorlens": {
      "command": "errorlens-companion",
      "args": []
    }
  }
}
```

For `npx` without a global install:

```json
{
  "mcpServers": {
    "errorlens": {
      "command": "npx",
      "args": ["-y", "--package", "mcp-errorlens", "errorlens-companion"]
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
errorlens init --dir .errorlens
```

Edit `.errorlens/config.yaml`, then run:

```sh
errorlens proxy --config .errorlens/config.yaml
```

ErrorLens lists upstream tools and forwards calls over stdio or Streamable HTTP.
Tool execution failures are returned as normal MCP tool results with `isError: true`,
machine-readable `structuredContent`, and a structured ErrorLens JSON payload.
Successful tool responses are preserved. Unknown exposed tools remain protocol errors,
as required by MCP.

Relative trace and adapter-rule paths are resolved against the config file. Adapter
rules can be loaded globally or per upstream server:

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
```

## CLI Commands

```sh
errorlens init --dir .errorlens
errorlens doctor --config .errorlens/config.yaml
errorlens report --trace .errorlens/traces.jsonl
errorlens replay --trace .errorlens/traces.jsonl
errorlens traces --trace .errorlens/traces.jsonl
errorlens rules test --file ./rules/github.yaml
errorlens proxy --config .errorlens/config.yaml
```

## Demo

The repo includes a fake broken MCP server used by the QA smoke tests:

```sh
npm run verify
node dist/qa/companion-smoke.js rate-limit
node dist/qa/proxy-smoke.js write-timeout
node dist/qa/proxy-smoke.js adapter-rule
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
