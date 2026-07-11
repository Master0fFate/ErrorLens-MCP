import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js"
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

export type ProxyRegistry = {
  readonly tools: readonly Tool[]
  readonly mappings: ReadonlyMap<string, ToolMapping>
  readonly connections: readonly UpstreamConnection[]
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
