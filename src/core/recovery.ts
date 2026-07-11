import type {
  RecommendRecoveryInput,
  RecoveryRecommendation,
  StructuredError,
} from "./structured-error-model.js"

export function recommendRecovery(
  error: StructuredError,
  context?: Pick<RecommendRecoveryInput, "available_alternative_tools">,
): RecoveryRecommendation {
  return {
    next_steps: error.error.agent_next_steps,
    safe_to_retry: error.error.retry.safe,
    requires_user_input: error.error.user_action_required,
    stop_condition: stopConditionFor(error),
    suggested_alternative_tools: suggestedReadTools(error, context?.available_alternative_tools),
  }
}

function suggestedReadTools(
  error: StructuredError,
  availableTools: readonly string[] | undefined,
): readonly string[] {
  if (
    error.error.code !== "SIDE_EFFECT_UNKNOWN" &&
    error.error.code !== "POSSIBLE_DUPLICATE_SIDE_EFFECT"
  ) {
    return []
  }
  const readToolPattern =
    /(?:^|[_-])(get|list|search|find|read|status|inspect|check|verify|lookup|fetch)(?:[_-]|$)/iu
  return (availableTools ?? []).filter((toolName) => readToolPattern.test(toolName)).slice(0, 3)
}

function stopConditionFor(error: StructuredError): string {
  switch (error.error.code) {
    case "RATE_LIMITED":
    case "UPSTREAM_503":
    case "UPSTREAM_504":
    case "NETWORK_TIMEOUT":
      return `Stop after ${error.error.retry.max_attempts} failed retry attempts.`
    case "AUTH_MISSING":
    case "AUTH_EXPIRED":
    case "AUTH_INSUFFICIENT_SCOPE":
      return "Stop until the user refreshes credentials or grants access."
    case "SIDE_EFFECT_UNKNOWN":
    case "POSSIBLE_DUPLICATE_SIDE_EFFECT":
      return "Stop until current state is checked with a read-only tool."
    case "SCHEMA_CONTRACT_VIOLATION":
    case "MISSING_REQUIRED_FIELD":
    case "INVALID_FIELD_TYPE":
    case "INVALID_ENUM_VALUE":
      return "Stop retrying unchanged input; correct the arguments first."
    case "RESOURCE_NOT_FOUND":
      return "Stop retrying the same target until a search or list confirms it exists."
    default:
      return "Stop after one failed recovery attempt and summarize the failure."
  }
}
