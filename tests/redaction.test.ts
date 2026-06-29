import assert from "node:assert/strict"
import test from "node:test"
import { redactText, redactUnknown } from "../src/core/redaction.js"

test("redactText hides bearer and provider tokens", () => {
  const basicCredential = "dXNlcjpwYXNzMTIz"
  const apiCredential = "abcdef1234567890"
  const redacted = redactText(
    `Authorization: Basic ${basicCredential}, ApiKey ${apiCredential} token="ghp_abcdefghijklmnopqrstuvwxyz" password: "hunter2" {"password":"hunter2"}`,
  )

  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/u)
  assert.doesNotMatch(redacted, new RegExp(basicCredential, "u"))
  assert.doesNotMatch(redacted, new RegExp(apiCredential, "u"))
  assert.doesNotMatch(redacted, /hunter2/u)
  assert.match(redacted, /\[REDACTED\]/u)
})

test("redactUnknown redacts secret-like object keys recursively", () => {
  const redacted = redactUnknown({
    api_key: "sk-secret-123456789012345678901234",
    nested: {
      password: "correct-horse-battery-staple",
    },
  })

  assert.deepEqual(redacted, {
    api_key: "[REDACTED]",
    nested: {
      password: "[REDACTED]",
    },
  })
})
