import assert from "node:assert/strict"
import test from "node:test"
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createMcpHandler } from "@modelcontextprotocol/server"
import { z } from "zod"
import { defaultConfig } from "../src/config/config-model.js"
import { buildFakeBrokenServer } from "../src/examples/fake-broken-server.js"
import { type ProxyRuntime, ProxyToolRegistry } from "../src/proxy/proxy-model.js"
import { createProxyMcpServer } from "../src/proxy/proxy-server.js"
import { connectUpstreamTransport } from "../src/proxy/upstream-client.js"
import { createErrorLensSession, disposeErrorLensSession } from "../src/session/session-context.js"
import { firstText } from "../src/shared/tool-result.js"
import { JsonlTraceStore } from "../src/trace/jsonl-store.js"

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object")
  assert.notEqual(value, null)
  return value as Record<string, unknown>
}

async function waitFor(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("condition was not met in time")
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test("proxy wraps upstream failures, preserves successes, and forwards tool list changes", async () => {
  const session = await createErrorLensSession()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const fake = buildFakeBrokenServer({ writeDelayMs: 500 })
  await fake.connect(serverTransport)

  const registry = new ProxyToolRegistry({ exposeToolPrefix: true })
  const connection = await connectUpstreamTransport("fake", clientTransport, {
    onToolsChanged: (serverName, tools) => {
      registry.updateTools(serverName, tools)
    },
  })
  registry.addConnection(connection)
  let listChangedNotifications = 0
  registry.subscribe(() => {
    listChangedNotifications += 1
  })

  const base = defaultConfig()
  const runtime: ProxyRuntime = {
    config: { ...base, proxy: { ...base.proxy, default_timeout_ms: 150 } },
    registry,
    traceStore: new JsonlTraceStore(session.tracePath, true),
    adapterRules: [],
  }
  const handler = createMcpHandler(() => createProxyMcpServer(runtime))
  const downstream = new Client({ name: "errorlens-test-harness", version: "0.0.0" })
  await downstream.connect(
    new StreamableHTTPClientTransport(new URL("http://errorlens.test/mcp"), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  )

  try {
    assert.equal(downstream.getServerCapabilities()?.tools?.listChanged, true)
    const { tools } = await downstream.listTools()
    const names = tools.map((tool) => tool.name)
    assert.ok(names.includes("fake__search_docs"))
    assert.ok(names.includes("fake__echo"))
    const searchDocs = tools.find((tool) => tool.name === "fake__search_docs")
    assert.match(searchDocs?.description ?? "", /^\[ErrorLens proxy for fake\/search_docs\]/u)
    assert.equal(searchDocs?.annotations?.readOnlyHint, true, "upstream annotations pass through")

    const echoed = await downstream.callTool({
      name: "fake__echo",
      arguments: { text: "still works" },
    })
    assert.notEqual(echoed.isError, true)
    assert.equal(firstText(echoed), "still works")

    const failed = await downstream.callTool({
      name: "fake__search_docs",
      arguments: { query: "docs" },
    })
    assert.equal(failed.isError, true)
    const failedError = asRecord(asRecord(failed.structuredContent)["error"])
    assert.equal(asRecord(failedError["evidence"])["upstream_server"], "fake")
    assert.equal(typeof failedError["code"], "string")

    const secret = ["sk", "secret", "123456789012345678901234"].join("-")
    const timedOut = await downstream.callTool({
      name: "fake__create_ticket",
      arguments: { title: "demo ticket", api_key: secret },
    })
    assert.equal(timedOut.isError, true)
    const timedOutError = asRecord(asRecord(timedOut.structuredContent)["error"])
    assert.equal(timedOutError["code"], "SIDE_EFFECT_UNKNOWN")
    assert.equal(asRecord(timedOutError["retry"])["safe"], false)
    assert.equal(timedOutError["state_impact"], "possibly_applied")
    assert.equal(firstText(timedOut).includes(secret), false, "secrets are redacted")

    await assert.rejects(
      downstream.callTool({ name: "fake__missing", arguments: {} }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === -32602,
    )

    fake.registerTool(
      "later_tool",
      { description: "Registered after the proxy connected.", inputSchema: z.object({}) },
      async () => ({ content: [{ type: "text", text: "later" }] }),
    )
    await waitFor(() => registry.tools.some((tool) => tool.name === "fake__later_tool"))
    assert.ok(listChangedNotifications >= 1, "registry subscribers were notified")
    const refreshed = await downstream.listTools()
    assert.ok(refreshed.tools.some((tool) => tool.name === "fake__later_tool"))

    const records = await runtime.traceStore.readAll()
    assert.equal(records.filter((record) => record.outcome === "success").length, 1)
    assert.equal(records.filter((record) => record.outcome === "error").length, 2)
  } finally {
    await downstream.close()
    await handler.close()
    await connection.client.close()
    await fake.close()
    await disposeErrorLensSession(session)
  }
})
