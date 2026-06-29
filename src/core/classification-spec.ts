import type { RetryPolicy } from "./structured-error-model.js"
import type {
  ErrorCategory,
  ErrorCode,
  ErrorLayer,
  Permanence,
  RetryBackoff,
  StateImpact,
} from "./taxonomy.js"

export type ClassificationSpec = {
  readonly code: ErrorCode
  readonly layer: ErrorLayer
  readonly category: ErrorCategory
  readonly permanence: Permanence
  readonly retry: RetryPolicy
  readonly stateImpact: StateImpact
  readonly userActionRequired: boolean
  readonly confidence: number
  readonly nextSteps: readonly string[]
  readonly doNot: readonly string[]
}

export type MessageFacts = {
  readonly message: string
  readonly lowered: string
  readonly status: number | null
  readonly exceptionName: string | null
}

export function retryPolicy(
  safe: boolean,
  afterMs: number | null,
  maxAttempts: number,
  backoff: RetryBackoff,
  requiresIdempotencyKey: boolean,
): RetryPolicy {
  return {
    safe,
    after_ms: afterMs,
    max_attempts: maxAttempts,
    backoff,
    requires_idempotency_key: requiresIdempotencyKey,
    same_arguments_required: true,
  }
}
