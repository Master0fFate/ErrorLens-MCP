import type { RawServeOptions } from "./serve-options.js"

export type ServeArgv = {
  readonly serve: RawServeOptions
  readonly config: string | undefined
  readonly help: boolean
  readonly version: boolean
}

const VALUE_FLAGS = new Set(["--transport", "--host", "--port", "--path", "--config"])
const LIST_FLAGS = new Set(["--allowed-host", "--allowed-origin"])

/**
 * Minimal flag parser for the `errorlens-companion` and `errorlens-proxy`
 * bins. They must not import the full CLI (that module imports them back),
 * so they parse the same flags the `companion` and `proxy` subcommands take.
 */
export function parseServeArgv(argv: readonly string[]): ServeArgv {
  const values = new Map<string, string>()
  const lists = new Map<string, string[]>()
  let help = false
  let version = false

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) {
      continue
    }
    if (token === "--help" || token === "-h") {
      help = true
      continue
    }
    if (token === "--version" || token === "-v") {
      version = true
      continue
    }
    const [flag, inlineValue] = splitFlag(token)
    if (VALUE_FLAGS.has(flag)) {
      const value = inlineValue ?? argv[index + 1]
      if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
        throw new Error(`${flag} requires a value.`)
      }
      values.set(flag, value)
      if (inlineValue === undefined) {
        index += 1
      }
      continue
    }
    if (LIST_FLAGS.has(flag)) {
      const collected = lists.get(flag) ?? []
      if (inlineValue !== undefined) {
        collected.push(inlineValue)
      } else {
        let cursor = index + 1
        while (cursor < argv.length && !(argv[cursor] ?? "--").startsWith("--")) {
          collected.push(argv[cursor] ?? "")
          cursor += 1
        }
        if (collected.length === 0) {
          throw new Error(`${flag} requires at least one value.`)
        }
        index = cursor - 1
      }
      lists.set(flag, collected)
      continue
    }
    throw new Error(`Unknown option "${token}".`)
  }

  return {
    serve: {
      transport: values.get("--transport"),
      host: values.get("--host"),
      port: values.get("--port"),
      path: values.get("--path"),
      allowedHost: lists.get("--allowed-host"),
      allowedOrigin: lists.get("--allowed-origin"),
    },
    config: values.get("--config"),
    help,
    version,
  }
}

function splitFlag(token: string): readonly [string, string | undefined] {
  const separator = token.indexOf("=")
  if (!token.startsWith("--") || separator === -1) {
    return [token, undefined]
  }
  return [token.slice(0, separator), token.slice(separator + 1)]
}

export function serveUsage(bin: string, extra = ""): string {
  return [
    `Usage: ${bin} [${extra}--transport stdio|http] [--host <host>] [--port <port>] [--path <path>]`,
    "                  [--allowed-host <host>...] [--allowed-origin <origin>...]",
    "",
    "Defaults: stdio transport; http binds 127.0.0.1:3939 at /mcp.",
    `Run \`errorlens --help\` for the full command line interface.`,
  ].join("\n")
}
