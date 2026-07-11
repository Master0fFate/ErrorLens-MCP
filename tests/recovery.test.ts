import assert from "node:assert/strict"
import test from "node:test"
import { classifyError } from "../src/core/classifier.js"
import { recommendRecovery } from "../src/core/recovery.js"

test("recommendRecovery surfaces safe read tools for ambiguous writes", () => {
  const structured = classifyError({
    server_name: "demo",
    tool_name: "create_ticket",
    raw_error: "request timed out",
    duration_ms: 150,
    timed_out: true,
    tool_side_effect_type: "write",
  })

  const recommendation = recommendRecovery(structured, {
    available_alternative_tools: ["demo__get_ticket", "demo__delete_ticket", "demo__list_tickets"],
  })

  assert.deepEqual(recommendation.suggested_alternative_tools, [
    "demo__get_ticket",
    "demo__list_tickets",
  ])
})
