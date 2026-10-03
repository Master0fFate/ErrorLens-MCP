import {
  createServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from "node:http"
import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  type NodeIncomingMessageLike,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node"
import {
  createMcpHandler,
  type McpHttpHandler,
  type McpServerFactory,
} from "@modelcontextprotocol/server"
import { normalizeEndpointPath } from "./serve-options.js"

export const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "::1", "[::1]"]

export type HttpServeOptions = {
  readonly host: string
  readonly port: number
  readonly path: string
  readonly allowedHosts?: readonly string[]
  readonly allowedOrigins?: readonly string[]
  readonly onerror?: (error: Error) => void
}

export type RunningHttpServer = {
  readonly url: string
  readonly host: string
  readonly port: number
  readonly path: string
  readonly handler: McpHttpHandler
  readonly close: () => Promise<void>
}

type RequestGuard = (request: IncomingMessage, response: ServerResponse) => boolean

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host)
}

/**
 * Serves an MCP server factory over Streamable HTTP on a plain `node:http`
 * server. One fresh server instance is built per request (the SDK's
 * stateless posture), so the same factory serves 2025-era clients and
 * 2026-07-28 clients alike.
 *
 * Loopback binds get the SDK's `Host` and `Origin` guards (DNS rebinding
 * protection) by default; other binds only validate what the caller allows.
 */
export async function serveHttp(
  factory: McpServerFactory,
  options: HttpServeOptions,
): Promise<RunningHttpServer> {
  const onerror = options.onerror ?? (() => undefined)
  const handler = createMcpHandler(factory, { onerror })
  const nodeHandler = toNodeHandler(handler, { onerror })
  const guards = selectGuards(options)
  const endpointPath = normalizeEndpointPath(options.path)

  const httpServer = createServer((request, response) => {
    const requestPath = normalizeEndpointPath(
      new URL(request.url ?? "/", "http://localhost").pathname,
    )
    if (requestPath !== endpointPath) {
      writeJson(response, 404, {
        error: "not_found",
        message: `The MCP endpoint is served at ${endpointPath}.`,
      })
      return
    }
    for (const guard of guards) {
      if (!guard(request, response)) {
        return
      }
    }
    // `IncomingMessage.method` is typed `string | undefined`; the adapter's
    // duck type declares it optional, which exactOptionalPropertyTypes
    // distinguishes. The runtime shape is identical.
    nodeHandler(request as NodeIncomingMessageLike, response).catch((error: unknown) => {
      onerror(toError(error))
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error", message: "MCP request failed." })
      } else {
        response.end()
      }
    })
  })

  await listen(httpServer, options.host, options.port)
  const address = httpServer.address()
  if (address === null || typeof address === "string") {
    await closeServer(httpServer)
    throw new Error("HTTP server did not bind to a TCP address.")
  }

  let closed = false
  return {
    url: `http://${formatHost(options.host)}:${address.port}${endpointPath}`,
    host: options.host,
    port: address.port,
    path: endpointPath,
    handler,
    close: async () => {
      if (closed) {
        return
      }
      closed = true
      try {
        await handler.close()
      } finally {
        httpServer.closeAllConnections()
        await closeServer(httpServer)
      }
    },
  }
}

function selectGuards(options: HttpServeOptions): readonly RequestGuard[] {
  const guards: RequestGuard[] = []
  const loopback = isLoopbackHost(options.host)
  const allowedHosts = options.allowedHosts ?? []
  if (allowedHosts.length > 0) {
    guards.push(hostHeaderValidation([...(loopback ? LOOPBACK_HOSTS : []), ...allowedHosts]))
  } else if (loopback) {
    guards.push(localhostHostValidation())
  }
  const allowedOrigins = options.allowedOrigins ?? []
  if (allowedOrigins.length > 0) {
    guards.push(originValidation([...allowedOrigins]))
  } else if (loopback) {
    guards.push(localhostOriginValidation())
  }
  return guards
}

function formatHost(host: string): string {
  if (host === "::" || host === "0.0.0.0") {
    return "localhost"
  }
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function listen(server: NodeHttpServer, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
}

async function closeServer(server: NodeHttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}
