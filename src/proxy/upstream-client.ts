import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ServerConfig, StdioServerConfig } from "../config/config-model.js"

export type UpstreamConnection = {
  readonly serverName: string
  readonly client: Client
  readonly tools: readonly Tool[]
}

export async function connectStdioUpstream(
  serverName: string,
  config: StdioServerConfig,
): Promise<UpstreamConnection> {
  return connectUpstream(serverName, config)
}

export async function connectUpstream(
  serverName: string,
  config: ServerConfig,
): Promise<UpstreamConnection> {
  const client = new Client({
    name: `errorlens-proxy-${serverName}`,
    version: "0.1.0",
  })
  if (config.transport === "stdio") {
    await client.connect(new StdioClientTransport(stdioParameters(config)))
  } else {
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: config.headers },
    })
    await client.connect(transport as Parameters<Client["connect"]>[0])
  }
  const toolsResult = await client.listTools()
  return {
    serverName,
    client,
    tools: toolsResult.tools,
  }
}

export function stdioParameters(config: StdioServerConfig): StdioServerParameters {
  const base = {
    command: config.command,
    args: config.args,
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
