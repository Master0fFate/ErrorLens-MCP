import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { buildProgram, runDoctor } from "../src/cli/program.js"
import { writeDefaultConfig } from "../src/config/load-config.js"
import { createErrorLensSession, disposeErrorLensSession } from "../src/session/session-context.js"
import { implementationInfo, packageInfo, readPackageInfo } from "../src/shared/package-info.js"

type Manifest = {
  readonly name: string
  readonly version: string
  readonly mcpName?: string
  readonly bin?: Record<string, string>
  readonly dependencies?: Record<string, string>
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

test("packageInfo reads the real package.json wherever the build lives", async () => {
  const manifest = await readJson<Manifest>(resolve("package.json"))
  assert.equal(packageInfo().name, manifest.name)
  assert.equal(packageInfo().version, manifest.version)
  assert.equal(implementationInfo("mcp-errorlens-proxy").version, manifest.version)
  assert.equal(implementationInfo("mcp-errorlens-proxy").name, "mcp-errorlens-proxy")
  assert.equal(readPackageInfo(tmpdir()).version, "0.0.0-unknown", "falls back outside the package")
})

test("package.json no longer depends on the legacy monolithic MCP SDK", async () => {
  const manifest = await readJson<Manifest>(resolve("package.json"))
  assert.equal(manifest.dependencies?.["@modelcontextprotocol/sdk"], undefined)
  assert.ok(manifest.dependencies?.["@modelcontextprotocol/server"])
  assert.ok(manifest.dependencies?.["@modelcontextprotocol/client"])
  assert.ok(manifest.dependencies?.["@modelcontextprotocol/node"])
})

test("server.json matches package.json for the MCP registry", async () => {
  const manifest = await readJson<Manifest>(resolve("package.json"))
  const server = await readJson<{
    readonly $schema: string
    readonly name: string
    readonly version: string
    readonly packages: ReadonlyArray<{
      readonly registryType: string
      readonly identifier: string
      readonly version: string
      readonly transport: { readonly type: string }
    }>
  }>(resolve("server.json"))

  assert.match(
    server.$schema,
    /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/u,
  )
  assert.match(server.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/u)
  assert.equal(server.name, manifest.mcpName)
  assert.equal(server.version, manifest.version)
  assert.equal(server.packages.length, 1)
  assert.equal(server.packages[0]?.registryType, "npm")
  assert.equal(server.packages[0]?.identifier, manifest.name)
  assert.equal(server.packages[0]?.version, manifest.version)
  assert.equal(server.packages[0]?.transport.type, "stdio")
})

test("example client configurations are valid JSON", async () => {
  const examplesDir = resolve("examples")
  const files = (await readdir(examplesDir)).filter((file) => file.endsWith(".json"))
  assert.ok(files.length >= 4)
  for (const file of files) {
    const parsed = await readJson<Record<string, unknown>>(join(examplesDir, file))
    assert.equal(typeof parsed, "object", file)
  }
})

test("the CLI exposes companion, proxy, and client-config commands", () => {
  const names = buildProgram()
    .commands.map((command) => command.name())
    .sort()
  assert.deepEqual(names, [
    "client-config",
    "companion",
    "doctor",
    "init",
    "proxy",
    "replay",
    "report",
    "rules",
    "traces",
  ])
})

test("doctor reports protocol support and the session trace scope", async () => {
  const session = await createErrorLensSession()
  try {
    const configPath = await writeDefaultConfig(join(session.directory, "config"))
    const report = await runDoctor(configPath)
    assert.equal(report.ok, true)
    assert.equal(report.errorlens_version, packageInfo().version)
    assert.equal(report.trace_scope, "session_temp")
    assert.ok(report.mcp.supported_protocol_versions.includes(report.mcp.latest_protocol_version))
    assert.ok(report.mcp.supported_protocol_versions.includes("2025-11-25"))
    assert.deepEqual(report.servers, [])
  } finally {
    await disposeErrorLensSession(session)
  }
})
