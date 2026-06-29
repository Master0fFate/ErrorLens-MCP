import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { z } from "zod"
import { StructuredErrorSchema } from "../core/structured-error-model.js"
import { firstText, parseToolResult } from "../shared/tool-result.js"

const CompanionResponseSchema = z.object({
  structured_error: StructuredErrorSchema,
})

async function runCompanionSmoke(kind: string): Promise<void> {
  if (kind !== "rate-limit") {
    throw new Error(`unsupported companion smoke: ${kind}`)
  }

  const client = new Client({
    name: "errorlens-companion-smoke",
    version: "0.1.0",
  })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/companion/diagnostic-server.js"],
    stderr: "pipe",
  })

  await client.connect(transport)
  try {
    const result = parseToolResult(
      await client.callTool({
        name: "classify_error",
        arguments: {
          server_name: "demo",
          tool_name: "search_docs",
          raw_error: "HTTP 429 too many requests",
          http_status: 429,
          tool_side_effect_type: "read",
          duration_ms: 42,
        },
      }),
    )
    const parsed = CompanionResponseSchema.parse(JSON.parse(firstText(result)))
    if (parsed.structured_error.error.code !== "RATE_LIMITED") {
      throw new Error(`expected RATE_LIMITED, got ${parsed.structured_error.error.code}`)
    }
    if (!parsed.structured_error.error.retry.safe) {
      throw new Error("expected retry.safe=true")
    }
    const lines = [
      "PASS companion-rate-limit",
      `code=${parsed.structured_error.error.code}`,
      `retry.safe=${parsed.structured_error.error.retry.safe}`,
    ]
    process.stdout.write(`${lines.join("\n")}\n`)
  } finally {
    await client.close()
  }
}

const kind = process.argv[2] ?? "rate-limit"
await runCompanionSmoke(kind)
