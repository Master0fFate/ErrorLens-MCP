import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_LAYERS,
  PERMANENCE_VALUES,
  RETRY_BACKOFFS,
  SIDE_EFFECT_TYPES,
  STATE_IMPACTS,
} from "./taxonomy.js"

export const RetryPolicySchema = z.object({
  safe: z.boolean(),
  after_ms: z.number().int().nonnegative().nullable(),
  max_attempts: z.number().int().nonnegative(),
  backoff: z.enum(RETRY_BACKOFFS),
  requires_idempotency_key: z.boolean(),
  same_arguments_required: z.boolean(),
})

export type RetryPolicy = z.infer<typeof RetryPolicySchema>

export const ErrorEvidenceSchema = z.object({
  status: z.number().int().nullable(),
  matched_text: z.string(),
  upstream_server: z.string(),
  tool: z.string(),
  duration_ms: z.number().int().nonnegative(),
  exception_name: z.string().nullable(),
})

export type ErrorEvidence = z.infer<typeof ErrorEvidenceSchema>

export const ErrorDetailsSchema = z.object({
  code: z.enum(ERROR_CODES),
  layer: z.enum(ERROR_LAYERS),
  category: z.enum(ERROR_CATEGORIES),
  permanence: z.enum(PERMANENCE_VALUES),
  retry: RetryPolicySchema,
  state_impact: z.enum(STATE_IMPACTS),
  user_action_required: z.boolean(),
  confidence: z.number().min(0).max(1),
  agent_next_steps: z.array(z.string()),
  do_not: z.array(z.string()),
  evidence: ErrorEvidenceSchema,
})

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>

export const StructuredErrorSchema = z.object({
  ok: z.literal(false),
  trace_id: z.string().min(5),
  error: ErrorDetailsSchema,
})

export type StructuredError = z.infer<typeof StructuredErrorSchema>

export const ClassifyErrorInputSchema = z.object({
  server_name: z.string().min(1).default("unknown"),
  tool_name: z.string().min(1).default("unknown"),
  raw_error: z.unknown().optional(),
  raw_result: z.unknown().optional(),
  duration_ms: z.number().int().nonnegative().default(0),
  tool_arguments_summary: z.unknown().optional(),
  tool_side_effect_type: z.enum(SIDE_EFFECT_TYPES).default("unknown"),
  timed_out: z.boolean().default(false),
  http_status: z.number().int().positive().optional(),
  exception_name: z.string().optional(),
})

export type ClassifyErrorInput = z.infer<typeof ClassifyErrorInputSchema>

export const RecommendRecoveryInputSchema = z.object({
  structured_error: StructuredErrorSchema,
  current_task_goal: z.string().optional(),
  available_alternative_tools: z.array(z.string()).default([]),
})

export type RecommendRecoveryInput = z.infer<typeof RecommendRecoveryInputSchema>

export type RecoveryRecommendation = {
  readonly next_steps: readonly string[]
  readonly safe_to_retry: boolean
  readonly requires_user_input: boolean
  readonly stop_condition: string
}

export function createTraceId(): string {
  return `err_${randomUUID()}`
}
