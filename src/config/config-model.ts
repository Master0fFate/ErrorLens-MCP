import { z } from "zod"

const ServerConfigSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).default({}),
    adapter_rules: z.array(z.string()).default([]),
  }),
  z.object({
    transport: z.literal("streamable_http"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    adapter_rules: z.array(z.string()).default([]),
  }),
])

export const ErrorLensConfigSchema = z.object({
  version: z.literal(1),
  trace: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default(".errorlens/traces.jsonl"),
      redact_secrets: z.boolean().default(true),
    })
    .default({
      enabled: true,
      path: ".errorlens/traces.jsonl",
      redact_secrets: true,
    }),
  proxy: z
    .object({
      expose_tool_prefix: z.boolean().default(true),
      default_timeout_ms: z.number().int().positive().default(60_000),
      max_result_chars: z.number().int().positive().default(12_000),
    })
    .default({
      expose_tool_prefix: true,
      default_timeout_ms: 60_000,
      max_result_chars: 12_000,
    }),
  servers: z.record(z.string(), ServerConfigSchema).default({}),
  rules: z
    .object({
      load_builtin: z.boolean().default(true),
      custom_paths: z.array(z.string()).default([]),
    })
    .default({
      load_builtin: true,
      custom_paths: [],
    }),
  redaction: z
    .object({
      enabled: z.boolean().default(true),
      patterns: z
        .array(
          z.object({
            name: z.string().min(1),
            regex: z.string().min(1),
          }),
        )
        .default([]),
    })
    .default({
      enabled: true,
      patterns: [],
    }),
})

export type ErrorLensConfig = z.infer<typeof ErrorLensConfigSchema>
export type ServerConfig = ErrorLensConfig["servers"][string]
export type StdioServerConfig = Extract<ServerConfig, { readonly transport: "stdio" }>
export type StreamableHttpServerConfig = Extract<
  ServerConfig,
  { readonly transport: "streamable_http" }
>

export function defaultConfig(tracePath = ".errorlens/traces.jsonl"): ErrorLensConfig {
  return {
    version: 1,
    trace: {
      enabled: true,
      path: tracePath,
      redact_secrets: true,
    },
    proxy: {
      expose_tool_prefix: true,
      default_timeout_ms: 60_000,
      max_result_chars: 12_000,
    },
    servers: {},
    rules: {
      load_builtin: true,
      custom_paths: [],
    },
    redaction: {
      enabled: true,
      patterns: [],
    },
  }
}
