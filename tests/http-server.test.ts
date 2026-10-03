import assert from "node:assert/strict"
import { request as httpRequest } from "node:http"
import test from "node:test"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { buildDiagnosticServer } from "../src/companion/diagnostic-server.js"
import { isLoopbackHost, serveHttp } from "../src/shared/http-server.js"

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw-probe", version: "0.0.0" },
  },
})

type RawResponse = { readonly status: number; readonly body: string }

async function rawPost(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => {
          body += chunk
        })
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }))
      },
    )
    request.on("error", reject)
    request.end(INITIALIZE_BODY)
  })
}

test("serveHttp serves the companion over a real socket and guards Host and Origin", async () => {
  const running = await serveHttp(() => buildDiagnosticServer(), {
    host: "127.0.0.1",
    port: 0,
    path: "/mcp",
  })
  try {
    assert.equal(running.url, `http://127.0.0.1:${running.port}/mcp`)

    const client = new Client({ name: "errorlens-test-harness", version: "0.0.0" })
    await client.connect(new StreamableHTTPClientTransport(new URL(running.url)))
    try {
      const { tools } = await client.listTools()
      assert.equal(tools.length, 6)
    } finally {
      await client.close()
    }

    const legit = await rawPost(running.port, "/mcp", {})
    assert.equal(legit.status, 200)

    const rebinding = await rawPost(running.port, "/mcp", { host: "evil.example" })
    assert.equal(rebinding.status, 403, "DNS rebinding Host headers are rejected")

    const foreignOrigin = await rawPost(running.port, "/mcp", { origin: "https://evil.example" })
    assert.equal(foreignOrigin.status, 403, "foreign browser origins are rejected")

    const wrongPath = await rawPost(running.port, "/other", {})
    assert.equal(wrongPath.status, 404)
    assert.match(wrongPath.body, /\/mcp/u)
  } finally {
    await running.close()
  }
})

test("serveHttp normalizes the endpoint path and widens the Host allow list on request", async () => {
  const running = await serveHttp(() => buildDiagnosticServer(), {
    host: "127.0.0.1",
    port: 0,
    path: "errorlens/",
    allowedHosts: ["errorlens.internal"],
  })
  try {
    assert.equal(running.path, "/errorlens")
    const internal = await rawPost(running.port, "/errorlens", { host: "errorlens.internal:8080" })
    assert.equal(internal.status, 200)
    const loopback = await rawPost(running.port, "/errorlens/", {})
    assert.equal(loopback.status, 200, "loopback hosts stay allowed")
    const other = await rawPost(running.port, "/errorlens", { host: "other.internal" })
    assert.equal(other.status, 403)
  } finally {
    await running.close()
  }
})

test("isLoopbackHost recognises IPv4, IPv6, and localhost binds", () => {
  for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    assert.equal(isLoopbackHost(host), true, host)
  }
  for (const host of ["0.0.0.0", "::", "192.168.1.10", "example.com"]) {
    assert.equal(isLoopbackHost(host), false, host)
  }
})
