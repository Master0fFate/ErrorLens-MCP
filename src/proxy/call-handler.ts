import {
  type CallToolRequest,
  type CallToolResult,
  CallToolResultSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import type { ErrorLensConfig } from "../config/config-model.js"
import { createTraceId } from "../core/structured-error-model.js"
import type { SideEffectType } from "../core/taxonomy.js"
import type { ProxyRuntime, UpstreamCallContext } from "./proxy-model.js"
import { successTrace, wrapFailure } from "./result-wrapper.js"

type TimeoutMarker = {
  readonly kind: "timeout"
}

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
    return toolNotFoundResult(runtime.config, request.params.name, argumentsValue)
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
    return appendFailure(runtime, {
      ...failureBase(callContext),
      rawError: error,
      rawResult: null,
      durationMs: Date.now() - callContext.startedAt,
      timedOut: false,
    })
  }
}

function toolNotFoundResult(
  config: ErrorLensConfig,
  toolName: string,
  argumentsValue: unknown,
): CallToolResult {
  return wrapFailure({
    serverName: "errorlens",
    toolName,
    argumentsValue,
    rawError: `Tool not found: ${toolName}`,
    rawResult: null,
    durationMs: 0,
    sideEffectType: "unknown",
    timedOut: false,
    redactSecrets: config.trace.redact_secrets,
  }).result
}

async function callUpstream(
  runtime: ProxyRuntime,
  callContext: UpstreamCallContext,
): Promise<CallToolResult> {
  const pending = callContext.mapping.connection.client.callTool({
    name: callContext.mapping.upstreamName,
    arguments: callContext.argumentsValue,
  })
  const outcome = await withTimeout(pending, runtime.config.proxy.default_timeout_ms)
  const durationMs = Date.now() - callContext.startedAt

  if (isTimeout(outcome)) {
    return appendFailure(runtime, {
      ...failureBase(callContext),
      rawError: `Timed out after ${runtime.config.proxy.default_timeout_ms} ms`,
      rawResult: null,
      durationMs,
      timedOut: true,
    })
  }

  const result = CallToolResultSchema.parse(outcome)
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
    redactSecrets: runtime.config.trace.redact_secrets,
  })
  await runtime.traceStore.append(wrapped.trace)
  return wrapped.result
}

async function appendSuccess(
  runtime: ProxyRuntime,
  callContext: UpstreamCallContext,
  durationMs: number,
): Promise<void> {
  await runtime.traceStore.append(
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

function inferSideEffect(tool: Tool): SideEffectType {
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | TimeoutMarker> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<TimeoutMarker>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

function isTimeout(value: unknown): value is TimeoutMarker {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "timeout"
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
