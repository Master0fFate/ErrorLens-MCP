import assert from "node:assert/strict"
import test from "node:test"
import { parseServeArgv, serveUsage } from "../src/shared/argv.js"
import {
  DEFAULT_SERVE_OPTIONS,
  normalizeEndpointPath,
  resolveServeOptions,
} from "../src/shared/serve-options.js"

test("resolveServeOptions defaults to stdio on loopback HTTP settings", () => {
  assert.deepEqual(resolveServeOptions(), DEFAULT_SERVE_OPTIONS)
  assert.deepEqual(resolveServeOptions({}), DEFAULT_SERVE_OPTIONS)
})

test("resolveServeOptions parses HTTP flags from the command line", () => {
  const resolved = resolveServeOptions({
    transport: "http",
    host: "0.0.0.0",
    port: "0",
    path: "mcp/",
    allowedHost: ["errorlens.internal", " "],
    allowedOrigin: ["app.example"],
  })
  assert.deepEqual(resolved, {
    transport: "http",
    host: "0.0.0.0",
    port: 0,
    path: "/mcp",
    allowedHosts: ["errorlens.internal"],
    allowedOrigins: ["app.example"],
  })
})

test("resolveServeOptions rejects unknown transports and bad ports", () => {
  assert.throws(() => resolveServeOptions({ transport: "sse" }), /Unsupported transport "sse"/u)
  assert.throws(() => resolveServeOptions({ port: "70000" }), /--port/u)
  assert.throws(() => resolveServeOptions({ port: "abc" }), /--port/u)
  assert.throws(() => resolveServeOptions({ port: "1.5" }), /--port/u)
  assert.throws(() => resolveServeOptions({ host: "  " }), /--host/u)
})

test("normalizeEndpointPath produces a single canonical form", () => {
  assert.equal(normalizeEndpointPath("/mcp"), "/mcp")
  assert.equal(normalizeEndpointPath("mcp"), "/mcp")
  assert.equal(normalizeEndpointPath("/mcp///"), "/mcp")
  assert.equal(normalizeEndpointPath(""), "/")
  assert.equal(normalizeEndpointPath("/"), "/")
  assert.equal(normalizeEndpointPath(" /api/mcp "), "/api/mcp")
})

test("parseServeArgv understands the bin flags without the full CLI", () => {
  const parsed = parseServeArgv([
    "--config",
    "/abs/config.yaml",
    "--transport=http",
    "--port",
    "0",
    "--allowed-host",
    "a.internal",
    "b.internal",
    "--path",
    "/mcp",
  ])
  assert.equal(parsed.config, "/abs/config.yaml")
  assert.equal(parsed.help, false)
  assert.deepEqual(resolveServeOptions(parsed.serve), {
    transport: "http",
    host: "127.0.0.1",
    port: 0,
    path: "/mcp",
    allowedHosts: ["a.internal", "b.internal"],
    allowedOrigins: [],
  })
  assert.equal(parseServeArgv(["--help"]).help, true)
  assert.equal(parseServeArgv(["-v"]).version, true)
  assert.deepEqual(resolveServeOptions(parseServeArgv([]).serve), DEFAULT_SERVE_OPTIONS)
  assert.throws(() => parseServeArgv(["--port"]), /--port requires a value/u)
  assert.throws(() => parseServeArgv(["--allowed-host", "--port", "1"]), /at least one value/u)
  assert.throws(() => parseServeArgv(["--bogus"]), /Unknown option "--bogus"/u)
  assert.match(serveUsage("errorlens-companion"), /--transport stdio\|http/u)
})
