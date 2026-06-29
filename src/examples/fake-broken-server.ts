import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

export function buildFakeBrokenServer(): McpServer {
  const server = new McpServer({
    name: "fake-broken-server",
    version: "0.1.0",
  })

  server.registerTool(
    "search_docs",
    {
      description: "Sometimes returns a vague upstream 503.",
      inputSchema: {
        query: z.string(),
      },
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
      inputSchema: {
        title: z.string(),
        api_key: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ title }) => {
      await delay(2_000)
      return {
        content: [{ type: "text", text: `created ticket: ${title}` }],
      }
    },
  )

  server.registerTool(
    "publish",
    {
      description: "Unannotated publish-like tool that times out after dispatch.",
      inputSchema: {
        message: z.string(),
      },
    },
    async ({ message }) => {
      await delay(2_000)
      return {
        content: [{ type: "text", text: `published: ${message}` }],
      }
    },
  )

  server.registerTool(
    "update_record",
    {
      description: "Returns validation-like errors.",
      inputSchema: {
        id: z.string(),
        status: z.string(),
      },
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
      inputSchema: {
        path: z.string(),
      },
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

  return server
}

export async function startFakeBrokenServer(): Promise<void> {
  await buildFakeBrokenServer().connect(new StdioServerTransport())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await startFakeBrokenServer()
}
