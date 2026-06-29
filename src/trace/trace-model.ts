import { z } from "zod"
import { StructuredErrorSchema } from "../core/structured-error-model.js"

export const TraceOutcomeSchema = z.enum(["success", "error"])
export type TraceOutcome = z.infer<typeof TraceOutcomeSchema>

export const TraceRecordSchema = z.object({
  trace_id: z.string(),
  timestamp: z.string(),
  server_name: z.string(),
  tool_name: z.string(),
  duration_ms: z.number().int().nonnegative(),
  outcome: TraceOutcomeSchema,
  arguments: z.unknown(),
  raw_error_summary: z.string(),
  structured_error: StructuredErrorSchema.nullable(),
})

export type TraceRecord = z.infer<typeof TraceRecordSchema>
