import type { AdapterRule } from "./adapters.js"
import type { ClassificationSpec, MessageFacts } from "./classification-spec.js"
import { classifyByHeuristics } from "./heuristic-rules.js"
import { redactText, redactUnknown } from "./redaction.js"
import {
  type ClassifyErrorInput,
  createTraceId,
  type ErrorDetails,
  type ErrorEvidence,
  type StructuredError,
} from "./structured-error-model.js"

export function classifyError(
  input: ClassifyErrorInput,
  adapterRules: readonly AdapterRule[] = [],
): StructuredError {
  const safeInput = sanitizeClassifyInput(input)
  const facts = extractFacts(safeInput)
  const adapterSpec = matchAdapterRule(safeInput, facts, adapterRules)
  const spec = adapterSpec ?? classifyByHeuristics(safeInput, facts)
  const error: ErrorDetails = {
    code: spec.code,
    layer: spec.layer,
    category: spec.category,
    permanence: spec.permanence,
    retry: spec.retry,
    state_impact: spec.stateImpact,
    user_action_required: spec.userActionRequired,
    confidence: spec.confidence,
    agent_next_steps: [...spec.nextSteps],
    do_not: [...spec.doNot],
    evidence: buildEvidence(safeInput, facts),
  }
  return { ok: false, trace_id: createTraceId(), error }
}

function sanitizeClassifyInput(input: ClassifyErrorInput): ClassifyErrorInput {
  return {
    ...input,
    raw_error: redactDiagnosticValue(input.raw_error),
    raw_result: redactDiagnosticValue(input.raw_result),
    tool_arguments_summary: redactDiagnosticValue(input.tool_arguments_summary),
  }
}

function redactDiagnosticValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
    }
  }
  return redactUnknown(value)
}

function extractFacts(input: ClassifyErrorInput): MessageFacts {
  const rawPieces = [
    summarizeUnknown(input.raw_error),
    summarizeUnknown(input.raw_result),
    summarizeUnknown(input.tool_arguments_summary),
  ].filter((item) => item.length > 0)
  const message = rawPieces.join(" | ")
  return {
    message,
    lowered: message.toLowerCase(),
    status: input.http_status ?? statusFromMessage(message),
    exceptionName: input.exception_name ?? exceptionNameFrom(input.raw_error),
  }
}

function matchAdapterRule(
  input: ClassifyErrorInput,
  facts: MessageFacts,
  adapterRules: readonly AdapterRule[],
): ClassificationSpec | null {
  for (const rule of adapterRules) {
    if (rule.server !== input.server_name) {
      continue
    }
    if (rule.match.status !== null && rule.match.status !== facts.status) {
      continue
    }
    if (rule.match.messageRegex !== null && !rule.match.messageRegex.test(facts.message)) {
      continue
    }
    return {
      code: rule.classify.code,
      layer: rule.classify.layer,
      category: rule.classify.category,
      permanence: rule.classify.permanence,
      retry: rule.classify.retry,
      stateImpact: rule.classify.state_impact,
      userActionRequired: rule.classify.user_action_required,
      confidence: rule.classify.confidence,
      nextSteps: rule.classify.agent_next_steps,
      doNot: rule.classify.do_not,
    }
  }
  return null
}

function buildEvidence(input: ClassifyErrorInput, facts: MessageFacts): ErrorEvidence {
  return {
    status: facts.status,
    matched_text: facts.message.slice(0, 500),
    upstream_server: input.server_name,
    tool: input.tool_name,
    duration_ms: input.duration_ms,
    exception_name: facts.exceptionName,
  }
}

function statusFromMessage(message: string): number | null {
  const match = /\b([1-5][0-9]{2})\b/u.exec(message)
  const raw = match?.[1]
  if (raw === undefined) {
    return null
  }
  const status = Number(raw)
  return status >= 300 && status <= 599 ? status : null
}

function exceptionNameFrom(value: unknown): string | null {
  if (value instanceof Error) {
    return value.name
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    const candidate = value.name
    return typeof candidate === "string" ? candidate : null
  }
  return null
}

export function summarizeUnknown(value: unknown): string {
  if (value === undefined || value === null) {
    return ""
  }
  if (value instanceof Error) {
    return value.message
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "object" && "message" in value) {
    const maybeMessage = value.message
    if (typeof maybeMessage === "string") {
      return maybeMessage
    }
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized ?? Object.prototype.toString.call(value)
  } catch (error) {
    if (error instanceof TypeError) {
      return Object.prototype.toString.call(value)
    }
    throw error
  }
}
