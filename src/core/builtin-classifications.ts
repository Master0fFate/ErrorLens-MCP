import { type ClassificationSpec, retryPolicy } from "./classification-spec.js"
import type { ErrorCode, ErrorLayer } from "./taxonomy.js"

type NoRetrySpecInput = Omit<ClassificationSpec, "retry"> & {
  readonly requiresIdempotencyKey?: boolean
}

type FixedRetrySpecInput = Omit<ClassificationSpec, "retry">

function noRetrySpec(input: NoRetrySpecInput): ClassificationSpec {
  return {
    ...input,
    retry: retryPolicy(false, null, 0, "none", input.requiresIdempotencyKey ?? false),
  }
}

function fixedRetrySpec(input: FixedRetrySpecInput): ClassificationSpec {
  return {
    ...input,
    retry: retryPolicy(true, 1_000, 1, "fixed", false),
  }
}

export function rateLimited(): ClassificationSpec {
  return {
    code: "RATE_LIMITED",
    layer: "rate_limit",
    category: "rate_limit",
    permanence: "transient",
    retry: retryPolicy(true, 30_000, 2, "respect_retry_after", false),
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.94,
    nextSteps: [
      "Wait at least 30 seconds before retrying.",
      "Retry once with the same arguments.",
      "If the retry fails, tell the user the upstream service is rate-limiting requests.",
    ],
    doNot: ["Do not retry in a tight loop.", "Do not switch to a destructive workaround."],
  }
}

export function sideEffectUnknown(layer: ErrorLayer = "timeout"): ClassificationSpec {
  return noRetrySpec({
    code: "SIDE_EFFECT_UNKNOWN",
    layer,
    category: "state",
    permanence: "unknown",
    requiresIdempotencyKey: true,
    stateImpact: "possibly_applied",
    userActionRequired: false,
    confidence: 0.97,
    nextSteps: [
      "Query current state with a read-only tool before retrying.",
      "Retry only if the state check proves the write did not happen.",
    ],
    doNot: [
      "Do not blindly retry the write.",
      "Do not change semantic arguments to force success.",
    ],
  })
}

export function networkTimeout(readOnly: boolean): ClassificationSpec {
  return {
    code: "NETWORK_TIMEOUT",
    layer: "timeout",
    category: "timeout",
    permanence: "transient",
    retry: retryPolicy(readOnly, 1_000, readOnly ? 2 : 0, "exponential", false),
    stateImpact: readOnly ? "read_only" : "unknown",
    userActionRequired: false,
    confidence: 0.84,
    nextSteps: readOnly
      ? ["Retry the read with the same arguments.", "If it fails again, report the timeout."]
      : ["Check current state before retrying."],
    doNot: readOnly ? ["Do not change query semantics for the retry."] : ["Do not blindly retry."],
  }
}

export function authMissing(): ClassificationSpec {
  return noRetrySpec({
    code: "AUTH_MISSING",
    layer: "auth",
    category: "auth",
    permanence: "permanent",
    stateImpact: "none",
    userActionRequired: true,
    confidence: 0.92,
    nextSteps: ["Ask the user to refresh or provide credentials before retrying."],
    doNot: ["Do not retry unchanged credentials.", "Do not print tokens or environment values."],
  })
}

export function permissionDenied(): ClassificationSpec {
  return noRetrySpec({
    code: "PERMISSION_DENIED",
    layer: "permission",
    category: "permission",
    permanence: "permanent",
    stateImpact: "none",
    userActionRequired: true,
    confidence: 0.9,
    nextSteps: ["Ask for permission or a narrower authorized operation."],
    doNot: ["Do not bypass the permission boundary."],
  })
}

export function validationFailure(): ClassificationSpec {
  return noRetrySpec({
    code: "SCHEMA_CONTRACT_VIOLATION",
    layer: "validation",
    category: "validation",
    permanence: "permanent",
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.88,
    nextSteps: ["Correct the tool arguments before retrying."],
    doNot: ["Do not retry the same invalid arguments."],
  })
}

export function resourceNotFound(): ClassificationSpec {
  return noRetrySpec({
    code: "RESOURCE_NOT_FOUND",
    layer: "state",
    category: "state",
    permanence: "permanent",
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.88,
    nextSteps: ["Search or list resources before retrying the target operation."],
    doNot: ["Do not repeat the same missing-resource call."],
  })
}

export function stateConflict(): ClassificationSpec {
  return noRetrySpec({
    code: "STATE_CONFLICT",
    layer: "state",
    category: "state",
    permanence: "transient",
    stateImpact: "unknown",
    userActionRequired: false,
    confidence: 0.86,
    nextSteps: ["Refresh the resource state or version before retrying."],
    doNot: ["Do not overwrite state without checking the latest version."],
  })
}

export function upstream(code: ErrorCode, status: number): ClassificationSpec {
  return {
    code,
    layer: "upstream_api",
    category: "upstream_api",
    permanence: "transient",
    retry: retryPolicy(true, status === 503 ? 2_000 : 1_000, 2, "exponential", false),
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.82,
    nextSteps: ["Retry after a short backoff with the same arguments."],
    doNot: ["Do not retry in a tight loop."],
  }
}

export function serverUnreachable(): ClassificationSpec {
  return fixedRetrySpec({
    code: "MCP_SERVER_UNREACHABLE",
    layer: "transport",
    category: "transport",
    permanence: "transient",
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.9,
    nextSteps: ["Check whether the upstream MCP server is running, then retry once."],
    doNot: ["Do not assume the tool operation executed."],
  })
}

export function dnsFailure(): ClassificationSpec {
  return fixedRetrySpec({
    code: "DNS_FAILURE",
    layer: "network",
    category: "network",
    permanence: "transient",
    stateImpact: "none",
    userActionRequired: false,
    confidence: 0.9,
    nextSteps: ["Retry once after checking network availability."],
    doNot: ["Do not switch to a destructive alternative."],
  })
}

export function destructiveBlocked(): ClassificationSpec {
  return noRetrySpec({
    code: "DESTRUCTIVE_ACTION_BLOCKED",
    layer: "unsafe_operation",
    category: "unsafe_operation",
    permanence: "permanent",
    stateImpact: "none",
    userActionRequired: true,
    confidence: 0.93,
    nextSteps: ["Ask the user for explicit consent or choose a non-destructive path."],
    doNot: ["Do not bypass the policy block."],
  })
}

export function unknownFailure(): ClassificationSpec {
  return noRetrySpec({
    code: "UNKNOWN_FAILURE",
    layer: "unknown",
    category: "unknown",
    permanence: "unknown",
    stateImpact: "unknown",
    userActionRequired: false,
    confidence: 0.35,
    nextSteps: ["Summarize the failure and ask for more diagnostic detail."],
    doNot: ["Do not guess a destructive workaround."],
  })
}
