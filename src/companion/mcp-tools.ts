import { z } from "zod"
import { parseAdapterRules } from "../core/adapters.js"
import { classifyError } from "../core/classifier.js"
import { recommendRecovery } from "../core/recovery.js"
import { redactText } from "../core/redaction.js"
import {
  ClassifyErrorInputSchema,
  RecommendRecoveryInputSchema,
  StructuredErrorSchema,
} from "../core/structured-error-model.js"
import { jsonToolResult } from "../shared/tool-result.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { formatTraceReplay } from "../trace/replay.js"
import { summarizeFailures } from "../trace/report.js"

export const ReplayTraceInputSchema = z.object({
  trace_id: z.string().min(1),
  trace_path: z.string().min(1).optional(),
})

export const SummarizeFailuresInputSchema = z.object({
  trace_path: z.string().min(1).optional(),
  server_name: z.string().optional(),
  tool_name: z.string().optional(),
})

export const GenerateAdapterRuleInputSchema = z.object({
  server_name: z.string().min(1),
  sample_message: z.string().min(1),
  http_status: z.number().int().nullable().default(null),
})

export const RulesTestInputSchema = z.object({
  yaml: z.string().min(1),
})

export function classifyErrorTool(input: unknown) {
  const parsed = ClassifyErrorInputSchema.parse(input)
  const structured = classifyError(parsed)
  return jsonToolResult({
    structured_error: structured,
    confidence: structured.error.confidence,
    recovery: recommendRecovery(structured),
  })
}

export function recommendRecoveryTool(input: unknown) {
  const parsed = RecommendRecoveryInputSchema.parse(input)
  return jsonToolResult(recommendRecovery(parsed.structured_error, parsed))
}

export async function replayTraceTool(input: unknown, defaultTracePath?: string) {
  const parsed = ReplayTraceInputSchema.parse(input)
  const store = new JsonlTraceStore(requireTracePath(parsed.trace_path ?? defaultTracePath), true)
  const record = await store.find(parsed.trace_id)
  return jsonToolResult({
    found: record !== null,
    replay: record === null ? null : formatTraceReplay(record),
  })
}

export async function summarizeFailuresTool(input: unknown, defaultTracePath?: string) {
  const parsed = SummarizeFailuresInputSchema.parse(input)
  const store = new JsonlTraceStore(requireTracePath(parsed.trace_path ?? defaultTracePath), true)
  const records = (await store.readAll()).filter((record) => {
    const serverMatches =
      parsed.server_name === undefined || record.server_name === parsed.server_name
    const toolMatches = parsed.tool_name === undefined || record.tool_name === parsed.tool_name
    return serverMatches && toolMatches
  })
  return jsonToolResult(summarizeFailures(records))
}

export function generateAdapterRuleTool(input: unknown) {
  const parsed = GenerateAdapterRuleInputSchema.parse(input)
  const safeSampleMessage = redactText(parsed.sample_message)
  const structured = classifyError({
    server_name: parsed.server_name,
    tool_name: "unknown",
    raw_error: safeSampleMessage,
    raw_result: undefined,
    duration_ms: 0,
    tool_arguments_summary: undefined,
    tool_side_effect_type: "unknown",
    timed_out: false,
    http_status: parsed.http_status ?? undefined,
    exception_name: undefined,
  })
  return jsonToolResult({
    server: parsed.server_name,
    rules: [
      {
        name: `${parsed.server_name}-${structured.error.code.toLowerCase()}`,
        match: {
          status: parsed.http_status,
          message_regex: escapeRegexSample(safeSampleMessage),
        },
        classify: structured.error,
      },
    ],
  })
}

export function rulesTestTool(input: unknown) {
  const parsed = RulesTestInputSchema.parse(input)
  const rules = parseAdapterRules(parsed.yaml)
  return jsonToolResult({ ok: true, count: rules.length })
}

export function parseStructuredError(value: unknown) {
  return StructuredErrorSchema.parse(value)
}

function escapeRegexSample(value: string): string {
  return value
    .split(/\s+/u)
    .filter((part) => part.length > 3)
    .slice(0, 5)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*")
}

function requireTracePath(tracePath: string | undefined): string {
  if (tracePath === undefined) {
    throw new Error("No session trace path is available; pass trace_path explicitly.")
  }
  return tracePath
}
