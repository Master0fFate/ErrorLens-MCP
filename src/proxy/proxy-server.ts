#!/usr/bin/env node
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { type ListToolsResult, Server } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import type { ErrorLensConfig } from "../config/config-model.js"
import { loadConfig } from "../config/load-config.js"
import { loadConfiguredAdapterRules } from "../core/adapter-loader.js"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  registerSessionExitCleanup,
  sessionTracePath,
} from "../session/session-context.js"
import { parseServeArgv, serveUsage } from "../shared/argv.js"
import { serveHttp } from "../shared/http-server.js"
import { implementationInfo, packageInfo } from "../shared/package-info.js"
import {
  DEFAULT_SERVE_OPTIONS,
  resolveServeOptions,
  type ServeOptions,
} from "../shared/serve-options.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { handleCallToolRequest } from "./call-handler.js"
import { type ProxyRuntime, ProxyToolRegistry } from "./proxy-model.js"
import {
  closeUpstreamConnections,
  connectUpstream,
  type UpstreamConnection,
} from "./upstream-client.js"

export const PROXY_SERVER_NAME = "mcp-errorlens-proxy"

export const PROXY_INSTRUCTIONS =
  "ErrorLens proxies upstream MCP tools, applies configured adapter rules, and returns structured recovery errors for failures. A failed call comes back as a normal tool result with isError=true whose structuredContent is an ErrorLens error: check retry.safe and state_impact before retrying."

export type ProxyBuildHooks = {
  readonly onError?: (error: Error) => void
}

export async function buildProxyRegistry(
  configPath: string,
  hooks: ProxyBuildHooks = {},
): Promise<ProxyToolRegistry> {
  const config = await loadConfig(configPath)
  return buildProxyRegistryFromConfig(config, hooks)
}

export async function buildProxyRegistryFromConfig(
  config: ErrorLensConfig,
  hooks: ProxyBuildHooks = {},
): Promise<ProxyToolRegistry> {
  const registry = new ProxyToolRegistry({ exposeToolPrefix: config.proxy.expose_tool_prefix })
  const connections: UpstreamConnection[] = []
  const reportError = hooks.onError ?? (() => undefined)

  try {
    for (const [serverName, serverConfig] of Object.entries(config.servers)) {
      const connection = await connectUpstream(serverName, serverConfig, {
        onToolsChanged: (name, tools) => {
          try {
            registry.updateTools(name, tools)
          } catch (error) {
            reportError(toError(error))
          }
        },
        onError: (name, error) => {
          reportError(new Error(`upstream ${name}: ${error.message}`, { cause: error }))
        },
      })
      connections.push(connection)
      registry.addConnection(connection)
    }
  } catch (error) {
    await closeUpstreamConnections(connections).catch(() => undefined)
    throw error
  }

  return registry
}

/**
 * Starts the proxy over stdio (default) or Streamable HTTP. Every downstream
 * connection is served by a fresh low-level `Server` bound to the shared
 * upstream registry, so one process serves 2025-era and 2026-07-28 clients.
 */
export async function startProxyServer(
  configPath: string,
  serve: ServeOptions = DEFAULT_SERVE_OPTIONS,
): Promise<void> {
  const session = await createErrorLensSession()
  const unregisterExitCleanup = registerSessionExitCleanup(session)
  let registry: ProxyToolRegistry | undefined
  let shutdown: () => Promise<void> = async () => undefined
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    unregisterExitCleanup()
    process.stdin.removeListener("end", cleanupOnStdinEnd)
    try {
      await shutdown()
    } finally {
      try {
        if (registry !== undefined) {
          await closeUpstreamConnections(registry.connections)
        }
      } finally {
        await disposeErrorLensSession(session)
      }
    }
  }
  const cleanupOnStdinEnd = (): void => {
    void cleanup().catch(logCleanupError)
  }

  try {
    const config = await loadConfig(configPath)
    const adapterRules = await loadConfiguredAdapterRules(configPath, config)
    const activeRegistry = await buildProxyRegistryFromConfig(config, { onError: logError })
    registry = activeRegistry
    const tracePath = sessionTracePath(session, config.trace.path)
    const traceStore = new JsonlTraceStore(tracePath, config.trace.enabled)
    const runtime: ProxyRuntime = { config, registry: activeRegistry, traceStore, adapterRules }

    if (serve.transport === "http") {
      const running = await serveHttp(() => createProxyMcpServer(runtime), {
        ...serve,
        onerror: logError,
      })
      const unsubscribe = activeRegistry.subscribe(() => running.handler.notify.toolsChanged())
      shutdown = async () => {
        unsubscribe()
        await running.close()
      }
      process.stderr.write(
        `ErrorLens proxy listening on ${running.url} (${activeRegistry.tools.length} tools from ${activeRegistry.connections.length} upstream servers)\n`,
      )
      return
    }

    process.stdin.once("end", cleanupOnStdinEnd)
    const handle = serveStdio(
      () => {
        const server = createProxyMcpServer(runtime)
        const unsubscribe = activeRegistry.subscribe(() => {
          server.sendToolListChanged().catch(logError)
        })
        server.onclose = () => {
          unsubscribe()
          void cleanup().catch(logCleanupError)
        }
        return server
      },
      { onerror: logError },
    )
    shutdown = () => handle.close()
  } catch (error) {
    await cleanup()
    throw error
  }
}

export function createProxyMcpServer(runtime: ProxyRuntime): Server {
  const server = new Server(
    implementationInfo(
      PROXY_SERVER_NAME,
      "Reliability proxy that wraps upstream MCP tool failures in structured recovery guidance.",
    ),
    {
      capabilities: {
        tools: { listChanged: true },
      },
      instructions: PROXY_INSTRUCTIONS,
    },
  )

  server.setRequestHandler(
    "tools/list",
    async (): Promise<ListToolsResult> => ({ tools: [...runtime.registry.tools] }),
  )
  server.setRequestHandler("tools/call", async (request) => handleCallToolRequest(runtime, request))
  return server
}

function logError(error: unknown): void {
  process.stderr.write(`ErrorLens proxy: ${toError(error).message}\n`)
}

function logCleanupError(error: unknown): void {
  process.stderr.write(`ErrorLens session cleanup failed: ${toError(error).message}\n`)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const parsed = parseServeArgv(process.argv.slice(2))
  if (parsed.help) {
    process.stderr.write(`${serveUsage("errorlens-proxy", "--config <path>] [")}\n`)
  } else if (parsed.version) {
    process.stdout.write(`${packageInfo().version}\n`)
  } else {
    await startProxyServer(
      resolve(parsed.config ?? ".errorlens/config.yaml"),
      resolveServeOptions(parsed.serve),
    )
  }
}
