#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  createErrorLensSession,
  disposeErrorLensSession,
  registerSessionExitCleanup,
} from "../session/session-context.js"
import {
  classifyErrorTool,
  generateAdapterRuleTool,
  recommendRecoveryTool,
  replayTraceTool,
  rulesTestTool,
  summarizeFailuresTool,
} from "./mcp-tools.js"

export type DiagnosticServerOptions = {
  readonly tracePath?: string
}

export function buildDiagnosticServer(options: DiagnosticServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "mcp-errorlens",
    version: "0.1.0",
  })

  registerClassificationTools(server)
  registerTraceTools(server, options.tracePath)
  registerAdapterTools(server)
  return server
}

function registerClassificationTools(server: McpServer): void {
  server.registerTool(
    "classify_error",
    {
      description: "Classify raw MCP/tool failure data into ErrorLens structured recovery JSON.",
      inputSchema: {
        server_name: z.string().optional(),
        tool_name: z.string().optional(),
        raw_error: z.unknown().optional(),
        raw_result: z.unknown().optional(),
        duration_ms: z.number().int().nonnegative().optional(),
        tool_arguments_summary: z.unknown().optional(),
        tool_side_effect_type: z.enum(["read", "write", "destructive", "unknown"]).optional(),
        timed_out: z.boolean().optional(),
        http_status: z.number().int().positive().optional(),
        exception_name: z.string().optional(),
      },
    },
    async (input) => classifyErrorTool(input),
  )

  server.registerTool(
    "recommend_recovery",
    {
      description: "Turn a structured ErrorLens error into short agent next steps.",
      inputSchema: {
        structured_error: z.unknown(),
        available_alternative_tools: z.array(z.string()).optional(),
      },
    },
    async (input) => recommendRecoveryTool(input),
  )
}

function registerTraceTools(server: McpServer, defaultTracePath: string | undefined): void {
  server.registerTool(
    "replay_trace",
    {
      description: "Load a local ErrorLens trace and explain what happened.",
      inputSchema: {
        trace_id: z.string(),
        trace_path: z.string().optional(),
      },
    },
    async (input) => replayTraceTool(input, defaultTracePath),
  )

  server.registerTool(
    "summarize_failures",
    {
      description: "Summarize recent local ErrorLens failures.",
      inputSchema: {
        trace_path: z.string().optional(),
        server_name: z.string().optional(),
        tool_name: z.string().optional(),
      },
    },
    async (input) => summarizeFailuresTool(input, defaultTracePath),
  )
}

function registerAdapterTools(server: McpServer): void {
  server.registerTool(
    "generate_adapter_rule",
    {
      description: "Generate a starter adapter-rule YAML shape from a sample failure.",
      inputSchema: {
        server_name: z.string(),
        sample_message: z.string(),
        http_status: z.number().int().nullable().optional(),
      },
    },
    async (input) => generateAdapterRuleTool(input),
  )

  server.registerTool(
    "rules_test",
    {
      description: "Parse adapter rule YAML and report how many rules loaded.",
      inputSchema: {
        yaml: z.string(),
      },
    },
    async (input) => rulesTestTool(input),
  )
}

export async function startDiagnosticServer(): Promise<void> {
  const session = await createErrorLensSession()
  const unregisterExitCleanup = registerSessionExitCleanup(session)
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    unregisterExitCleanup()
    process.stdin.removeListener("end", cleanupOnStdinEnd)
    await disposeErrorLensSession(session)
  }
  const cleanupOnStdinEnd = (): void => {
    void cleanup().catch(() => undefined)
  }
  process.stdin.once("end", cleanupOnStdinEnd)
  const server = buildDiagnosticServer({ tracePath: session.tracePath })
  server.server.onclose = () => {
    void cleanup()
  }
  try {
    await server.connect(new StdioServerTransport())
  } catch (error) {
    await cleanup()
    throw error
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await startDiagnosticServer()
}
