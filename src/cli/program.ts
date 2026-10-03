import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/server"
import { Command, InvalidArgumentError } from "commander"
import { startDiagnosticServer } from "../companion/diagnostic-server.js"
import { loadConfig, writeDefaultConfig } from "../config/load-config.js"
import { parseAdapterRules } from "../core/adapters.js"
import { startProxyServer } from "../proxy/proxy-server.js"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  sessionTracePath,
} from "../session/session-context.js"
import { packageInfo } from "../shared/package-info.js"
import type { RawServeOptions } from "../shared/serve-options.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { formatTraceReplay } from "../trace/replay.js"
import { summarizeFailures } from "../trace/report.js"
import {
  CLIENT_IDS,
  CLIENT_LABELS,
  type ClientConfigLauncher,
  type ClientConfigMode,
  type ClientConfigTransport,
  type ClientId,
  isClientId,
  renderClientConfig,
} from "./client-config.js"
import { commandAvailable } from "./command-availability.js"
import { addServeFlags, serveOptionsFromFlags } from "./serve-flags.js"

const DEFAULT_CONFIG_PATH = ".errorlens/config.yaml"
const DEFAULT_TRACE_PATH = ".errorlens/traces.jsonl"

export function buildProgram(): Command {
  const info = packageInfo()
  const program = new Command()

  program
    .name("errorlens")
    .description(info.description)
    .version(info.version, "-v, --version", "print the ErrorLens version")
    .showHelpAfterError()

  program
    .command("init")
    .description("Create a local ErrorLens config and rules directory.")
    .option("--dir <dir>", "target directory", ".errorlens")
    .action(async (options: { readonly dir: string }) => {
      const targetDir = resolve(options.dir)
      const configPath = await writeDefaultConfig(targetDir)
      console.log(`created ${configPath}`)
    })

  program
    .command("doctor")
    .description("Check config validity, upstream commands, and protocol support.")
    .requiredOption("--config <path>", "config path")
    .action(async (options: { readonly config: string }) => {
      console.log(JSON.stringify(await runDoctor(resolve(options.config)), null, 2))
    })

  addServeFlags(
    program
      .command("companion")
      .description("Start the ErrorLens diagnostic MCP server (stdio by default)."),
  ).action(async (flags: RawServeOptions) => {
    await startDiagnosticServer(serveOptionsFromFlags(flags))
  })

  addServeFlags(
    program
      .command("proxy")
      .description("Start the ErrorLens MCP proxy in front of configured upstream servers.")
      .option("--config <path>", "config path", DEFAULT_CONFIG_PATH),
  ).action(async (flags: RawServeOptions & { readonly config: string }) => {
    await startProxyServer(resolve(flags.config), serveOptionsFromFlags(flags))
  })

  program
    .command("traces")
    .description("List local trace IDs.")
    .option("--trace <path>", "trace JSONL path", DEFAULT_TRACE_PATH)
    .action(async (options: { readonly trace: string }) => {
      const store = new JsonlTraceStore(resolve(options.trace), true)
      for (const record of await store.readAll()) {
        console.log(
          `${record.trace_id}\t${record.outcome}\t${record.server_name}/${record.tool_name}`,
        )
      }
    })

  program
    .command("replay")
    .description("Replay a local trace.")
    .argument("<trace-id>", "trace ID")
    .option("--trace <path>", "trace JSONL path", DEFAULT_TRACE_PATH)
    .action(async (traceId: string, options: { readonly trace: string }) => {
      const store = new JsonlTraceStore(resolve(options.trace), true)
      const record = await store.find(traceId)
      if (record === null) {
        console.error(`trace not found: ${traceId}`)
        process.exitCode = 1
        return
      }
      console.log(formatTraceReplay(record))
    })

  program
    .command("report")
    .description("Summarize local failures.")
    .option("--trace <path>", "trace JSONL path", DEFAULT_TRACE_PATH)
    .action(async (options: { readonly trace: string }) => {
      const store = new JsonlTraceStore(resolve(options.trace), true)
      console.log(JSON.stringify(summarizeFailures(await store.readAll()), null, 2))
    })

  const rules = program.command("rules").description("Adapter rule utilities.")
  rules
    .command("test")
    .description("Parse adapter-rule YAML.")
    .requiredOption("--file <path>", "adapter rule YAML file")
    .action(async (options: { readonly file: string }) => {
      const content = await readFile(resolve(options.file), "utf8")
      const parsed = parseAdapterRules(content)
      console.log(JSON.stringify({ ok: true, count: parsed.length }, null, 2))
    })

  program
    .command("client-config")
    .description(`Print an MCP client configuration snippet. Clients: ${CLIENT_IDS.join(", ")}.`)
    .argument("<client>", "client id", parseClientId)
    .option("--mode <mode>", "companion or proxy", parseChoice(["companion", "proxy"]), "companion")
    .option("--transport <transport>", "stdio or http", parseChoice(["stdio", "http"]), "stdio")
    .option("--launcher <launcher>", "npx or global", parseChoice(["npx", "global"]), "npx")
    .option("--config <path>", "ErrorLens config path for proxy mode")
    .option("--url <url>", "MCP endpoint URL for the http transport")
    .option("--name <name>", "server entry name inside the client configuration")
    .action(
      (
        client: ClientId,
        options: {
          readonly mode: ClientConfigMode
          readonly transport: ClientConfigTransport
          readonly launcher: ClientConfigLauncher
          readonly config?: string
          readonly url?: string
          readonly name?: string
        },
      ) => {
        const snippet = renderClientConfig({
          client,
          mode: options.mode,
          transport: options.transport,
          launcher: options.launcher,
          configPath: options.config === undefined ? undefined : resolve(options.config),
          url: options.url,
          serverName: options.name,
        })
        console.error(`# ${CLIENT_LABELS[client]} - ${snippet.file}`)
        for (const note of snippet.notes) {
          console.error(`# ${note}`)
        }
        console.log(snippet.content)
      },
    )

  return program
}

export async function runCli(argv: readonly string[]): Promise<void> {
  try {
    await buildProgram().parseAsync([...argv], { from: "user" })
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      process.exitCode = 1
      return
    }
    throw error
  }
}

type DoctorReport = {
  readonly ok: boolean
  readonly errorlens_version: string
  readonly config: string
  readonly trace_path: string
  readonly trace_scope: "session_temp"
  readonly mcp: {
    readonly latest_protocol_version: string
    readonly supported_protocol_versions: readonly string[]
  }
  readonly servers: readonly DoctorServerCheck[]
  readonly telemetry: "disabled"
}

type DoctorServerCheck = {
  readonly server: string
  readonly transport: string
  readonly negotiation: string
  readonly command_available: boolean | null
  readonly endpoint_configured: boolean
}

export async function runDoctor(configPath: string): Promise<DoctorReport> {
  const config = await loadConfig(configPath)
  const session = await createErrorLensSession()
  try {
    const servers = await Promise.all(
      Object.entries(config.servers).map(
        async ([serverName, serverConfig]): Promise<DoctorServerCheck> => ({
          server: serverName,
          transport: serverConfig.transport,
          negotiation: serverConfig.negotiation,
          command_available:
            serverConfig.transport === "stdio"
              ? await commandAvailable(serverConfig.command, {
                  ...process.env,
                  ...serverConfig.env,
                })
              : null,
          endpoint_configured: true,
        }),
      ),
    )
    return {
      ok: servers.every((check) =>
        check.transport === "streamable_http"
          ? check.endpoint_configured
          : check.command_available === true,
      ),
      errorlens_version: packageInfo().version,
      config: configPath,
      trace_path: sessionTracePath(session, config.trace.path),
      trace_scope: "session_temp",
      mcp: {
        latest_protocol_version: LATEST_PROTOCOL_VERSION,
        supported_protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
      },
      servers,
      telemetry: "disabled",
    }
  } finally {
    await disposeErrorLensSession(session)
  }
}

function parseClientId(value: string): ClientId {
  if (!isClientId(value)) {
    throw new InvalidArgumentError(
      `Unknown client "${value}". Choose one of: ${CLIENT_IDS.join(", ")}.`,
    )
  }
  return value
}

function parseChoice<const T extends readonly string[]>(choices: T): (value: string) => T[number] {
  return (value: string) => {
    if (!choices.includes(value)) {
      throw new InvalidArgumentError(`Expected one of: ${choices.join(", ")}.`)
    }
    return value
  }
}
