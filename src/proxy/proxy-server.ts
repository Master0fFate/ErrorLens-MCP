import { pathToFileURL } from "node:url"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { loadConfig } from "../config/load-config.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { handleCallToolRequest } from "./call-handler.js"
import type { ProxyRegistry, ProxyRuntime, ToolMapping } from "./proxy-model.js"
import {
  closeUpstreamConnections,
  connectStdioUpstream,
  type UpstreamConnection,
} from "./upstream-client.js"

export async function buildProxyRegistry(configPath: string): Promise<ProxyRegistry> {
  const config = await loadConfig(configPath)
  const exposedTools: Tool[] = []
  const mappings = new Map<string, ToolMapping>()
  const connections: UpstreamConnection[] = []

  try {
    for (const [serverName, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.transport !== "stdio") {
        continue
      }
      const connection = await connectStdioUpstream(serverName, serverConfig)
      connections.push(connection)
      for (const tool of connection.tools) {
        const exposedName = config.proxy.expose_tool_prefix
          ? `${serverName}__${tool.name}`
          : tool.name
        const exposedTool: Tool = {
          ...tool,
          name: exposedName,
          description: decorateDescription(serverName, tool),
        }
        exposedTools.push(exposedTool)
        mappings.set(exposedName, {
          exposedName,
          upstreamName: tool.name,
          serverName,
          tool,
          connection,
        })
      }
    }
  } catch (error) {
    await closeUpstreamConnections(connections)
    throw error
  }

  return {
    tools: exposedTools,
    mappings,
    connections,
  }
}

export async function startProxyServer(configPath: string): Promise<void> {
  const config = await loadConfig(configPath)
  const registry = await buildProxyRegistry(configPath)
  const traceStore = new JsonlTraceStore(config.trace.path, config.trace.enabled)
  const server = createProxyMcpServer({ config, registry, traceStore })
  server.onclose = () => {
    void closeUpstreamConnections(registry.connections).catch((error: unknown) => {
      process.stderr.write(`ErrorLens upstream cleanup failed: ${summarizeCleanupError(error)}\n`)
    })
  }

  try {
    await server.connect(new StdioServerTransport())
  } catch (error) {
    await closeUpstreamConnections(registry.connections)
    throw error
  }
}

function createProxyMcpServer(runtime: ProxyRuntime): Server {
  const server = new Server(
    {
      name: "mcp-errorlens-proxy",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "ErrorLens proxies upstream MCP tools and returns structured recovery errors for failures.",
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: runtime.registry.tools }))
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleCallToolRequest(runtime, request),
  )
  return server
}

function decorateDescription(serverName: string, tool: Tool): string {
  const prefix = `[ErrorLens proxy for ${serverName}/${tool.name}]`
  return tool.description === undefined ? prefix : `${prefix} ${tool.description}`
}

function summarizeCleanupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseConfigArg(argv: readonly string[]): string {
  const index = argv.indexOf("--config")
  const next = index >= 0 ? argv[index + 1] : undefined
  return next ?? ".errorlens/config.yaml"
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await startProxyServer(parseConfigArg(process.argv))
}
