import { type ChildProcess, spawn } from "node:child_process"

export type HttpChild = {
  readonly url: string
  readonly stop: () => Promise<void>
}

const LISTENING_PATTERN = /listening on (http:\/\/\S+)/u

/**
 * Spawns one of the ErrorLens bins with `--transport http --port 0` and
 * resolves once it announces the bound URL on stderr.
 */
export async function spawnHttpChild(
  args: readonly string[],
  timeoutMs = 20_000,
): Promise<HttpChild> {
  const child = spawn(process.execPath, [...args, "--transport", "http", "--port", "0"], {
    stdio: ["ignore", "ignore", "pipe"],
  })
  const url = await waitForUrl(child, timeoutMs)
  return {
    url,
    stop: () => stopChild(child),
  }
}

async function waitForUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffered = ""
    const timer = setTimeout(() => {
      void stopChild(child)
      reject(new Error(`child did not announce an HTTP URL within ${timeoutMs} ms\n${buffered}`))
    }, timeoutMs)
    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk: string) => {
      buffered += chunk
      const match = LISTENING_PATTERN.exec(buffered)
      if (match?.[1] !== undefined) {
        clearTimeout(timer)
        child.stderr?.on("data", (line: string) => process.stderr.write(line))
        resolve(match[1])
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`child exited with code ${code} before listening\n${buffered}`))
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
    }, 5_000)
    child.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill("SIGTERM")
  })
}

export function parseTransportFlag(argv: readonly string[]): {
  readonly positional: readonly string[]
  readonly transport: "stdio" | "http"
} {
  const positional: string[] = []
  let transport: "stdio" | "http" = "stdio"
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--transport") {
      const next = argv[index + 1]
      if (next !== "stdio" && next !== "http") {
        throw new Error(`--transport expects stdio or http, got "${next ?? ""}"`)
      }
      transport = next
      index += 1
    } else if (value !== undefined) {
      positional.push(value)
    }
  }
  return { positional, transport }
}
