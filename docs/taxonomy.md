# Error Taxonomy

ErrorLens starts with practical recovery categories:

- `RATE_LIMITED`
- `AUTH_MISSING`
- `AUTH_EXPIRED`
- `PERMISSION_DENIED`
- `MISSING_REQUIRED_FIELD`
- `SCHEMA_CONTRACT_VIOLATION`
- `RESOURCE_NOT_FOUND`
- `STATE_CONFLICT`
- `SIDE_EFFECT_UNKNOWN`
- `NETWORK_TIMEOUT`
- `MCP_SERVER_UNREACHABLE`
- `DESTRUCTIVE_ACTION_BLOCKED`
- `UNKNOWN_FAILURE`

The classifier is deterministic. Adapter rules can override built-in heuristics
for a known server without requiring an LLM.
