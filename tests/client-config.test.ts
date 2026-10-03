import assert from "node:assert/strict"
import test from "node:test"
import {
  CLIENT_IDS,
  type ClientConfigRequest,
  DEFAULT_HTTP_URL,
  launchCommand,
  renderClientConfig,
} from "../src/cli/client-config.js"

const BASE: ClientConfigRequest = {
  client: "cursor",
  mode: "companion",
  transport: "stdio",
  launcher: "npx",
}

test("every supported client renders a parseable stdio and http snippet", () => {
  for (const client of CLIENT_IDS) {
    for (const transport of ["stdio", "http"] as const) {
      const snippet = renderClientConfig({ ...BASE, client, transport })
      assert.ok(snippet.content.length > 0, `${client}/${transport} has content`)
      assert.ok(snippet.file.length > 0, `${client}/${transport} names a file`)
      if (snippet.format === "json") {
        const parsed = JSON.parse(snippet.content) as Record<string, unknown>
        assert.equal(typeof parsed, "object", `${client}/${transport} is JSON`)
      }
      if (transport === "http" && client !== "zed") {
        assert.ok(
          snippet.content.includes(DEFAULT_HTTP_URL),
          `${client} http snippet names the URL`,
        )
      }
    }
  }
})

test("launchCommand switches between npx and a global install", () => {
  assert.deepEqual(launchCommand(BASE), {
    command: "npx",
    args: ["-y", "mcp-errorlens", "companion"],
  })
  assert.deepEqual(launchCommand({ ...BASE, launcher: "global" }), {
    command: "errorlens",
    args: ["companion"],
  })
  assert.deepEqual(launchCommand({ ...BASE, mode: "proxy", configPath: "/etc/errorlens.yaml" }), {
    command: "npx",
    args: ["-y", "mcp-errorlens", "proxy", "--config", "/etc/errorlens.yaml"],
  })
})

test("client specific formats match each harness's configuration shape", () => {
  const vscode = JSON.parse(renderClientConfig({ ...BASE, client: "vscode" }).content) as {
    servers: Record<string, { type: string; command: string }>
  }
  assert.equal(vscode.servers["errorlens"]?.type, "stdio")
  assert.equal(vscode.servers["errorlens"]?.command, "npx")

  const codex = renderClientConfig({
    ...BASE,
    client: "codex",
    mode: "proxy",
    configPath: "/x/config.yaml",
  })
  assert.equal(codex.format, "toml")
  assert.match(codex.content, /^\[mcp_servers\.errorlens-proxy\]$/mu)
  assert.match(codex.content, /"--config", "\/x\/config\.yaml"/u)

  const claudeCode = renderClientConfig({ ...BASE, client: "claude-code", transport: "http" })
  assert.equal(claudeCode.format, "shell")
  assert.equal(claudeCode.content, `claude mcp add --transport http errorlens ${DEFAULT_HTTP_URL}`)

  const cline = JSON.parse(
    renderClientConfig({
      ...BASE,
      client: "cline",
      transport: "http",
      url: "http://10.0.0.5:4000/mcp",
    }).content,
  ) as { mcpServers: Record<string, { type: string; url: string }> }
  assert.equal(cline.mcpServers["errorlens"]?.type, "streamableHttp")
  assert.equal(cline.mcpServers["errorlens"]?.url, "http://10.0.0.5:4000/mcp")

  const named = JSON.parse(
    renderClientConfig({ ...BASE, client: "claude-desktop", serverName: "lens" }).content,
  ) as { mcpServers: Record<string, unknown> }
  assert.deepEqual(Object.keys(named.mcpServers), ["lens"])
})
