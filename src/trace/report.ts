import type { TraceRecord } from "./trace-model.js"

export type FailureReport = {
  readonly total: number
  readonly failures: number
  readonly by_category: Record<string, number>
  readonly by_server: Record<string, number>
  readonly by_tool: Record<string, number>
  readonly retry_safe: number
  readonly retry_unsafe: number
}

export function summarizeFailures(records: readonly TraceRecord[]): FailureReport {
  let failures = 0
  let retrySafe = 0
  let retryUnsafe = 0
  const byCategory: Record<string, number> = {}
  const byServer: Record<string, number> = {}
  const byTool: Record<string, number> = {}

  for (const record of records) {
    if (record.outcome !== "error" || record.structured_error === null) {
      continue
    }
    increment(byCategory, record.structured_error.error.category)
    increment(byServer, record.server_name)
    increment(byTool, `${record.server_name}/${record.tool_name}`)
    if (record.structured_error.error.retry.safe) {
      retrySafe += 1
    } else {
      retryUnsafe += 1
    }
    failures += 1
  }

  return {
    total: records.length,
    failures,
    by_category: byCategory,
    by_server: byServer,
    by_tool: byTool,
    retry_safe: retrySafe,
    retry_unsafe: retryUnsafe,
  }
}

function increment(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1
}
