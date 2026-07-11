import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { AdapterRule } from "../core/adapters.js"
import { classifyError, summarizeUnknown } from "../core/classifier.js"
import { redactText, redactUnknown } from "../core/redaction.js"
import type { ClassifyErrorInput, StructuredError } from "../core/structured-error-model.js"
import type { SideEffectType } from "../core/taxonomy.js"
import { jsonToolResult } from "../shared/tool-result.js"
import type { TraceRecord } from "../trace/trace-model.js"

export type ToolFailureContext = {
  readonly serverName: string
  readonly toolName: string
  readonly argumentsValue: unknown
  readonly rawError: unknown
  readonly rawResult: unknown
  readonly durationMs: number
  readonly sideEffectType: SideEffectType
  readonly timedOut: boolean
  readonly redactSecrets: boolean
  readonly adapterRules?: readonly AdapterRule[]
  readonly loadBuiltin?: boolean
}

export function wrapFailure(context: ToolFailureContext): {
  readonly result: CallToolResult
  readonly trace: TraceRecord
  readonly structured: StructuredError
} {
  const safeArguments = context.redactSecrets
    ? redactUnknown(context.argumentsValue)
    : context.argumentsValue
  const safeRawError = context.redactSecrets
    ? redactDiagnosticValue(context.rawError)
    : context.rawError
  const safeRawResult = context.redactSecrets
    ? redactDiagnosticValue(context.rawResult)
    : context.rawResult
  const classificationInput: ClassifyErrorInput = {
    server_name: context.serverName,
    tool_name: context.toolName,
    raw_error: safeRawError,
    raw_result: safeRawResult,
    duration_ms: context.durationMs,
    tool_arguments_summary: safeArguments,
    tool_side_effect_type: context.sideEffectType,
    timed_out: context.timedOut,
  }
  const structured = classifyError(
    classificationInput,
    context.adapterRules,
    context.loadBuiltin ?? true,
  )
  const trace: TraceRecord = {
    trace_id: structured.trace_id,
    timestamp: new Date().toISOString(),
    server_name: context.serverName,
    tool_name: context.toolName,
    duration_ms: context.durationMs,
    outcome: "error",
    arguments: safeArguments,
    raw_error_summary: summarizeUnknown(safeRawError),
    structured_error: structured,
  }
  return {
    result: jsonToolResult(structured, true),
    trace,
    structured,
  }
}

function redactDiagnosticValue(value: unknown): unknown {
  if (value instanceof Error) {
    return redactText(value.message)
  }
  return redactUnknown(value)
}

export function successTrace(input: {
  readonly traceId: string
  readonly serverName: string
  readonly toolName: string
  readonly argumentsValue: unknown
  readonly durationMs: number
  readonly redactSecrets: boolean
}): TraceRecord {
  return {
    trace_id: input.traceId,
    timestamp: new Date().toISOString(),
    server_name: input.serverName,
    tool_name: input.toolName,
    duration_ms: input.durationMs,
    outcome: "success",
    arguments: input.redactSecrets ? redactUnknown(input.argumentsValue) : input.argumentsValue,
    raw_error_summary: "",
    structured_error: null,
  }
}
