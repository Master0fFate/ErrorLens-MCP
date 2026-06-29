import {
  authMissing,
  destructiveBlocked,
  dnsFailure,
  networkTimeout,
  permissionDenied,
  rateLimited,
  resourceNotFound,
  serverUnreachable,
  sideEffectUnknown,
  stateConflict,
  unknownFailure,
  upstream,
  validationFailure,
} from "./builtin-classifications.js"
import type { ClassificationSpec, MessageFacts } from "./classification-spec.js"
import type { ClassifyErrorInput } from "./structured-error-model.js"

export function classifyByHeuristics(
  input: ClassifyErrorInput,
  facts: MessageFacts,
): ClassificationSpec {
  if (input.timed_out && input.tool_side_effect_type !== "read") {
    return sideEffectUnknown()
  }
  if (input.timed_out) {
    return networkTimeout(true)
  }
  if (facts.status === 429 || includesAny(facts.lowered, ["rate limit", "too many requests"])) {
    return rateLimited()
  }
  if (facts.status === 401 || includesAny(facts.lowered, ["unauthorized", "missing token"])) {
    return authMissing()
  }
  if (
    facts.status === 403 ||
    includesAny(facts.lowered, ["forbidden", "insufficient scope", "permission denied"])
  ) {
    return permissionDenied()
  }
  if (facts.status === 404 || includesAny(facts.lowered, ["not found", "does not exist"])) {
    return resourceNotFound()
  }
  if (facts.status === 409 || includesAny(facts.lowered, ["conflict", "stale version"])) {
    return stateConflict()
  }
  if (
    facts.status === 400 ||
    facts.status === 422 ||
    includesAny(facts.lowered, ["invalid", "required", "schema", "type mismatch"])
  ) {
    return validationFailure()
  }
  if (isRetryableUpstreamStatus(facts.status) && input.tool_side_effect_type !== "read") {
    return sideEffectUnknown("upstream_api")
  }
  if (facts.status === 500) {
    return upstream("UPSTREAM_500", 500)
  }
  if (facts.status === 502) {
    return upstream("UPSTREAM_502", 502)
  }
  if (facts.status === 503) {
    return upstream("UPSTREAM_503", 503)
  }
  if (facts.status === 504) {
    return upstream("UPSTREAM_504", 504)
  }
  if (includesAny(facts.lowered, ["econnrefused", "server unreachable", "connection refused"])) {
    return serverUnreachable()
  }
  if (includesAny(facts.lowered, ["enotfound", "dns"])) {
    return dnsFailure()
  }
  if (includesAny(facts.lowered, ["timeout", "timed out", "etimedout"])) {
    return input.tool_side_effect_type === "read" ? networkTimeout(true) : sideEffectUnknown()
  }
  if (includesAny(facts.lowered, ["destructive", "blocked by policy", "delete blocked"])) {
    return destructiveBlocked()
  }
  return unknownFailure()
}

function isRetryableUpstreamStatus(status: number | null | undefined): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504
}

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}
