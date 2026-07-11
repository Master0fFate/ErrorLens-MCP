#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import type { ErrorLensConfig } from "../config/config-model.js"
import { loadConfig } from "../config/load-config.js"
import { loadConfiguredAdapterRules } from "../core/adapter-loader.js"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  registerSessionExitCleanup,
  sessionTracePath,
} from "../session/session-context.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { handleCallToolRequest } from "./call-handler.js"
import type { ProxyRegistry, ProxyRuntime, ToolMapping } from "./proxy-model.js"
import {
  closeUpstreamConnections,
  connectUpstream,
  type UpstreamConnection,
} from "./upstream-client.js"

export async function buildProxyRegistry(configPath: string): Promise<ProxyRegistry> {
  const config = await loadConfig(configPath)
  return buildProxyRegistryFromConfig(config)
}

async function buildProxyRegistryFromConfig(config: ErrorLensConfig): Promise<ProxyRegistry> {
  const exposedTools: Tool[] = []
  const mappings = new Map<string, ToolMapping>()
  const connections: UpstreamConnection[] = []

  try {
    for (const [serverName, serverConfig] of Object.entries(config.servers)) {
      const connection = await connectUpstream(serverName, serverConfig)
      connections.push(connection)
      for (const tool of connection.tools) {
        const exposedName = config.proxy.expose_tool_prefix
          ? `${serverName}__${tool.name}`
          : tool.name
        if (mappings.has(exposedName)) {
          throw new Error(
            `Duplicate exposed tool name "${exposedName}". Enable proxy.expose_tool_prefix to disambiguate upstream tools.`,
          )
        }
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
  const session = await createErrorLensSession()
  const unregisterExitCleanup = registerSessionExitCleanup(session)
  let registry: ProxyRegistry | undefined
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    unregisterExitCleanup()
    process.stdin.removeListener("end", cleanupOnStdinEnd)
    try {
      if (registry !== undefined) {
        await closeUpstreamConnections(registry.connections)
      }
    } finally {
      await disposeErrorLensSession(session)
    }
  }
  const cleanupOnStdinEnd = (): void => {
    void cleanup().catch((error: unknown) => {
      process.stderr.write(`ErrorLens session cleanup failed: ${summarizeCleanupError(error)}\n`)
    })
  }
  process.stdin.once("end", cleanupOnStdinEnd)
  try {
    const config = await loadConfig(configPath)
    const adapterRules = await loadConfiguredAdapterRules(configPath, config)
    registry = await buildProxyRegistryFromConfig(config)
    const tracePath = sessionTracePath(session, config.trace.path)
    const traceStore = new JsonlTraceStore(tracePath, config.trace.enabled)
    const server = createProxyMcpServer({ config, registry, traceStore, adapterRules })
    server.onclose = () => {
      void cleanup().catch((error: unknown) => {
        process.stderr.write(`ErrorLens session cleanup failed: ${summarizeCleanupError(error)}\n`)
      })
    }
    await server.connect(new StdioServerTransport())
  } catch (error) {
    await cleanup()
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
        "ErrorLens proxies upstream MCP tools, applies configured adapter rules, and returns structured recovery errors for failures.",
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
