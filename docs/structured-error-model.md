# Structured Error Model

ErrorLens returns compact JSON that is safe to put back into an agent context.

```json
{
  "ok": false,
  "trace_id": "err_...",
  "error": {
    "code": "RATE_LIMITED",
    "layer": "rate_limit",
    "category": "rate_limit",
    "permanence": "transient",
    "retry": {
      "safe": true,
      "after_ms": 30000,
      "max_attempts": 2,
      "backoff": "respect_retry_after",
      "requires_idempotency_key": false,
      "same_arguments_required": true
    },
    "state_impact": "none",
    "user_action_required": false,
    "confidence": 0.92,
    "agent_next_steps": ["Wait before retrying with the same arguments."],
    "do_not": ["Do not retry in a tight loop."],
    "evidence": {
      "status": 429,
      "matched_text": "too many requests",
      "upstream_server": "github",
      "tool": "search_docs",
      "duration_ms": 120,
      "exception_name": null
    }
  }
}
```

Tool execution failures are surfaced as MCP tool results with `isError: true`.
ErrorLens also places the same object in `structuredContent` so MCP clients can
consume the diagnosis without reparsing display text. Protocol-level issues,
such as unknown tools, remain JSON-RPC protocol errors.
