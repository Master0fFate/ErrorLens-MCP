import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node"
import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { connectUpstream } from "../src/proxy/upstream-client.js"
import { serveHttp } from "../src/shared/http-server.js"
import { parseToolResult } from "../src/shared/tool-result.js"

function buildPingServer(): McpServer {
  const upstream = new McpServer({ name: "http-upstream", version: "0.1.0" })
  upstream.registerTool(
    "ping",
    {
      description: "Returns a stable health response.",
      inputSchema: z.object({}),
    },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  )
  return upstream
}

test("connectUpstream talks to a sessionful 2025-era Streamable HTTP server", async () => {
  const upstream = buildPingServer()
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: () => "http-test-session",
    enableJsonResponse: true,
  })
  await upstream.connect(transport)

  const httpServer = createServer((request, response) => {
    void transport.handleRequest(request, response)
  })
  await listen(httpServer)

  try {
    const address = httpServer.address()
    if (address === null || typeof address === "string") {
      throw new Error("HTTP smoke server did not expose a TCP address")
    }
    const connection = await connectUpstream("remote", {
      transport: "streamable_http",
      url: `http://127.0.0.1:${address.port}/mcp`,
      headers: {},
      adapter_rules: [],
      negotiation: "legacy",
    })

    try {
      assert.deepEqual(
        connection.tools.map((tool) => tool.name),
        ["ping"],
      )
      assert.equal(connection.client.getProtocolEra(), "legacy")
      const result = parseToolResult(
        await connection.client.callTool({ name: "ping", arguments: {} }),
      )
      assert.equal(result.content[0]?.type, "text")
    } finally {
      await connection.client.close()
    }
  } finally {
    await transport.close()
    await close(httpServer)
  }
})

test("connectUpstream negotiates the 2026-07-28 era against a modern upstream", async () => {
  const running = await serveHttp(() => buildPingServer(), {
    host: "127.0.0.1",
    port: 0,
    path: "/mcp",
  })
  try {
    const connection = await connectUpstream("modern", {
      transport: "streamable_http",
      url: running.url,
      headers: {},
      adapter_rules: [],
      negotiation: "auto",
    })
    try {
      assert.equal(connection.client.getProtocolEra(), "modern")
      assert.deepEqual(
        connection.tools.map((tool) => tool.name),
        ["ping"],
      )
      const result = await connection.client.callTool({ name: "ping", arguments: {} })
      assert.equal(result.content[0]?.type, "text")
    } finally {
      await connection.client.close()
    }
  } finally {
    await running.close()
  }
})

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}
