import type { ToolAnnotations } from "@modelcontextprotocol/server"
import { z } from "zod"
import { parseAdapterRules } from "../core/adapters.js"
import { classifyError } from "../core/classifier.js"
import { recommendRecovery } from "../core/recovery.js"
import { redactText } from "../core/redaction.js"
import {
  ClassifyErrorInputSchema,
  ErrorDetailsSchema,
  RecommendRecoveryInputSchema,
  StructuredErrorSchema,
} from "../core/structured-error-model.js"
import { SIDE_EFFECT_TYPES } from "../core/taxonomy.js"
import { jsonToolResult } from "../shared/tool-result.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { formatTraceReplay } from "../trace/replay.js"
import { summarizeFailures } from "../trace/report.js"

/** Every companion tool is a pure, local, read-only diagnostic. */
export const DIAGNOSTIC_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

// Input schemas advertised to clients. `.describe()` text is the only
// documentation the model gets for each argument.
export const ClassifyErrorToolInputSchema = z.object({
  server_name: z.string().optional().describe("Upstream MCP server name."),
  tool_name: z.string().optional().describe("Tool that failed."),
  raw_error: z.unknown().optional().describe("Thrown error, JSON-RPC error, or message text."),
  raw_result: z.unknown().optional().describe("Tool result returned with isError=true."),
  duration_ms: z.number().int().nonnegative().optional().describe("Call duration in ms."),
  tool_arguments_summary: z.unknown().optional().describe("Redacted summary of the arguments."),
  tool_side_effect_type: z
    .enum(SIDE_EFFECT_TYPES)
    .optional()
    .describe("read, write, destructive, or unknown."),
  timed_out: z.boolean().optional().describe("Whether the call timed out."),
  http_status: z.number().int().positive().optional().describe("HTTP status, if known."),
  exception_name: z.string().optional().describe("Exception class name, if known."),
})

export const RecommendRecoveryToolInputSchema = z.object({
  structured_error: z.unknown().describe("A structured_error produced by classify_error."),
  available_alternative_tools: z
    .array(z.string())
    .optional()
    .describe("Tool names the agent could use to verify state."),
})

export const ReplayTraceInputSchema = z.object({
  trace_id: z.string().min(1).describe("Trace ID from a structured error."),
  trace_path: z
    .string()
    .min(1)
    .optional()
    .describe("JSONL trace file; defaults to the session trace."),
})

export const SummarizeFailuresInputSchema = z.object({
  trace_path: z
    .string()
    .min(1)
    .optional()
    .describe("JSONL trace file; defaults to the session trace."),
  server_name: z.string().optional().describe("Only count failures from this server."),
  tool_name: z.string().optional().describe("Only count failures from this tool."),
})

export const GenerateAdapterRuleInputSchema = z.object({
  server_name: z.string().min(1).describe("Server the rule applies to."),
  sample_message: z.string().min(1).describe("A representative failure message."),
  http_status: z.number().int().nullable().default(null).describe("HTTP status to match, if any."),
})

export const RulesTestInputSchema = z.object({
  yaml: z.string().min(1).describe("Adapter rule YAML document."),
})

// Output schemas: clients that honour `outputSchema` can validate and render
// `structuredContent` without parsing the text block.
export const RecoveryRecommendationSchema = z.object({
  next_steps: z.array(z.string()),
  safe_to_retry: z.boolean(),
  requires_user_input: z.boolean(),
  stop_condition: z.string(),
  suggested_alternative_tools: z.array(z.string()),
})

export const ClassifyErrorOutputSchema = z.object({
  structured_error: StructuredErrorSchema,
  confidence: z.number().min(0).max(1),
  recovery: RecoveryRecommendationSchema,
})

export const ReplayTraceOutputSchema = z.object({
  found: z.boolean(),
  replay: z.string().nullable(),
})

export const FailureReportSchema = z.object({
  total: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  by_category: z.record(z.string(), z.number().int().nonnegative()),
  by_server: z.record(z.string(), z.number().int().nonnegative()),
  by_tool: z.record(z.string(), z.number().int().nonnegative()),
  retry_safe: z.number().int().nonnegative(),
  retry_unsafe: z.number().int().nonnegative(),
})

export const GenerateAdapterRuleOutputSchema = z.object({
  server: z.string(),
  rules: z.array(
    z.object({
      name: z.string(),
      match: z.object({
        status: z.number().int().nullable(),
        message_regex: z.string(),
      }),
      classify: ErrorDetailsSchema,
    }),
  ),
})

export const RulesTestOutputSchema = z.object({
  ok: z.literal(true),
  count: z.number().int().nonnegative(),
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
