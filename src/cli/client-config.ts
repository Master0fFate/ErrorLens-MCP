import { PACKAGE_NAME } from "../shared/package-info.js"
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PATH, DEFAULT_HTTP_PORT } from "../shared/serve-options.js"

export const CLIENT_IDS = [
  "claude-desktop",
  "claude-code",
  "cursor",
  "vscode",
  "windsurf",
  "codex",
  "gemini-cli",
  "zed",
  "cline",
] as const

export type ClientId = (typeof CLIENT_IDS)[number]

export const CLIENT_LABELS: Record<ClientId, string> = {
  "claude-desktop": "Claude Desktop",
  "claude-code": "Claude Code",
  cursor: "Cursor",
  vscode: "VS Code (GitHub Copilot agent mode)",
  windsurf: "Windsurf",
  codex: "OpenAI Codex CLI",
  "gemini-cli": "Gemini CLI",
  zed: "Zed",
  cline: "Cline / Roo Code",
}

export type ClientConfigMode = "companion" | "proxy"
export type ClientConfigLauncher = "npx" | "global"
export type ClientConfigTransport = "stdio" | "http"

export type ClientConfigRequest = {
  readonly client: ClientId
  readonly mode: ClientConfigMode
  readonly transport: ClientConfigTransport
  readonly launcher: ClientConfigLauncher
  /** Path to the ErrorLens YAML config; proxy mode only. */
  readonly configPath?: string | undefined
  /** MCP endpoint URL; http transport only. */
  readonly url?: string | undefined
  /** Server entry name inside the client configuration. */
  readonly serverName?: string | undefined
}

export type ClientConfigSnippet = {
  readonly client: ClientId
  readonly format: "json" | "toml" | "shell"
  readonly file: string
  readonly content: string
  readonly notes: readonly string[]
}

export const DEFAULT_HTTP_URL = `http://${DEFAULT_HTTP_HOST}:${DEFAULT_HTTP_PORT}${DEFAULT_HTTP_PATH}`

export function isClientId(value: string): value is ClientId {
  return (CLIENT_IDS as readonly string[]).includes(value)
}

type LaunchCommand = {
  readonly command: string
  readonly args: readonly string[]
}

export function launchCommand(request: ClientConfigRequest): LaunchCommand {
  const subcommand =
    request.mode === "proxy"
      ? ["proxy", "--config", request.configPath ?? ".errorlens/config.yaml"]
      : ["companion"]
  if (request.launcher === "global") {
    return { command: "errorlens", args: subcommand }
  }
  return { command: "npx", args: ["-y", PACKAGE_NAME, ...subcommand] }
}

export function renderClientConfig(request: ClientConfigRequest): ClientConfigSnippet {
  const name = request.serverName ?? (request.mode === "proxy" ? "errorlens-proxy" : "errorlens")
  const url = request.url ?? DEFAULT_HTTP_URL
  const launch = launchCommand(request)
  const notes: string[] = []
  if (request.transport === "http") {
    notes.push(
      `Start the server first: errorlens ${request.mode === "proxy" ? "proxy --config <path> " : "companion "}--transport http`,
    )
  }
  if (request.mode === "proxy" && request.transport === "stdio") {
    notes.push(
      "Use an absolute --config path so the client can start the proxy from any directory.",
    )
  }

  switch (request.client) {
    case "claude-desktop":
      notes.push('On Windows wrap the launcher: "command": "cmd", "args": ["/c", "npx", ...].')
      if (request.transport === "http") {
        notes.push(
          "Claude Desktop adds remote MCP servers under Settings > Connectors instead of this file.",
        )
      }
      return {
        client: request.client,
        format: "json",
        file: "claude_desktop_config.json",
        content: json({ mcpServers: { [name]: stdioOrUrl(request, launch, { url }) } }),
        notes,
      }
    case "claude-code": {
      const command =
        request.transport === "http"
          ? `claude mcp add --transport http ${name} ${url}`
          : `claude mcp add ${name} -- ${[launch.command, ...launch.args].join(" ")}`
      notes.push(
        "Add --scope project to write .mcp.json for the repository instead of your user settings.",
      )
      return {
        client: request.client,
        format: "shell",
        file: ".mcp.json (via claude mcp add)",
        content: command,
        notes,
      }
    }
    case "cursor":
      return {
        client: request.client,
        format: "json",
        file: ".cursor/mcp.json",
        content: json({ mcpServers: { [name]: stdioOrUrl(request, launch, { url }) } }),
        notes,
      }
    case "vscode":
      return {
        client: request.client,
        format: "json",
        file: ".vscode/mcp.json",
        content: json({
          servers: {
            [name]:
              request.transport === "http"
                ? { type: "http", url }
                : { type: "stdio", command: launch.command, args: launch.args },
          },
        }),
        notes,
      }
    case "windsurf":
      return {
        client: request.client,
        format: "json",
        file: "~/.codeium/windsurf/mcp_config.json",
        content: json({ mcpServers: { [name]: stdioOrUrl(request, launch, { serverUrl: url }) } }),
        notes,
      }
    case "codex":
      return {
        client: request.client,
        format: "toml",
        file: "~/.codex/config.toml",
        content:
          request.transport === "http"
            ? `[mcp_servers.${name}]\nurl = ${JSON.stringify(url)}\n`
            : `[mcp_servers.${name}]\ncommand = ${JSON.stringify(launch.command)}\nargs = ${json([...launch.args]).replace(/\n\s*/gu, " ")}\n`,
        notes,
      }
    case "gemini-cli":
      return {
        client: request.client,
        format: "json",
        file: "~/.gemini/settings.json",
        content: json({ mcpServers: { [name]: stdioOrUrl(request, launch, { httpUrl: url }) } }),
        notes,
      }
    case "zed":
      if (request.transport === "http") {
        notes.push("Zed launches local stdio servers; this snippet uses stdio instead of the URL.")
      }
      return {
        client: request.client,
        format: "json",
        file: "settings.json",
        content: json({
          context_servers: {
            [name]: { source: "custom", command: launch.command, args: launch.args, env: {} },
          },
        }),
        notes,
      }
    case "cline":
      return {
        client: request.client,
        format: "json",
        file: "cline_mcp_settings.json",
        content: json({
          mcpServers: {
            [name]:
              request.transport === "http"
                ? { type: "streamableHttp", url }
                : { type: "stdio", command: launch.command, args: launch.args },
          },
        }),
        notes,
      }
    default:
      return assertNever(request.client)
  }
}

function stdioOrUrl(
  request: ClientConfigRequest,
  launch: LaunchCommand,
  urlEntry: Record<string, string>,
): Record<string, unknown> {
  return request.transport === "http"
    ? urlEntry
    : { command: launch.command, args: [...launch.args] }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function assertNever(value: never): never {
  throw new Error(`Unsupported client: ${String(value)}`)
}
