import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { stringify as stringifyYaml } from "yaml"
import { StructuredErrorSchema } from "../core/structured-error-model.js"
import { firstText, parseToolResult } from "../shared/tool-result.js"

type SmokeKind = "write-timeout" | "publish-timeout" | "adapter-rule"

async function runProxySmoke(kind: SmokeKind): Promise<void> {
  const tmpDir = resolve(".omo/ulw-loop/tmp/proxy-smoke")
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  const tracePath = resolve(tmpDir, "traces.jsonl")
  const configPath = resolve(tmpDir, "config.yaml")
  if (kind === "adapter-rule") {
    await writeAdapterRule(resolve(tmpDir, "adapter.yaml"))
  }
  await writeSmokeConfig(configPath, tracePath, kind)

  const client = await connectProxyClient(configPath)
  try {
    await verifyProxyResult(client, kind, tracePath)
  } finally {
    await client.close()
  }
}

async function writeAdapterRule(path: string): Promise<void> {
  await writeFile(
    path,
    `server: fake
rules:
  - name: unavailable-is-rate-limit
    match:
      status: 503
      message_regex: "upstream 503"
    classify:
      code: RATE_LIMITED
      layer: rate_limit
      category: rate_limit
      permanence: transient
      retry:
        safe: true
        after_ms: 30000
        max_attempts: 1
        backoff: fixed
        requires_idempotency_key: false
        same_arguments_required: true
      state_impact: none
      user_action_required: false
      agent_next_steps:
        - Wait before retrying.
      do_not:
        - Do not retry rapidly.
`,
    "utf8",
  )
}

async function writeSmokeConfig(
  configPath: string,
  tracePath: string,
  kind: SmokeKind,
): Promise<void> {
  await writeFile(
    configPath,
    stringifyYaml({
      version: 1,
      trace: { enabled: true, path: tracePath, redact_secrets: true },
      proxy: { expose_tool_prefix: true, default_timeout_ms: 150, max_result_chars: 12_000 },
      rules: { custom_paths: kind === "adapter-rule" ? ["adapter.yaml"] : [] },
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
}

async function connectProxyClient(configPath: string): Promise<Client> {
  const client = new Client({ name: "errorlens-proxy-smoke", version: "0.1.0" })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/proxy/proxy-server.js", "--config", configPath],
    stderr: "pipe",
  })
  await client.connect(transport)
  return client
}

async function verifyProxyResult(
  client: Client,
  kind: SmokeKind,
  tracePath: string,
): Promise<void> {
  const fakeSecret = ["sk", "secret", "123456789012345678901234"].join("-")
  const result = parseToolResult(await client.callTool(callForKind(kind, fakeSecret)))
  if (result.structuredContent === undefined) {
    throw new Error("proxy result did not include structuredContent")
  }
  const structured = StructuredErrorSchema.parse(JSON.parse(firstText(result)))
  if (kind === "adapter-rule") {
    if (structured.error.code !== "RATE_LIMITED") {
      throw new Error(`expected adapter RATE_LIMITED, got ${structured.error.code}`)
    }
    process.stdout.write("PASS proxy-adapter-rule\ncode=RATE_LIMITED\nstructuredContent=true\n")
    return
  }
  if (structured.error.code !== "SIDE_EFFECT_UNKNOWN") {
    throw new Error(`expected SIDE_EFFECT_UNKNOWN, got ${structured.error.code}`)
  }
  if (structured.error.retry.safe || structured.error.state_impact !== "possibly_applied") {
    throw new Error("write-like timeout did not produce unsafe ambiguous-state guidance")
  }
  const traceText = await readFile(tracePath, "utf8")
  if (kind === "write-timeout" && traceText.includes(fakeSecret)) {
    throw new Error("trace leaked secret-like argument")
  }
  if (kind === "write-timeout" && !traceText.includes("[REDACTED]")) {
    throw new Error("trace did not include redaction marker")
  }
  process.stdout.write(
    `${[
      `PASS proxy-${kind}`,
      `code=${structured.error.code}`,
      `retry.safe=${structured.error.retry.safe}`,
      `state_impact=${structured.error.state_impact}`,
      `trace=${tracePath}`,
    ].join("\n")}\n`,
  )
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
  if (kind === "adapter-rule") {
    return {
      name: "fake__search_docs",
      arguments: { query: "docs" },
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

const kind = parseSmokeKind(process.argv[2] ?? "write-timeout")
await runProxySmoke(kind)

function parseSmokeKind(value: string): SmokeKind {
  if (value === "write-timeout" || value === "publish-timeout" || value === "adapter-rule") {
    return value
  }
  throw new Error(`unsupported proxy smoke: ${value}`)
}
