import assert from "node:assert/strict"
import test from "node:test"
import { ErrorLensConfigSchema } from "../src/config/config-model.js"

test("ErrorLensConfigSchema fills portable defaults", () => {
  const parsed = ErrorLensConfigSchema.parse({
    version: 1,
  })

  assert.equal(parsed.trace.enabled, true)
  assert.equal(parsed.trace.redact_secrets, true)
  assert.equal(parsed.trace.path, undefined)
  assert.equal(parsed.proxy.expose_tool_prefix, true)
  assert.deepEqual(parsed.servers, {})
})
