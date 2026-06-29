const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|authorization|credential)/iu
const AUTHORIZATION_HEADER_PATTERN =
  /(["']?\bauthorization\b["']?)(\s*[:=]\s*)(?:"[^"\r\n]{1,512}"|'[^'\r\n]{1,512}'|`[^`\r\n]{1,512}`|(?:Basic|Bearer|Digest|OAuth|Token|ApiKey)\s+[^\s"'`,;]{4,}|[^\s"'`,;]{4,})/giu
const AUTH_SCHEME_CREDENTIAL_PATTERN =
  /\b(Basic|Bearer|Digest|OAuth|Token|ApiKey)\s+(?:"[^"\r\n]{1,512}"|'[^'\r\n]{1,512}'|`[^`\r\n]{1,512}`|[^\s"'`,;]{4,})/giu
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gu
const ASSIGNMENT_SECRET_PATTERN =
  /(["']?\b(?:api[_-]?key|token|secret|password|credential)\b["']?)(\s*[:=]\s*)(?:"[^"\r\n]{1,512}"|'[^'\r\n]{1,512}'|`[^`\r\n]{1,512}`|[^\s"'`,;]{4,})/giu
const PROVIDER_TOKEN_PATTERN = /\b(?:sk|ghp|github_pat|xoxb|xoxp|anthropic)-[A-Za-z0-9_-]{12,}\b/gu
const HIGH_ENTROPY_PATTERN = /\b[A-Za-z0-9_/-]{36,}\b/gu

export function redactText(value: string): string {
  return value
    .replace(AUTHORIZATION_HEADER_PATTERN, "$1$2[REDACTED]")
    .replace(AUTH_SCHEME_CREDENTIAL_PATTERN, "$1 [REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_SECRET_PATTERN, "$1$2[REDACTED]")
    .replace(PROVIDER_TOKEN_PATTERN, "[REDACTED]")
    .replace(HIGH_ENTROPY_PATTERN, "[REDACTED]")
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value)
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item))
  }

  if (typeof value === "object" && value !== null) {
    const redacted: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactUnknown(item)
    }
    return redacted
  }

  return null
}
