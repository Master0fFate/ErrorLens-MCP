import assert from "node:assert/strict"
import test from "node:test"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { defaultConfig } from "../src/config/config-model.js"
import { handleCallToolRequest } from "../src/proxy/call-handler.js"
import type { ProxyRuntime } from "../src/proxy/proxy-model.js"
import { JsonlTraceStore } from "../src/trace/jsonl-store.js"

test("proxy reports an unknown tool as an MCP protocol error", async () => {
  const runtime: ProxyRuntime = {
    config: defaultConfig(),
    registry: {
      tools: [],
      mappings: new Map(),
      connections: [],
    },
    traceStore: new JsonlTraceStore(".errorlens/test-traces.jsonl", false),
    adapterRules: [],
  }

  await assert.rejects(
    handleCallToolRequest(runtime, {
      method: "tools/call",
      params: { name: "missing_tool" },
    }),
    (error: unknown) =>
      error instanceof McpError &&
      error.code === ErrorCode.InvalidParams &&
      error.message.includes("Unknown tool: missing_tool"),
  )
})
