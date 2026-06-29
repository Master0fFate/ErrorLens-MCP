export const ERROR_LAYERS = [
  "transport",
  "protocol",
  "tool",
  "upstream_api",
  "auth",
  "rate_limit",
  "validation",
  "state",
  "permission",
  "filesystem",
  "network",
  "timeout",
  "unsafe_operation",
  "unknown",
] as const

export type ErrorLayer = (typeof ERROR_LAYERS)[number]

export const ERROR_CATEGORIES = [
  "transport",
  "protocol",
  "tool",
  "upstream_api",
  "auth",
  "rate_limit",
  "validation",
  "state",
  "permission",
  "filesystem",
  "network",
  "timeout",
  "unsafe_operation",
  "unknown",
] as const

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

export const ERROR_CODES = [
  "MCP_SERVER_UNREACHABLE",
  "MCP_SERVER_CRASHED",
  "TRANSPORT_CLOSED",
  "JSON_RPC_PARSE_ERROR",
  "PROTOCOL_VERSION_MISMATCH",
  "TOOL_NOT_FOUND",
  "TOOL_SCHEMA_INVALID",
  "AUTH_MISSING",
  "AUTH_EXPIRED",
  "AUTH_INSUFFICIENT_SCOPE",
  "PERMISSION_DENIED",
  "CONSENT_REQUIRED",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "CONCURRENCY_LIMITED",
  "MISSING_REQUIRED_FIELD",
  "INVALID_FIELD_TYPE",
  "INVALID_ENUM_VALUE",
  "INPUT_TOO_LARGE",
  "AMBIGUOUS_INPUT",
  "SCHEMA_CONTRACT_VIOLATION",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_ALREADY_EXISTS",
  "STATE_CONFLICT",
  "STALE_VERSION",
  "PRECONDITION_FAILED",
  "PARTIAL_SUCCESS",
  "SIDE_EFFECT_UNKNOWN",
  "UPSTREAM_500",
  "UPSTREAM_502",
  "UPSTREAM_503",
  "UPSTREAM_504",
  "NETWORK_TIMEOUT",
  "DNS_FAILURE",
  "TLS_FAILURE",
  "DESTRUCTIVE_ACTION_BLOCKED",
  "NON_IDEMPOTENT_RETRY_UNSAFE",
  "POSSIBLE_DUPLICATE_SIDE_EFFECT",
  "UNKNOWN_FAILURE",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const PERMANENCE_VALUES = ["transient", "permanent", "unknown"] as const
export type Permanence = (typeof PERMANENCE_VALUES)[number]

export const RETRY_BACKOFFS = ["none", "fixed", "exponential", "respect_retry_after"] as const
export type RetryBackoff = (typeof RETRY_BACKOFFS)[number]

export const STATE_IMPACTS = [
  "none",
  "read_only",
  "unknown",
  "possibly_applied",
  "applied",
] as const
export type StateImpact = (typeof STATE_IMPACTS)[number]

export const SIDE_EFFECT_TYPES = ["read", "write", "destructive", "unknown"] as const
export type SideEffectType = (typeof SIDE_EFFECT_TYPES)[number]
