import assert from "node:assert/strict"
import test from "node:test"
import { wrapFailure } from "../src/proxy/result-wrapper.js"
import { firstText } from "../src/shared/tool-result.js"

test("wrapFailure redacts raw upstream errors from tool result and trace", () => {
  const fakeToken = ["Bearer", "abcd1234efgh5678ijkl9012"].join(" ")
  const basicCredential = "dXNlcjpwYXNzMTIz"
  const apiCredential = "abcdef1234567890"
  const wrapped = wrapFailure({
    serverName: "demo",
    toolName: "publish",
    argumentsValue: { topic: "release" },
    rawError: `upstream rejected authorization ${fakeToken}; Authorization: Basic ${basicCredential}, ApiKey ${apiCredential}; password: "hunter2"`,
    rawResult: null,
    durationMs: 25,
    sideEffectType: "write",
    timedOut: false,
    redactSecrets: true,
  })

  const resultText = firstText(wrapped.result)
  const traceText = JSON.stringify(wrapped.trace)
  assert.equal(resultText.includes(fakeToken), false)
  assert.equal(traceText.includes(fakeToken), false)
  assert.equal(resultText.includes(basicCredential), false)
  assert.equal(traceText.includes(basicCredential), false)
  assert.equal(resultText.includes(apiCredential), false)
  assert.equal(traceText.includes(apiCredential), false)
  assert.equal(resultText.includes("hunter2"), false)
  assert.equal(traceText.includes("hunter2"), false)
  assert.match(resultText, /\[REDACTED\]/u)
  assert.match(traceText, /\[REDACTED\]/u)
})

test("wrapFailure redacts raw upstream tool results from structured evidence", () => {
  const fakeSecret = ["sk", "secret", "123456789012345678901234"].join("-")
  const wrapped = wrapFailure({
    serverName: "demo",
    toolName: "publish",
    argumentsValue: { topic: "release" },
    rawError: null,
    rawResult: {
      content: [{ type: "text", text: `provider token=${fakeSecret}` }],
      isError: true,
    },
    durationMs: 25,
    sideEffectType: "write",
    timedOut: false,
    redactSecrets: true,
  })

  const resultText = firstText(wrapped.result)
  const traceText = JSON.stringify(wrapped.trace)
  assert.equal(resultText.includes(fakeSecret), false)
  assert.equal(traceText.includes(fakeSecret), false)
  assert.match(resultText, /\[REDACTED\]/u)
  assert.match(traceText, /\[REDACTED\]/u)
})
