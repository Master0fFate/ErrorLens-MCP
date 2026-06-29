import assert from "node:assert/strict"
import test from "node:test"
import { classifyError } from "../src/core/classifier.js"
import { summarizeFailures } from "../src/trace/report.js"

test("summarizeFailures counts categories, servers, tools, and retry safety", () => {
  const structured = classifyError({
    server_name: "demo",
    tool_name: "search_docs",
    raw_error: "HTTP 429 too many requests",
    duration_ms: 20,
    tool_side_effect_type: "read",
    timed_out: false,
    http_status: 429,
  })
  const report = summarizeFailures([
    {
      trace_id: structured.trace_id,
      timestamp: "2026-06-29T00:00:00.000Z",
      server_name: "demo",
      tool_name: "search_docs",
      duration_ms: 20,
      outcome: "error",
      arguments: {},
      raw_error_summary: "HTTP 429 too many requests",
      structured_error: structured,
    },
  ])

  assert.equal(report.total, 1)
  assert.equal(report.failures, 1)
  const category = "rate_limit"
  assert.equal(report.by_category[category], 1)
  assert.equal(report.retry_safe, 1)
})
