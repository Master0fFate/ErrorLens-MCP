import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { StdioServerConfig } from "../config/config-model.js"

export type UpstreamConnection = {
  readonly serverName: string
  readonly client: Client
  readonly tools: readonly Tool[]
}

export async function connectStdioUpstream(
  serverName: string,
  config: StdioServerConfig,
): Promise<UpstreamConnection> {
  const client = new Client({
    name: `errorlens-proxy-${serverName}`,
    version: "0.1.0",
  })
  const transport = new StdioClientTransport(stdioParameters(config))
  await client.connect(transport)
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
