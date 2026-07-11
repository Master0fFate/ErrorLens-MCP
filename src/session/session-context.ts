import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

export type ErrorLensSession = {
  readonly id: string
  readonly directory: string
  readonly tracePath: string
}

export async function createErrorLensSession(): Promise<ErrorLensSession> {
  const id = randomUUID()
  const directory = await mkdtemp(join(tmpdir(), `mcp-errorlens-${id}-`))
  return {
    id,
    directory,
    tracePath: join(directory, "traces.jsonl"),
  }
}

export async function disposeErrorLensSession(session: ErrorLensSession): Promise<void> {
  await rm(session.directory, { recursive: true, force: true })
}

export function registerSessionExitCleanup(session: ErrorLensSession): () => void {
  const cleanupOnExit = (): void => {
    rmSync(session.directory, { recursive: true, force: true })
  }
  const cleanupOnSignal = (exitCode: number): void => {
    cleanupOnExit()
    process.exit(exitCode)
  }
  const cleanupOnInterrupt = (): void => cleanupOnSignal(130)
  const cleanupOnTerminate = (): void => cleanupOnSignal(143)

  process.once("exit", cleanupOnExit)
  process.once("SIGINT", cleanupOnInterrupt)
  process.once("SIGTERM", cleanupOnTerminate)
  return () => {
    process.removeListener("exit", cleanupOnExit)
    process.removeListener("SIGINT", cleanupOnInterrupt)
    process.removeListener("SIGTERM", cleanupOnTerminate)
  }
}

export function sessionTracePath(
  session: ErrorLensSession,
  configuredPath: string | undefined,
): string {
  const configuredName = configuredPath === undefined ? "traces.jsonl" : basename(configuredPath)
  const filename =
    configuredName === "." || configuredName === ".." ? "traces.jsonl" : configuredName
  return join(session.directory, filename)
}
