import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { z } from "zod"
import { StructuredErrorSchema } from "../core/structured-error-model.js"
import { packageInfo } from "../shared/package-info.js"
import { firstText, parseToolResult } from "../shared/tool-result.js"
import { type HttpChild, parseTransportFlag, spawnHttpChild } from "./http-child.js"

const CompanionResponseSchema = z.object({
  structured_error: StructuredErrorSchema,
})

const COMPANION_BIN = "dist/companion/diagnostic-server.js"

async function runCompanionSmoke(kind: string, transport: "stdio" | "http"): Promise<void> {
  if (kind !== "rate-limit") {
    throw new Error(`unsupported companion smoke: ${kind}`)
  }
  if (transport === "http") {
    await runHttpSmoke()
    return
  }
  const legacy = new Client({ name: "errorlens-companion-smoke", version: packageInfo().version })
  await legacy.connect(
    new StdioClientTransport({ command: process.execPath, args: [COMPANION_BIN], stderr: "pipe" }),
  )
  try {
    await verifyRateLimit(legacy, "stdio/legacy")
  } finally {
    await legacy.close()
  }

  // A 2026-07-28 client probes with server/discover before connecting; on stdio
  // the SDK runs that probe on a disposable sibling process.
  const modern = new Client(
    { name: "errorlens-companion-smoke", version: packageInfo().version },
    { versionNegotiation: { mode: "auto" } },
  )
  await modern.connect(
    new StdioClientTransport({ command: process.execPath, args: [COMPANION_BIN], stderr: "pipe" }),
  )
  try {
    if (modern.getProtocolEra() !== "modern") {
      throw new Error(`expected the 2026-07-28 era, got ${modern.getProtocolEra() ?? "none"}`)
    }
    await verifyRateLimit(modern, "stdio/modern")
  } finally {
    await modern.close()
  }
}

async function runHttpSmoke(): Promise<void> {
  const child: HttpChild = await spawnHttpChild([COMPANION_BIN])
  try {
    const legacy = new Client({ name: "errorlens-companion-smoke", version: packageInfo().version })
    await legacy.connect(new StreamableHTTPClientTransport(new URL(child.url)))
    try {
      await verifyRateLimit(legacy, "http/legacy")
    } finally {
      await legacy.close()
    }

    const modern = new Client(
      { name: "errorlens-companion-smoke", version: packageInfo().version },
      { versionNegotiation: { mode: "auto" } },
    )
    await modern.connect(new StreamableHTTPClientTransport(new URL(child.url)))
    try {
      if (modern.getProtocolEra() !== "modern") {
        throw new Error(`expected the 2026-07-28 era, got ${modern.getProtocolEra() ?? "none"}`)
      }
      await verifyRateLimit(modern, "http/modern")
    } finally {
      await modern.close()
    }
  } finally {
    await child.stop()
  }
}

async function verifyRateLimit(client: Client, label: string): Promise<void> {
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
  process.stdout.write(
    `${[
      `PASS companion-rate-limit (${label})`,
      `code=${parsed.structured_error.error.code}`,
      `retry.safe=${parsed.structured_error.error.retry.safe}`,
    ].join("\n")}\n`,
  )
}

const { positional, transport } = parseTransportFlag(process.argv.slice(2))
await runCompanionSmoke(positional[0] ?? "rate-limit", transport)
