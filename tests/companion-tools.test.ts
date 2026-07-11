import assert from "node:assert/strict"
import test from "node:test"
import { generateAdapterRuleTool } from "../src/companion/mcp-tools.js"
import { firstText, jsonToolResult } from "../src/shared/tool-result.js"

test("generateAdapterRuleTool redacts secrets before building message regex", () => {
  const bearerToken = ["Bearer", "abcd1234efgh5678ijkl9012"].join(" ")
  const basicCredential = "dXNlcjpwYXNzMTIz"
  const apiCredential = "abcdef1234567890"
  const providerToken = ["sk", "secret", "123456789012345678901234"].join("-")
  const result = generateAdapterRuleTool({
    server_name: "demo",
    sample_message: `HTTP 500 failed with ${bearerToken} and provider ${providerToken} Authorization: Basic ${basicCredential}, ApiKey ${apiCredential} password: "hunter2"`,
    http_status: 500,
  })

  const resultText = firstText(result)
  assert.equal(resultText.includes(bearerToken), false)
  assert.equal(resultText.includes(basicCredential), false)
  assert.equal(resultText.includes(apiCredential), false)
  assert.equal(resultText.includes("hunter2"), false)
  assert.equal(resultText.includes(providerToken), false)
  assert.match(resultText, /\[REDACTED\]/u)
})

test("jsonToolResult exposes object diagnostics through structuredContent", () => {
  const result = jsonToolResult({ ok: false, code: "RATE_LIMITED" }, true)

  assert.deepEqual(result.structuredContent, { ok: false, code: "RATE_LIMITED" })
  assert.equal(result.isError, true)
})
