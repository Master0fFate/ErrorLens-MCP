import type { TraceRecord } from "./trace-model.js"

export function formatTraceReplay(record: TraceRecord): string {
  const structured = record.structured_error
  if (structured === null) {
    return [
      `Trace: ${record.trace_id}`,
      `Server: ${record.server_name}`,
      `Tool: ${record.tool_name}`,
      "Outcome: success",
    ].join("\n")
  }

  return [
    `Trace: ${record.trace_id}`,
    `Server: ${record.server_name}`,
    `Tool: ${record.tool_name}`,
    `Classification: ${structured.error.code}`,
    `Reason: ${structured.error.evidence.matched_text}`,
    `Retry safe: ${structured.error.retry.safe ? "yes" : "no"}`,
    `State impact: ${structured.error.state_impact}`,
    `Recommended next step: ${structured.error.agent_next_steps[0] ?? "Summarize the failure."}`,
    `Do not: ${structured.error.do_not[0] ?? "Do not guess."}`,
  ].join("\n")
}
