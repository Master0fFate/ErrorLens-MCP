import assert from "node:assert/strict"
import test from "node:test"
import {
  Client,
  type ClientOptions,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server"
import { buildDiagnosticServer, COMPANION_SERVER_NAME } from "../src/companion/diagnostic-server.js"
import { createErrorLensSession, disposeErrorLensSession } from "../src/session/session-context.js"
import { packageInfo } from "../src/shared/package-info.js"

const COMPANION_TOOL_NAMES = [
  "classify_error",
  "generate_adapter_rule",
  "recommend_recovery",
  "replay_trace",
  "rules_test",
  "summarize_failures",
]

async function connectInProcess(handler: McpHttpHandler, options?: ClientOptions): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL("http://errorlens.test/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  })
  const client = new Client({ name: "errorlens-test-harness", version: "0.0.0" }, options)
  await client.connect(transport)
  return client
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object")
  assert.notEqual(value, null)
  return value as Record<string, unknown>
}

test("companion serves 2025-era and 2026-07-28 clients from one factory", async () => {
  const session = await createErrorLensSession()
  const handler = createMcpHandler(() => buildDiagnosticServer({ tracePath: session.tracePath }))
  try {
    const eras: ReadonlyArray<{ options: ClientOptions | undefined; era: string }> = [
      { options: undefined, era: "legacy" },
      { options: { versionNegotiation: { mode: "auto" } }, era: "modern" },
    ]
    for (const { options, era } of eras) {
      const client = await connectInProcess(handler, options)
      try {
        assert.equal(client.getProtocolEra(), era)
        const { tools } = await client.listTools()
        assert.deepEqual(tools.map((tool) => tool.name).sort(), COMPANION_TOOL_NAMES)
        for (const tool of tools) {
          assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is read-only`)
          assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} is local`)
          assert.ok(tool.title, `${tool.name} has a title`)
          assert.ok(tool.outputSchema, `${tool.name} advertises an output schema`)
        }

        const result = await client.callTool({
          name: "classify_error",
          arguments: {
            server_name: "demo",
            tool_name: "search_docs",
            raw_error: "HTTP 429 too many requests",
            http_status: 429,
            tool_side_effect_type: "read",
            duration_ms: 42,
          },
        })
        assert.notEqual(result.isError, true)
        const structured = asRecord(result.structuredContent)
        const structuredError = asRecord(structured["structured_error"])
        const error = asRecord(structuredError["error"])
        assert.equal(error["code"], "RATE_LIMITED")
        assert.equal(asRecord(structured["recovery"])["safe_to_retry"], true)
      } finally {
        await client.close()
      }
    }
  } finally {
    await handler.close()
    await disposeErrorLensSession(session)
  }
})

test("companion identifies itself with the package version and instructions", async () => {
  const handler = createMcpHandler(() => buildDiagnosticServer())
  const client = await connectInProcess(handler)
  try {
    assert.equal(client.getServerVersion()?.name, COMPANION_SERVER_NAME)
    assert.equal(client.getServerVersion()?.version, packageInfo().version)
    assert.match(client.getInstructions() ?? "", /classify_error/u)
  } finally {
    await client.close()
    await handler.close()
  }
})

test("companion reports invalid tool input as a tool error, not a protocol error", async () => {
  const handler = createMcpHandler(() => buildDiagnosticServer())
  const client = await connectInProcess(handler)
  try {
    const badYaml = await client.callTool({
      name: "rules_test",
      arguments: { yaml: "server: demo\nrules: not-a-list\n" },
    })
    assert.equal(badYaml.isError, true)

    const missingArgument = await client.callTool({ name: "rules_test", arguments: {} })
    assert.equal(missingArgument.isError, true)

    const summary = await client.callTool({ name: "summarize_failures", arguments: {} })
    assert.equal(summary.isError, true, "no session trace path means a tool error")
  } finally {
    await client.close()
    await handler.close()
  }
})
