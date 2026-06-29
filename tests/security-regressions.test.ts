import assert from "node:assert/strict"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { commandAvailable } from "../src/cli/command-availability.js"
import { stdioParameters } from "../src/proxy/upstream-client.js"

test("stdioParameters passes only explicit upstream env overrides", () => {
  const secretName = "ERRORLENS_PARENT_SECRET_SHOULD_NOT_LEAK"
  const previous = process.env[secretName]
  process.env[secretName] = "parent-secret"
  try {
    const parameters = stdioParameters({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { UPSTREAM_TOKEN: "allowed" },
      adapter_rules: [],
    })

    assert.deepEqual(parameters.env, { UPSTREAM_TOKEN: "allowed" })
    assert.equal(secretName in (parameters.env ?? {}), false)
  } finally {
    if (previous === undefined) {
      delete process.env[secretName]
    } else {
      process.env[secretName] = previous
    }
  }
})

test("commandAvailable resolves commands by path lookup without shell metacharacters", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "errorlens-command-"))
  try {
    const executableName = process.platform === "win32" ? "safe-tool.cmd" : "safe-tool"
    const executablePath = join(tempDir, executableName)
    await writeFile(executablePath, "", "utf8")
    await chmod(executablePath, 0o755)

    const environment =
      process.platform === "win32" ? { PATH: tempDir, PATHEXT: ".CMD;.EXE" } : { PATH: tempDir }

    assert.equal(await commandAvailable("safe-tool", environment), true)
    assert.equal(await commandAvailable("safe-tool && echo leaked", environment), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
