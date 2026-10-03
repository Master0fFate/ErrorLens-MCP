#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  registerSessionExitCleanup,
} from "../session/session-context.js"
import { parseServeArgv, serveUsage } from "../shared/argv.js"
import { serveHttp } from "../shared/http-server.js"
import { implementationInfo, packageInfo } from "../shared/package-info.js"
import {
  DEFAULT_SERVE_OPTIONS,
  resolveServeOptions,
  type ServeOptions,
} from "../shared/serve-options.js"
import {
  ClassifyErrorOutputSchema,
  ClassifyErrorToolInputSchema,
  classifyErrorTool,
  DIAGNOSTIC_TOOL_ANNOTATIONS,
  FailureReportSchema,
  GenerateAdapterRuleInputSchema,
  GenerateAdapterRuleOutputSchema,
  generateAdapterRuleTool,
  RecommendRecoveryToolInputSchema,
  RecoveryRecommendationSchema,
  ReplayTraceInputSchema,
  ReplayTraceOutputSchema,
  RulesTestInputSchema,
  RulesTestOutputSchema,
  recommendRecoveryTool,
  replayTraceTool,
  rulesTestTool,
  SummarizeFailuresInputSchema,
  summarizeFailuresTool,
} from "./mcp-tools.js"

export const COMPANION_SERVER_NAME = "mcp-errorlens"

export const COMPANION_INSTRUCTIONS = [
  "ErrorLens turns vague MCP tool failures into structured, retry-aware recovery guidance.",
  "When a tool call fails, call classify_error with the raw error or result and the tool name.",
  "Read retry.safe and state_impact before retrying anything that may have written data;",
  "SIDE_EFFECT_UNKNOWN means verify state with a read-only tool first.",
  "Use recommend_recovery for short next steps, summarize_failures for a session overview,",
  "and generate_adapter_rule to draft a YAML rule for a recurring server-specific message.",
].join(" ")

export type DiagnosticServerOptions = {
  readonly tracePath?: string
}

export function buildDiagnosticServer(options: DiagnosticServerOptions = {}): McpServer {
  const server = new McpServer(
    implementationInfo(
      COMPANION_SERVER_NAME,
      "Structured error classification and recovery guidance for MCP agents.",
    ),
    { instructions: COMPANION_INSTRUCTIONS },
  )

  registerClassificationTools(server)
  registerTraceTools(server, options.tracePath)
  registerAdapterTools(server)
  return server
}

function registerClassificationTools(server: McpServer): void {
  server.registerTool(
    "classify_error",
    {
      title: "Classify a tool failure",
      description:
        "Classify raw MCP/tool failure data into ErrorLens structured recovery JSON: a stable error code, whether retrying is safe, whether state may have changed, and what to do next.",
      inputSchema: ClassifyErrorToolInputSchema,
      outputSchema: ClassifyErrorOutputSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => classifyErrorTool(input),
  )

  server.registerTool(
    "recommend_recovery",
    {
      title: "Recommend recovery steps",
      description:
        "Turn a structured ErrorLens error into short agent next steps, a stop condition, and read-only tools that can verify state.",
      inputSchema: RecommendRecoveryToolInputSchema,
      outputSchema: RecoveryRecommendationSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => recommendRecoveryTool(input),
  )
}

function registerTraceTools(server: McpServer, defaultTracePath: string | undefined): void {
  server.registerTool(
    "replay_trace",
    {
      title: "Replay a trace",
      description: "Load a local ErrorLens trace by ID and explain what happened.",
      inputSchema: ReplayTraceInputSchema,
      outputSchema: ReplayTraceOutputSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => replayTraceTool(input, defaultTracePath),
  )

  server.registerTool(
    "summarize_failures",
    {
      title: "Summarize failures",
      description:
        "Summarize recent local ErrorLens failures by category, server, and tool, with retry-safe and retry-unsafe counts.",
      inputSchema: SummarizeFailuresInputSchema,
      outputSchema: FailureReportSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => summarizeFailuresTool(input, defaultTracePath),
  )
}

function registerAdapterTools(server: McpServer): void {
  server.registerTool(
    "generate_adapter_rule",
    {
      title: "Generate an adapter rule",
      description:
        "Generate a starter adapter-rule YAML shape from a sample failure message. Secrets are redacted before the message becomes a regex.",
      inputSchema: GenerateAdapterRuleInputSchema,
      outputSchema: GenerateAdapterRuleOutputSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => generateAdapterRuleTool(input),
  )

  server.registerTool(
    "rules_test",
    {
      title: "Test adapter rules",
      description: "Parse adapter rule YAML and report how many rules loaded.",
      inputSchema: RulesTestInputSchema,
      outputSchema: RulesTestOutputSchema,
      annotations: DIAGNOSTIC_TOOL_ANNOTATIONS,
    },
    async (input) => rulesTestTool(input),
  )
}

/**
 * Starts the companion server over stdio (default) or Streamable HTTP.
 * Runtime traces live in a per-process OS temp directory that is removed on
 * shutdown; the trace path is shared by every connection of this process.
 */
export async function startDiagnosticServer(
  serve: ServeOptions = DEFAULT_SERVE_OPTIONS,
): Promise<void> {
  const session = await createErrorLensSession()
  const unregisterExitCleanup = registerSessionExitCleanup(session)
  let shutdown: () => Promise<void> = async () => undefined
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    unregisterExitCleanup()
    process.stdin.removeListener("end", cleanupOnStdinEnd)
    try {
      await shutdown()
    } finally {
      await disposeErrorLensSession(session)
    }
  }
  const cleanupOnStdinEnd = (): void => {
    void cleanup().catch(logError)
  }
  const factory = (): McpServer => buildDiagnosticServer({ tracePath: session.tracePath })

  try {
    if (serve.transport === "http") {
      const running = await serveHttp(factory, { ...serve, onerror: logError })
      shutdown = running.close
      process.stderr.write(`ErrorLens companion listening on ${running.url}\n`)
      return
    }
    process.stdin.once("end", cleanupOnStdinEnd)
    const handle = serveStdio(
      () => {
        const server = factory()
        server.server.onclose = () => {
          void cleanup().catch(logError)
        }
        return server
      },
      { onerror: logError },
    )
    shutdown = () => handle.close()
  } catch (error) {
    await cleanup()
    throw error
  }
}

function logError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`ErrorLens companion: ${message}\n`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const parsed = parseServeArgv(process.argv.slice(2))
  if (parsed.help) {
    process.stderr.write(`${serveUsage("errorlens-companion")}\n`)
  } else if (parsed.version) {
    process.stdout.write(`${packageInfo().version}\n`)
  } else {
    await startDiagnosticServer(resolveServeOptions(parsed.serve))
  }
}
