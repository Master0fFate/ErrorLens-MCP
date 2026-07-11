import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, isAbsolute, relative, resolve } from "node:path"
import test from "node:test"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  sessionTracePath,
} from "../src/session/session-context.js"

test("sessions use independent OS-temp trace roots and clean up safely", async () => {
  const sessions = await Promise.all([createErrorLensSession(), createErrorLensSession()])
  try {
    assert.notEqual(sessions[0].id, sessions[1].id)
    assert.notEqual(sessions[0].directory, sessions[1].directory)

    for (const session of sessions) {
      const relativeToTemp = relative(resolve(tmpdir()), session.tracePath)
      const relativeToWorkspace = relative(resolve(process.cwd()), session.tracePath)
      assert.equal(isAbsolute(session.tracePath), true)
      assert.equal(relativeToTemp.startsWith(".."), false)
      assert.equal(isAbsolute(relativeToWorkspace) || relativeToWorkspace.startsWith(".."), true)
      assert.equal(basename(sessionTracePath(session, ".errorlens/traces.jsonl")), "traces.jsonl")
    }
  } finally {
    await Promise.all(sessions.map((session) => disposeErrorLensSession(session)))
  }

  await assert.rejects(access(sessions[0].directory))
  await assert.rejects(access(sessions[1].directory))
})
