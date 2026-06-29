import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { stringify as stringifyYaml } from "yaml"
import { StructuredErrorSchema } from "../core/structured-error-model.js"
import { firstText, parseToolResult } from "../shared/tool-result.js"

async function runProxySmoke(kind: string): Promise<void> {
  if (kind !== "write-timeout" && kind !== "publish-timeout") {
    throw new Error(`unsupported proxy smoke: ${kind}`)
  }

  const tmpDir = resolve(".omo/ulw-loop/tmp/proxy-smoke")
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  const tracePath = resolve(tmpDir, "traces.jsonl")
  const configPath = resolve(tmpDir, "config.yaml")
  await writeFile(
    configPath,
    stringifyYaml({
      version: 1,
      trace: {
        enabled: true,
        path: tracePath,
        redact_secrets: true,
      },
      proxy: {
        expose_tool_prefix: true,
        default_timeout_ms: 150,
        max_result_chars: 12_000,
      },
      servers: {
        fake: {
          transport: "stdio",
          command: process.execPath,
          args: ["dist/examples/fake-broken-server.js"],
          env: {},
        },
      },
    }),
    "utf8",
  )

  const client = new Client({
    name: "errorlens-proxy-smoke",
    version: "0.1.0",
  })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/proxy/proxy-server.js", "--config", configPath],
    stderr: "pipe",
  })

  await client.connect(transport)
  try {
    const fakeSecret = ["sk", "secret", "123456789012345678901234"].join("-")
    const result = parseToolResult(await client.callTool(callForKind(kind, fakeSecret)))
    const structured = StructuredErrorSchema.parse(JSON.parse(firstText(result)))
    if (structured.error.code !== "SIDE_EFFECT_UNKNOWN") {
      throw new Error(`expected SIDE_EFFECT_UNKNOWN, got ${structured.error.code}`)
    }
    if (structured.error.retry.safe) {
      throw new Error("expected retry.safe=false")
    }
    if (structured.error.state_impact !== "possibly_applied") {
      throw new Error(`expected possibly_applied, got ${structured.error.state_impact}`)
    }
    const traceText = await readFile(tracePath, "utf8")
    if (kind === "write-timeout" && traceText.includes(fakeSecret)) {
      throw new Error("trace leaked secret-like argument")
    }
    if (kind === "write-timeout" && !traceText.includes("[REDACTED]")) {
      throw new Error("trace did not include redaction marker")
    }
    const lines = [
      `PASS proxy-${kind}`,
      `code=${structured.error.code}`,
      `retry.safe=${structured.error.retry.safe}`,
      `state_impact=${structured.error.state_impact}`,
      `trace=${tracePath}`,
    ]
    process.stdout.write(`${lines.join("\n")}\n`)
  } finally {
    await client.close()
  }
}

function callForKind(
  kind: string,
  fakeSecret: string,
): { readonly name: string; readonly arguments: Record<string, string> } {
  if (kind === "publish-timeout") {
    return {
      name: "fake__publish",
      arguments: { message: "release shipped" },
    }
  }
  return {
    name: "fake__create_ticket",
    arguments: {
      title: "demo ticket",
      api_key: fakeSecret,
    },
  }
}

const kind = process.argv[2] ?? "write-timeout"
await runProxySmoke(kind)
