export const SERVE_TRANSPORTS = ["stdio", "http"] as const
export type ServeTransport = (typeof SERVE_TRANSPORTS)[number]

export const DEFAULT_HTTP_HOST = "127.0.0.1"
export const DEFAULT_HTTP_PORT = 3939
export const DEFAULT_HTTP_PATH = "/mcp"

export type ServeOptions = {
  readonly transport: ServeTransport
  readonly host: string
  readonly port: number
  readonly path: string
  readonly allowedHosts: readonly string[]
  readonly allowedOrigins: readonly string[]
}

export const DEFAULT_SERVE_OPTIONS: ServeOptions = {
  transport: "stdio",
  host: DEFAULT_HTTP_HOST,
  port: DEFAULT_HTTP_PORT,
  path: DEFAULT_HTTP_PATH,
  allowedHosts: [],
  allowedOrigins: [],
}

export type RawServeOptions = {
  readonly transport?: string | undefined
  readonly host?: string | undefined
  readonly port?: string | number | undefined
  readonly path?: string | undefined
  readonly allowedHost?: readonly string[] | undefined
  readonly allowedOrigin?: readonly string[] | undefined
}

export function resolveServeOptions(raw: RawServeOptions = {}): ServeOptions {
  const transport = raw.transport ?? DEFAULT_SERVE_OPTIONS.transport
  if (!isServeTransport(transport)) {
    throw new Error(
      `Unsupported transport "${transport}". Use one of: ${SERVE_TRANSPORTS.join(", ")}.`,
    )
  }
  const host = (raw.host ?? DEFAULT_HTTP_HOST).trim()
  if (host.length === 0) {
    throw new Error("--host must not be empty.")
  }
  return {
    transport,
    host,
    port: parsePort(raw.port),
    path: normalizeEndpointPath(raw.path ?? DEFAULT_HTTP_PATH),
    allowedHosts: cleanList(raw.allowedHost),
    allowedOrigins: cleanList(raw.allowedOrigin),
  }
}

export function isServeTransport(value: string): value is ServeTransport {
  return (SERVE_TRANSPORTS as readonly string[]).includes(value)
}

export function normalizeEndpointPath(path: string): string {
  const trimmed = path.trim()
  if (trimmed.length === 0 || trimmed === "/") {
    return "/"
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/u, "")
}

function parsePort(value: string | number | undefined): number {
  if (value === undefined) {
    return DEFAULT_HTTP_PORT
  }
  const port = typeof value === "number" ? value : Number(value.trim())
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`--port must be an integer between 0 and 65535, got "${value}".`)
  }
  return port
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)
}
