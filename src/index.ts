/**
 * Programmatic entry point for ErrorLens.
 *
 * The CLI (`errorlens`), companion server (`errorlens-companion`) and proxy
 * (`errorlens-proxy`) are thin wrappers over these exports.
 */
export {
  buildDiagnosticServer,
  COMPANION_INSTRUCTIONS,
  COMPANION_SERVER_NAME,
  type DiagnosticServerOptions,
  startDiagnosticServer,
} from "./companion/diagnostic-server.js"
export {
  defaultConfig,
  type ErrorLensConfig,
  ErrorLensConfigSchema,
  type ServerConfig,
  type StdioServerConfig,
  type StreamableHttpServerConfig,
} from "./config/config-model.js"
export { loadConfig, writeDefaultConfig } from "./config/load-config.js"
export { type AdapterRule, parseAdapterRules } from "./core/adapters.js"
export { classifyError } from "./core/classifier.js"
export { recommendRecovery } from "./core/recovery.js"
export { redactText, redactUnknown } from "./core/redaction.js"
export {
  type ClassifyErrorInput,
  ClassifyErrorInputSchema,
  type ErrorDetails,
  ErrorDetailsSchema,
  type RecoveryRecommendation,
  type RetryPolicy,
  type StructuredError,
  StructuredErrorSchema,
} from "./core/structured-error-model.js"
export { inferSideEffect } from "./proxy/call-handler.js"
export {
  type ProxyRegistry,
  type ProxyRuntime,
  ProxyToolRegistry,
  type ToolMapping,
} from "./proxy/proxy-model.js"
export {
  buildProxyRegistry,
  buildProxyRegistryFromConfig,
  createProxyMcpServer,
  PROXY_INSTRUCTIONS,
  PROXY_SERVER_NAME,
  startProxyServer,
} from "./proxy/proxy-server.js"
export { successTrace, type ToolFailureContext, wrapFailure } from "./proxy/result-wrapper.js"
export {
  closeUpstreamConnections,
  connectUpstream,
  connectUpstreamTransport,
  type UpstreamConnection,
  type UpstreamHooks,
} from "./proxy/upstream-client.js"
export {
  type HttpServeOptions,
  type RunningHttpServer,
  serveHttp,
} from "./shared/http-server.js"
export { implementationInfo, type PackageInfo, packageInfo } from "./shared/package-info.js"
export {
  DEFAULT_SERVE_OPTIONS,
  resolveServeOptions,
  type ServeOptions,
  type ServeTransport,
} from "./shared/serve-options.js"
export { firstText, jsonToolResult, parseToolResult } from "./shared/tool-result.js"
export { JsonlTraceStore } from "./trace/jsonl-store.js"
export { formatTraceReplay } from "./trace/replay.js"
export { type FailureReport, summarizeFailures } from "./trace/report.js"
export { type TraceRecord, TraceRecordSchema } from "./trace/trace-model.js"
