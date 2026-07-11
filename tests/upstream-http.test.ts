import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { connectUpstream } from "../src/proxy/upstream-client.js"
import { parseToolResult } from "../src/shared/tool-result.js"

test("connectUpstream discovers and calls a Streamable HTTP server", async () => {
  const upstream = new McpServer({ name: "http-upstream", version: "0.1.0" })
  upstream.registerTool(
    "ping",
    {
      description: "Returns a stable health response.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  )
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => "http-test-session",
    enableJsonResponse: true,
  })
  await upstream.connect(transport as Parameters<McpServer["connect"]>[0])

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
    })

    try {
      assert.deepEqual(
        connection.tools.map((tool) => tool.name),
        ["ping"],
      )
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
