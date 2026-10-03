import {
  type CallToolRequest,
  type CallToolResult,
  ProtocolError,
  ProtocolErrorCode,
  SdkErrorCode,
  type Tool,
} from "@modelcontextprotocol/server"
import { createTraceId } from "../core/structured-error-model.js"
import type { SideEffectType } from "../core/taxonomy.js"
import type { TraceRecord } from "../trace/trace-model.js"
import type { ProxyRuntime, UpstreamCallContext } from "./proxy-model.js"
import { successTrace, wrapFailure } from "./result-wrapper.js"

type FailureRecordInput = {
  readonly serverName: string
  readonly toolName: string
  readonly argumentsValue: unknown
  readonly rawError: unknown
  readonly rawResult: unknown
  readonly durationMs: number
  readonly sideEffectType: SideEffectType
  readonly timedOut: boolean
}

export async function handleCallToolRequest(
  runtime: ProxyRuntime,
  request: CallToolRequest,
): Promise<CallToolResult> {
  const mapping = runtime.registry.mappings.get(request.params.name)
  const argumentsValue = request.params.arguments ?? {}
  if (mapping === undefined) {
    // Unknown tools stay JSON-RPC protocol errors, as MCP requires.
    throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`)
  }

  const callContext: UpstreamCallContext = {
    mapping,
    argumentsValue,
    sideEffectType: inferSideEffect(mapping.tool),
    startedAt: Date.now(),
  }
  try {
    return await callUpstream(runtime, callContext)
  } catch (error) {
    const timedOut = isRequestTimeout(error)
    return appendFailure(runtime, {
      ...failureBase(callContext),
      rawError: timedOut ? `Timed out after ${runtime.config.proxy.default_timeout_ms} ms` : error,
      rawResult: null,
      durationMs: Date.now() - callContext.startedAt,
      timedOut,
    })
  }
}

async function callUpstream(
  runtime: ProxyRuntime,
  callContext: UpstreamCallContext,
): Promise<CallToolResult> {
  const result = await callContext.mapping.connection.client.callTool(
    {
      name: callContext.mapping.upstreamName,
      arguments: callContext.argumentsValue,
    },
    { timeout: runtime.config.proxy.default_timeout_ms },
  )
  const durationMs = Date.now() - callContext.startedAt

  if (result.isError === true) {
    return appendFailure(runtime, {
      ...failureBase(callContext),
      rawError: null,
      rawResult: result,
      durationMs,
      timedOut: false,
    })
  }

  await appendSuccess(runtime, callContext, durationMs)
  return trimResult(result, runtime.config.proxy.max_result_chars)
}

function failureBase(
  callContext: UpstreamCallContext,
): Omit<FailureRecordInput, "durationMs" | "rawError" | "rawResult" | "timedOut"> {
  return {
    serverName: callContext.mapping.serverName,
    toolName: callContext.mapping.upstreamName,
    argumentsValue: callContext.argumentsValue,
    sideEffectType: callContext.sideEffectType,
  }
}

async function appendFailure(
  runtime: ProxyRuntime,
  input: FailureRecordInput,
): Promise<CallToolResult> {
  const wrapped = wrapFailure({
    ...input,
    adapterRules: runtime.adapterRules,
    loadBuiltin: runtime.config.rules.load_builtin,
    redactSecrets: runtime.config.trace.redact_secrets,
  })
  await appendTrace(runtime, wrapped.trace)
  return wrapped.result
}

async function appendSuccess(
  runtime: ProxyRuntime,
  callContext: UpstreamCallContext,
  durationMs: number,
): Promise<void> {
  await appendTrace(
    runtime,
    successTrace({
      traceId: createTraceId(),
      serverName: callContext.mapping.serverName,
      toolName: callContext.mapping.upstreamName,
      argumentsValue: callContext.argumentsValue,
      durationMs,
      redactSecrets: runtime.config.trace.redact_secrets,
    }),
  )
}

async function appendTrace(runtime: ProxyRuntime, record: TraceRecord): Promise<void> {
  try {
    await runtime.traceStore.append(record)
  } catch (error) {
    console.error(`ErrorLens trace write failed: ${summarizeTraceError(error)}`)
  }
}

function summarizeTraceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function inferSideEffect(tool: Tool): SideEffectType {
  if (tool.annotations?.destructiveHint === true) {
    return "destructive"
  }
  if (tool.annotations?.readOnlyHint === true) {
    return "read"
  }
  const lowered = tool.name.toLowerCase()
  if (containsToolVerb(lowered, ["delete", "remove", "destroy", "drop", "purge"])) {
    return "destructive"
  }
  if (
    containsToolVerb(lowered, ["create", "update", "write", "patch", "insert", "send", "ticket"])
  ) {
    return "write"
  }
  return "unknown"
}

function containsToolVerb(toolName: string, verbs: readonly string[]): boolean {
  return verbs.some((verb) => toolName.includes(verb))
}

function isRequestTimeout(error: unknown): boolean {
  // Matched on the stable `code` field rather than `instanceof`: the error
  // originates in the client package and this handler runs in the server one.
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === SdkErrorCode.RequestTimeout
  )
}

function trimResult(result: CallToolResult, maxChars: number): CallToolResult {
  return {
    ...result,
    content: result.content.map((item) => {
      if (item.type !== "text" || item.text.length <= maxChars) {
        return item
      }
      return {
        ...item,
        text: `${item.text.slice(0, maxChars)}\n[ErrorLens truncated result]`,
      }
    }),
  }
}
