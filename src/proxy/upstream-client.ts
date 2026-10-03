import {
  Client,
  type ClientOptions,
  StreamableHTTPClientTransport,
  type Tool,
  type Transport,
} from "@modelcontextprotocol/client"
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/client/stdio"
import type { ServerConfig, StdioServerConfig } from "../config/config-model.js"
import { implementationInfo } from "../shared/package-info.js"

export type UpstreamConnection = {
  readonly serverName: string
  readonly client: Client
  readonly tools: readonly Tool[]
}

export type UpstreamHooks = {
  /** Called with the refreshed tool list after the upstream sent `tools/list_changed`. */
  readonly onToolsChanged?: (serverName: string, tools: readonly Tool[]) => void
  readonly onError?: (serverName: string, error: Error) => void
}

export type UpstreamNegotiation = ServerConfig["negotiation"]

export async function connectStdioUpstream(
  serverName: string,
  config: StdioServerConfig,
  hooks: UpstreamHooks = {},
): Promise<UpstreamConnection> {
  return connectUpstream(serverName, config, hooks)
}

export async function connectUpstream(
  serverName: string,
  config: ServerConfig,
  hooks: UpstreamHooks = {},
): Promise<UpstreamConnection> {
  const transport = createUpstreamTransport(serverName, config)
  return connectUpstreamTransport(serverName, transport, hooks, config.negotiation)
}

/**
 * Connects an upstream MCP server over an already constructed transport and
 * lists its tools. `negotiation: "auto"` probes for the 2026-07-28 protocol
 * revision first; the default keeps the classic `initialize` handshake,
 * which every MCP server understands.
 */
export async function connectUpstreamTransport(
  serverName: string,
  transport: Transport,
  hooks: UpstreamHooks = {},
  negotiation: UpstreamNegotiation = "legacy",
): Promise<UpstreamConnection> {
  const client = new Client(
    implementationInfo(`errorlens-proxy-${serverName}`),
    clientOptions(serverName, hooks, negotiation),
  )
  await client.connect(transport)
  const toolsResult = await client.listTools()
  return {
    serverName,
    client,
    tools: toolsResult.tools,
  }
}

function createUpstreamTransport(serverName: string, config: ServerConfig): Transport {
  if (config.transport === "stdio") {
    const transport = new StdioClientTransport(stdioParameters(config))
    forwardUpstreamStderr(serverName, transport)
    return transport
  }
  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
  })
}

function clientOptions(
  serverName: string,
  hooks: UpstreamHooks,
  negotiation: UpstreamNegotiation,
): ClientOptions {
  const options: ClientOptions = {}
  if (negotiation === "auto") {
    options.versionNegotiation = { mode: "auto" }
  }
  const onToolsChanged = hooks.onToolsChanged
  if (onToolsChanged !== undefined) {
    options.listChanged = {
      tools: {
        autoRefresh: true,
        onChanged: (error, tools) => {
          if (error !== null) {
            hooks.onError?.(serverName, error)
            return
          }
          if (tools !== null) {
            onToolsChanged(serverName, tools)
          }
        },
      },
    }
  }
  return options
}

/**
 * Upstream stderr is piped so it never interleaves with our own protocol
 * stream, then drained line by line onto our stderr. Leaving a piped stream
 * unread would eventually block a chatty upstream on a full pipe buffer.
 */
function forwardUpstreamStderr(serverName: string, transport: StdioClientTransport): void {
  const stderr = transport.stderr
  if (stderr === null) {
    return
  }
  stderr.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString()
    for (const line of text.split(/\r?\n/u)) {
      if (line.length > 0) {
        process.stderr.write(`[${serverName}] ${line}\n`)
      }
    }
  })
}

export function stdioParameters(config: StdioServerConfig): StdioServerParameters {
  const base = {
    command: config.command,
    args: [...config.args],
    env: { ...config.env },
    stderr: "pipe",
  } satisfies StdioServerParameters
  return config.cwd === undefined ? base : { ...base, cwd: config.cwd }
}

export async function closeUpstreamConnections(
  connections: readonly UpstreamConnection[],
): Promise<void> {
  const failures: unknown[] = []
  for (const connection of connections) {
    try {
      await connection.client.close()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to close one or more upstream MCP clients")
  }
}
