import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { ErrorLensConfigSchema } from "../src/config/config-model.js"
import { loadConfiguredAdapterRules } from "../src/core/adapter-loader.js"
import { classifyError } from "../src/core/classifier.js"

test("loadConfiguredAdapterRules loads paths relative to the config file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "errorlens-rules-"))
  try {
    const configPath = join(tempDir, "config.yaml")
    const rulesPath = join(tempDir, "rules", "demo.yaml")
    await mkdir(dirname(rulesPath), { recursive: true })
    await writeFile(
      rulesPath,
      `server: demo
rules:
  - name: demo-rate-limit
    match:
      status: 498
      message_regex: "quota reached"
    classify:
      code: RATE_LIMITED
      layer: rate_limit
      category: rate_limit
      permanence: transient
      retry:
        safe: true
        after_ms: 45000
        max_attempts: 1
        backoff: fixed
        requires_idempotency_key: false
        same_arguments_required: true
      state_impact: none
      user_action_required: false
      confidence: 0.99
      agent_next_steps:
        - Wait 45 seconds before retrying.
      do_not:
        - Do not retry in a loop.
`,
      "utf8",
    )
    const config = ErrorLensConfigSchema.parse({
      version: 1,
      rules: { custom_paths: ["rules/demo.yaml"] },
    })

    const rules = await loadConfiguredAdapterRules(configPath, config)
    assert.equal(rules.length, 1)

    const result = classifyError(
      {
        server_name: "demo",
        tool_name: "search",
        raw_error: "quota reached",
        duration_ms: 10,
        timed_out: false,
        http_status: 498,
        tool_side_effect_type: "read",
      },
      rules,
    )
    assert.equal(result.error.code, "RATE_LIMITED")
    assert.equal(result.error.retry.after_ms, 45000)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
