import assert from "node:assert/strict"
import test from "node:test"
import type { Client, Tool } from "@modelcontextprotocol/client"
import { ProxyToolRegistry } from "../src/proxy/proxy-model.js"
import type { UpstreamConnection } from "../src/proxy/upstream-client.js"

function fakeConnection(serverName: string, toolNames: readonly string[]): UpstreamConnection {
  return {
    serverName,
    client: {} as unknown as Client,
    tools: toolNames.map(
      (name): Tool => ({
        name,
        description: `${name} description`,
        inputSchema: { type: "object" },
      }),
    ),
  }
}

test("registry prefixes exposed tools per upstream server and decorates descriptions", () => {
  const registry = new ProxyToolRegistry({ exposeToolPrefix: true })
  registry.addConnection(fakeConnection("github", ["search", "create_issue"]))
  registry.addConnection(fakeConnection("jira", ["search"]))

  assert.deepEqual(
    registry.tools.map((tool) => tool.name),
    ["github__search", "github__create_issue", "jira__search"],
  )
  assert.equal(
    registry.tools[0]?.description,
    "[ErrorLens proxy for github/search] search description",
  )
  assert.equal(registry.mappings.get("jira__search")?.upstreamName, "search")
  assert.equal(registry.connections.length, 2)
})

test("registry rejects colliding tool names when prefixes are disabled", () => {
  const registry = new ProxyToolRegistry({ exposeToolPrefix: false })
  registry.addConnection(fakeConnection("github", ["search"]))
  assert.throws(
    () => registry.addConnection(fakeConnection("jira", ["search"])),
    /Duplicate exposed tool name "search"/u,
  )
  assert.deepEqual(
    registry.tools.map((tool) => tool.name),
    ["search"],
    "a failed add leaves the registry unchanged",
  )
  assert.equal(registry.connections.length, 1)
})

test("registry refreshes one upstream's tools and notifies subscribers", () => {
  const registry = new ProxyToolRegistry({ exposeToolPrefix: true })
  registry.addConnection(fakeConnection("github", ["search"]))
  let notifications = 0
  const unsubscribe = registry.subscribe(() => {
    notifications += 1
  })

  assert.equal(registry.updateTools("unknown", []), false)
  assert.equal(notifications, 0)

  const [refreshed] = fakeConnection("github", ["search", "list_repos"]).tools.slice(1)
  assert.ok(refreshed)
  assert.equal(registry.updateTools("github", [refreshed]), true)
  assert.deepEqual(
    registry.tools.map((tool) => tool.name),
    ["github__list_repos"],
  )
  assert.equal(registry.mappings.has("github__search"), false)
  assert.equal(notifications, 1)

  unsubscribe()
  registry.updateTools("github", [])
  assert.equal(notifications, 1)
  assert.equal(registry.tools.length, 0)
})

test("registry refuses a second connection with the same server name", () => {
  const registry = new ProxyToolRegistry({ exposeToolPrefix: true })
  registry.addConnection(fakeConnection("github", ["search"]))
  assert.throws(
    () => registry.addConnection(fakeConnection("github", ["other"])),
    /already registered/u,
  )
})
