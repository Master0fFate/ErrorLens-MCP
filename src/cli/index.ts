#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Command } from "commander"
import { loadConfig, writeDefaultConfig } from "../config/load-config.js"
import { parseAdapterRules } from "../core/adapters.js"
import { startProxyServer } from "../proxy/proxy-server.js"
import { JsonlTraceStore } from "../trace/jsonl-store.js"
import { formatTraceReplay } from "../trace/replay.js"
import { summarizeFailures } from "../trace/report.js"
import { commandAvailable } from "./command-availability.js"

const program = new Command()

program.name("errorlens").description("Structured error recovery for MCP agents.").version("0.1.0")

program
  .command("init")
  .description("Create a local ErrorLens config, rules directory, and trace file.")
  .option("--dir <dir>", "target directory", ".errorlens")
  .action(async (options: { readonly dir: string }) => {
    const targetDir = resolve(options.dir)
    const configPath = await writeDefaultConfig(targetDir)
    console.log(`created ${configPath}`)
  })

program
  .command("doctor")
  .description("Check config validity and local trace path writability.")
  .requiredOption("--config <path>", "config path")
  .action(async (options: { readonly config: string }) => {
    const configPath = resolve(options.config)
    const config = await loadConfig(configPath)
    const tracePath = resolve(config.trace.path)
    await mkdir(dirname(tracePath), { recursive: true })
    await writeFile(tracePath, "", { flag: "a", encoding: "utf8" })
    const commandChecks = await Promise.all(
      Object.entries(config.servers).map(async ([serverName, serverConfig]) => {
        if (serverConfig.transport !== "stdio") {
          return {
            server: serverName,
            transport: serverConfig.transport,
            command_available: false,
            note: "streamable_http is configured but not supported by MVP proxy mode",
          }
        }
        return {
          server: serverName,
          transport: serverConfig.transport,
          command_available: await commandAvailable(serverConfig.command, {
            ...process.env,
            ...serverConfig.env,
          }),
          note: "",
        }
      }),
    )
    console.log(
      JSON.stringify(
        {
          ok: commandChecks.every((check) => check.note.length === 0 && check.command_available),
          config: configPath,
          trace_path: tracePath,
          servers: commandChecks,
          telemetry: "disabled",
        },
        null,
        2,
      ),
    )
  })

program
  .command("traces")
  .description("List local trace IDs.")
  .option("--trace <path>", "trace JSONL path", ".errorlens/traces.jsonl")
  .action(async (options: { readonly trace: string }) => {
    const store = new JsonlTraceStore(resolve(options.trace), true)
    const records = await store.readAll()
    for (const record of records) {
      console.log(
        `${record.trace_id}\t${record.outcome}\t${record.server_name}/${record.tool_name}`,
      )
    }
  })

program
  .command("replay")
  .description("Replay a local trace.")
  .argument("<trace-id>", "trace ID")
  .option("--trace <path>", "trace JSONL path", ".errorlens/traces.jsonl")
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
  .option("--trace <path>", "trace JSONL path", ".errorlens/traces.jsonl")
  .action(async (options: { readonly trace: string }) => {
    const store = new JsonlTraceStore(resolve(options.trace), true)
    const records = await store.readAll()
    console.log(JSON.stringify(summarizeFailures(records), null, 2))
  })

program
  .command("proxy")
  .description("Start ErrorLens stdio proxy mode.")
  .requiredOption("--config <path>", "config path")
  .action(async (options: { readonly config: string }) => {
    await startProxyServer(resolve(options.config))
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

try {
  await program.parseAsync(process.argv)
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    process.exitCode = 1
  } else {
    throw error
  }
}
