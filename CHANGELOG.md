# Changelog

All notable changes to ErrorLens MCP are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-03

### Changed

- Migrated from the legacy monolithic `@modelcontextprotocol/sdk` 1.x package
  to the MCP TypeScript SDK v2 packages (`@modelcontextprotocol/server`,
  `@modelcontextprotocol/client`, `@modelcontextprotocol/core`,
  `@modelcontextprotocol/node`). Both servers now implement the 2026-07-28
  protocol revision while still serving every 2025-era client from the same
  factory.
- The companion and proxy are served through `serveStdio`, so the protocol
  era is negotiated per connection instead of being fixed at 2025.
- Tool input schemas are full Standard Schema objects; advertised JSON Schema
  now follows draft 2020-12 as produced by Zod 4.
- Unknown tools on the proxy stay JSON-RPC `-32602` protocol errors, matching
  the SDK v2 behaviour for every MCP server.
- Server and client identities report the real package version instead of a
  hard-coded string, and carry `websiteUrl` and `description`.
- Upstream stdio servers' stderr is drained and forwarded with a
  `[server]` prefix instead of being buffered in an unread pipe.
- Toolchain: TypeScript 7, Biome 2.5, Zod 4.6, Node 22.12+ (CI covers Node 22,
  24 and 26 on Linux, macOS and Windows).

### Added

- Streamable HTTP transport for both servers: `errorlens companion --transport http`
  and `errorlens proxy --transport http`, with `--host`, `--port`, `--path`,
  `--allowed-host` and `--allowed-origin`. Loopback binds enable the SDK's
  `Host` and `Origin` guards against DNS rebinding by default.
- Companion tools now carry `title`, read-only `annotations` and an
  `outputSchema`, so hosts can auto-approve them and validate
  `structuredContent`.
- The proxy advertises `tools.listChanged` and forwards upstream
  `notifications/tools/list_changed` after refreshing its exposed tool table.
- Per-upstream `negotiation: auto` config option to probe upstream servers for
  the 2026-07-28 revision.
- `errorlens companion` subcommand (the `errorlens-companion` bin keeps working).
- `errorlens client-config <client>` prints ready-to-paste configuration for
  Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Codex CLI, Gemini
  CLI, Zed and Cline. The `examples/` directory is generated from it.
- `errorlens doctor` reports the supported MCP protocol versions.
- `server.json` manifest and `mcpName` for the official MCP Registry.
- Programmatic entry point (`import { ... } from "mcp-errorlens"`).
- Tests covering both protocol eras over an in-process Streamable HTTP
  handler, proxy end-to-end behaviour, the HTTP guards, and the CLI; smoke
  checks for stdio and HTTP transports.

### Fixed

- `npm run build` now cleans `dist/` and `dist-tests/` first, so a stale
  incremental build can no longer ship a partial `dist/`.

## [0.1.0] - 2026-07

- Initial release: structured error model, heuristic classifier, adapter
  rules, companion MCP server, stdio/Streamable HTTP proxy, JSONL traces, CLI.
