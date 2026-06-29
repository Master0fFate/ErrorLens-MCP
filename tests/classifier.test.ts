import assert from "node:assert/strict"
import test from "node:test"
import { classifyError } from "../src/core/classifier.js"

test("classifyError returns retryable rate-limit guidance when status is 429", () => {
  const result = classifyError({
    server_name: "demo",
    tool_name: "search_docs",
    raw_error: "too many requests",
    duration_ms: 10,
    tool_side_effect_type: "read",
    timed_out: false,
    http_status: 429,
  })

  assert.equal(result.error.code, "RATE_LIMITED")
  assert.equal(result.error.retry.safe, true)
  assert.equal(result.error.state_impact, "none")
})

test("classifyError blocks retry when a write-like tool times out", () => {
  const result = classifyError({
    server_name: "demo",
    tool_name: "create_ticket",
    raw_error: "timed out",
    duration_ms: 150,
    tool_side_effect_type: "write",
    timed_out: true,
  })

  assert.equal(result.error.code, "SIDE_EFFECT_UNKNOWN")
  assert.equal(result.error.retry.safe, false)
  assert.equal(result.error.state_impact, "possibly_applied")
})

test("classifyError blocks retry when a write-like upstream call returns 503", () => {
  const result = classifyError({
    server_name: "demo",
    tool_name: "publish",
    raw_error: "HTTP 503 service unavailable",
    duration_ms: 75,
    tool_side_effect_type: "write",
    timed_out: false,
    http_status: 503,
  })

  assert.equal(result.error.retry.safe, false)
  assert.equal(result.error.state_impact, "possibly_applied")
})

test("classifyError asks for corrected arguments on validation failures", () => {
  const result = classifyError({
    server_name: "demo",
    tool_name: "update_record",
    raw_error: "Invalid field type: status must be an enum value",
    duration_ms: 4,
    tool_side_effect_type: "write",
    timed_out: false,
    http_status: 422,
  })

  assert.equal(result.error.code, "SCHEMA_CONTRACT_VIOLATION")
  assert.equal(result.error.retry.safe, false)
  assert.match(result.error.agent_next_steps.join(" "), /Correct/)
})

test("classifyError redacts diagnostic evidence before returning structured output", () => {
  const bearerToken = ["Bearer", "abcd1234efgh5678ijkl9012"].join(" ")
  const basicCredential = "dXNlcjpwYXNzMTIz"
  const apiCredential = "abcdef1234567890"
  const providerToken = ["sk", "secret", "123456789012345678901234"].join("-")
  const result = classifyError({
    server_name: "demo",
    tool_name: "classify_error",
    raw_error: `HTTP 500 authorization failed: ${bearerToken} Authorization: Basic ${basicCredential}, ApiKey ${apiCredential} password: "hunter2"`,
    raw_result: {
      content: [{ type: "text", text: `provider token=${providerToken}` }],
      isError: true,
    },
    tool_arguments_summary: {
      api_key: bearerToken,
    },
    duration_ms: 8,
    tool_side_effect_type: "read",
    timed_out: false,
    http_status: 500,
  })

  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes(bearerToken), false)
  assert.equal(serialized.includes(basicCredential), false)
  assert.equal(serialized.includes(apiCredential), false)
  assert.equal(serialized.includes("hunter2"), false)
  assert.equal(serialized.includes(providerToken), false)
  assert.match(result.error.evidence.matched_text, /\[REDACTED\]/u)
})
