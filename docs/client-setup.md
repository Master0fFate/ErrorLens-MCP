# Client Setup

ErrorLens speaks MCP over **stdio** (the client launches it) and over
**Streamable HTTP** (you run it, clients connect to a URL). Both servers are
built on the MCP TypeScript SDK v2, so one process serves 2025-era clients and
clients that already negotiate the 2026-07-28 protocol revision.

The fastest way to configure any client is to let the CLI print the snippet:

```sh
npx -y mcp-errorlens client-config <client> [--mode companion|proxy] [--transport stdio|http] [--launcher npx|global]
```

Supported client ids: `claude-desktop`, `claude-code`, `cursor`, `vscode`,
`windsurf`, `codex`, `gemini-cli`, `zed`, `cline`. The snippets below are what
the command prints with default options; the same files live in [`examples/`](../examples).

## Which server do I want?

| Mode        | Command                                   | Use it when                                                                  |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `companion` | `errorlens companion`                     | You want diagnostic tools (`classify_error`, `recommend_recovery`, ...) next to your other servers. |
| `proxy`     | `errorlens proxy --config <config.yaml>`  | You want ErrorLens between the client and one or more upstream servers so every failure comes back structured. |

Proxy mode needs a config file; create one with `errorlens init --dir .errorlens`
and pass an **absolute** path to `--config` so the client can start the proxy
from any working directory.

## stdio (client launches ErrorLens)

### Claude Desktop

`claude_desktop_config.json`:

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

On Windows, Claude Desktop needs the shell wrapper:
`"command": "cmd", "args": ["/c", "npx", "-y", "mcp-errorlens", "companion"]`.

### Claude Code

```sh
claude mcp add errorlens -- npx -y mcp-errorlens companion
# project scope (.mcp.json committed with the repo):
claude mcp add --scope project errorlens -- npx -y mcp-errorlens companion
```

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

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

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "errorlens": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-errorlens", "companion"]
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

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

### OpenAI Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.errorlens]
command = "npx"
args = ["-y", "mcp-errorlens", "companion"]
```

### Gemini CLI

`~/.gemini/settings.json`:

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

### Zed

`settings.json`:

```json
{
  "context_servers": {
    "errorlens": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "mcp-errorlens", "companion"],
      "env": {}
    }
  }
}
```

### Cline / Roo Code

`cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "errorlens": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-errorlens", "companion"]
    }
  }
}
```

### Global install instead of npx

`npm install -g mcp-errorlens` installs the `errorlens`, `errorlens-companion`
and `errorlens-proxy` bins. Pass `--launcher global` to `client-config`, or
replace `npx -y mcp-errorlens companion` with `errorlens companion` in any
snippet above.

## Streamable HTTP (you run ErrorLens)

Start the server once:

```sh
errorlens companion --transport http                      # http://127.0.0.1:3939/mcp
errorlens proxy --config /abs/.errorlens/config.yaml --transport http --port 4000
```

Then point the client at the URL. `client-config <client> --transport http`
prints the right shape for each client:

| Client        | Setting                                                        |
| ------------- | -------------------------------------------------------------- |
| Claude Code   | `claude mcp add --transport http errorlens http://127.0.0.1:3939/mcp` |
| Cursor        | `"errorlens": { "url": "http://127.0.0.1:3939/mcp" }`           |
| VS Code       | `"errorlens": { "type": "http", "url": "http://127.0.0.1:3939/mcp" }` |
| Windsurf      | `"errorlens": { "serverUrl": "http://127.0.0.1:3939/mcp" }`     |
| Codex CLI     | `url = "http://127.0.0.1:3939/mcp"`                             |
| Gemini CLI    | `"errorlens": { "httpUrl": "http://127.0.0.1:3939/mcp" }`       |
| Cline         | `"errorlens": { "type": "streamableHttp", "url": "..." }`       |
| Claude Desktop | Add the URL under Settings > Connectors.                      |

Flags:

| Flag                        | Default      | Meaning                                                             |
| --------------------------- | ------------ | ------------------------------------------------------------------- |
| `--host <host>`             | `127.0.0.1`  | Bind address. Loopback binds enable Host/Origin guards automatically. |
| `--port <port>`             | `3939`       | `0` picks a free port; the bound URL is printed on stderr.          |
| `--path <path>`             | `/mcp`       | Endpoint path.                                                      |
| `--allowed-host <host...>`  | none         | Extra `Host` header values to accept (for example a reverse-proxy hostname). |
| `--allowed-origin <o...>`   | none         | Browser origins to accept. Non-browser clients send no `Origin` and always pass. |

The HTTP endpoint is stateless: each request is served by a fresh server
instance, which is what lets the same URL serve the 2025 `initialize`
handshake and the 2026-07-28 `server/discover` flow. There is no
authentication layer; keep it on loopback or put it behind an authenticating
reverse proxy.

## Verify the setup

```sh
errorlens doctor --config .errorlens/config.yaml        # config, upstream commands, protocol versions
npx @modelcontextprotocol/inspector npx -y mcp-errorlens companion   # interactive tool browser
```

Troubleshooting:

- **`Unexpected token ... is not valid JSON` in the client log.** Something
  wrote to stdout. ErrorLens itself only logs to stderr; check upstream servers
  in proxy mode (their stderr is forwarded with a `[server]` prefix).
- **Tools missing after an upstream restart.** The proxy forwards
  `tools/list_changed`; clients that ignore the notification need a reconnect.
- **Duplicate tool name error on startup.** Two upstreams expose the same tool;
  keep `proxy.expose_tool_prefix: true` so tools are exposed as `server__tool`.
