import type { CallToolRequest, Tool } from "@modelcontextprotocol/server"
import type { ErrorLensConfig } from "../config/config-model.js"
import type { AdapterRule } from "../core/adapters.js"
import type { SideEffectType } from "../core/taxonomy.js"
import type { JsonlTraceStore } from "../trace/jsonl-store.js"
import type { UpstreamConnection } from "./upstream-client.js"

export type ToolMapping = {
  readonly exposedName: string
  readonly upstreamName: string
  readonly serverName: string
  readonly tool: Tool
  readonly connection: UpstreamConnection
}

export type ProxyRegistryOptions = {
  readonly exposeToolPrefix: boolean
}

export type ProxyRegistry = {
  readonly tools: readonly Tool[]
  readonly mappings: ReadonlyMap<string, ToolMapping>
  readonly connections: readonly UpstreamConnection[]
}

type RegistrySnapshot = {
  readonly tools: readonly Tool[]
  readonly mappings: ReadonlyMap<string, ToolMapping>
}

/**
 * The exposed tool table of the proxy. It is rebuilt whenever an upstream
 * server reports a tool list change, and subscribers (one per downstream
 * connection, or the HTTP handler's notifier) learn about every rebuild so
 * they can forward `notifications/tools/list_changed`.
 */
export class ProxyToolRegistry implements ProxyRegistry {
  readonly #options: ProxyRegistryOptions
  readonly #connections: UpstreamConnection[] = []
  readonly #toolsByServer = new Map<string, readonly Tool[]>()
  readonly #listeners = new Set<() => void>()
  #snapshot: RegistrySnapshot = { tools: [], mappings: new Map() }

  constructor(options: ProxyRegistryOptions) {
    this.#options = options
  }

  get tools(): readonly Tool[] {
    return this.#snapshot.tools
  }

  get mappings(): ReadonlyMap<string, ToolMapping> {
    return this.#snapshot.mappings
  }

  get connections(): readonly UpstreamConnection[] {
    return this.#connections
  }

  /** Adds an upstream connection; throws if its tools collide with existing exposed names. */
  addConnection(connection: UpstreamConnection): void {
    if (this.#toolsByServer.has(connection.serverName)) {
      throw new Error(`Upstream server "${connection.serverName}" is already registered.`)
    }
    const next = new Map(this.#toolsByServer)
    next.set(connection.serverName, connection.tools)
    const snapshot = this.#build([...this.#connections, connection], next)
    this.#connections.push(connection)
    this.#toolsByServer.set(connection.serverName, connection.tools)
    this.#snapshot = snapshot
  }

  /** Replaces one upstream server's tool list and notifies subscribers. */
  updateTools(serverName: string, tools: readonly Tool[]): boolean {
    if (!this.#toolsByServer.has(serverName)) {
      return false
    }
    const next = new Map(this.#toolsByServer)
    next.set(serverName, tools)
    this.#snapshot = this.#build(this.#connections, next)
    this.#toolsByServer.set(serverName, tools)
    for (const listener of this.#listeners) {
      listener()
    }
    return true
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #build(
    connections: readonly UpstreamConnection[],
    toolsByServer: ReadonlyMap<string, readonly Tool[]>,
  ): RegistrySnapshot {
    const tools: Tool[] = []
    const mappings = new Map<string, ToolMapping>()
    for (const connection of connections) {
      for (const tool of toolsByServer.get(connection.serverName) ?? []) {
        const exposedName = this.#options.exposeToolPrefix
          ? `${connection.serverName}__${tool.name}`
          : tool.name
        if (mappings.has(exposedName)) {
          throw new Error(
            `Duplicate exposed tool name "${exposedName}". Enable proxy.expose_tool_prefix to disambiguate upstream tools.`,
          )
        }
        tools.push({
          ...tool,
          name: exposedName,
          description: decorateDescription(connection.serverName, tool),
        })
        mappings.set(exposedName, {
          exposedName,
          upstreamName: tool.name,
          serverName: connection.serverName,
          tool,
          connection,
        })
      }
    }
    return { tools, mappings }
  }
}

export function decorateDescription(serverName: string, tool: Tool): string {
  const prefix = `[ErrorLens proxy for ${serverName}/${tool.name}]`
  return tool.description === undefined ? prefix : `${prefix} ${tool.description}`
}

export type ProxyRuntime = {
  readonly config: ErrorLensConfig
  readonly registry: ProxyRegistry
  readonly traceStore: JsonlTraceStore
  readonly adapterRules: readonly AdapterRule[]
}

export type ToolArguments = NonNullable<CallToolRequest["params"]["arguments"]>

export type UpstreamCallContext = {
  readonly mapping: ToolMapping
  readonly argumentsValue: ToolArguments
  readonly sideEffectType: SideEffectType
  readonly startedAt: number
}
