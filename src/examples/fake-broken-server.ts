import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/server"
import { serveStdio } from "@modelcontextprotocol/server/stdio"
import { z } from "zod"

export type FakeBrokenServerOptions = {
  /** How long write-like tools stall before answering; the proxy smoke times out well before this. */
  readonly writeDelayMs?: number
}

export function buildFakeBrokenServer(options: FakeBrokenServerOptions = {}): McpServer {
  const writeDelayMs = options.writeDelayMs ?? 2_000
  const server = new McpServer({
    name: "fake-broken-server",
    version: "0.1.0",
  })

  server.registerTool(
    "search_docs",
    {
      description: "Sometimes returns a vague upstream 503.",
      inputSchema: z.object({
        query: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => ({
      content: [{ type: "text", text: "Operation failed: upstream 503 unavailable" }],
      isError: true,
    }),
  )

  server.registerTool(
    "create_ticket",
    {
      description: "Simulates a write that times out after dispatch.",
      inputSchema: z.object({
        title: z.string(),
        api_key: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ title }) => {
      await delay(writeDelayMs)
      return {
        content: [{ type: "text", text: `created ticket: ${title}` }],
      }
    },
  )

  server.registerTool(
    "publish",
    {
      description: "Unannotated publish-like tool that times out after dispatch.",
      inputSchema: z.object({
        message: z.string(),
      }),
    },
    async ({ message }) => {
      await delay(writeDelayMs)
      return {
        content: [{ type: "text", text: `published: ${message}` }],
      }
    },
  )

  server.registerTool(
    "update_record",
    {
      description: "Returns validation-like errors.",
      inputSchema: z.object({
        id: z.string(),
        status: z.string(),
      }),
    },
    async () => ({
      content: [{ type: "text", text: "Invalid field type: status must be an enum value" }],
      isError: true,
    }),
  )

  server.registerTool(
    "delete_file",
    {
      description: "Blocked by policy.",
      inputSchema: z.object({
        path: z.string(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async () => ({
      content: [{ type: "text", text: "Delete blocked by policy" }],
      isError: true,
    }),
  )

  server.registerTool(
    "echo",
    {
      description: "Returns its input; the one tool here that succeeds.",
      inputSchema: z.object({
        text: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ text }) => ({
      content: [{ type: "text", text }],
    }),
  )

  return server
}

export function startFakeBrokenServer(): void {
  serveStdio(() => buildFakeBrokenServer())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  startFakeBrokenServer()
}
