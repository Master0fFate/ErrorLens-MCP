# Adapter Rules

Adapter rules are YAML files that map server-specific messages to ErrorLens
classifications.

```yaml
server: github
rules:
  - name: github-rate-limit
    match:
      status: 403
      message_regex: "rate limit|secondary rate limit|abuse detection"
    classify:
      code: RATE_LIMITED
      layer: rate_limit
      category: rate_limit
      permanence: transient
      retry:
        safe: true
        after_ms: 60000
        max_attempts: 1
        backoff: fixed
        requires_idempotency_key: false
        same_arguments_required: true
      state_impact: none
      user_action_required: false
      confidence: 0.95
      agent_next_steps:
        - Wait before retrying.
      do_not:
        - Do not retry rapidly.
```

Run:

```sh
node dist/cli/index.js rules test --file ./rules/github.yaml
```

Load rules into proxy classification with paths relative to the ErrorLens config:

```yaml
version: 1
rules:
  custom_paths: []

servers:
  github:
    transport: streamable_http
    url: https://example.com/mcp
    headers:
      Authorization: ${GITHUB_AUTH_HEADER}
    adapter_rules:
      - rules/github.yaml
```

Global `rules.custom_paths` and each server's `adapter_rules` are loaded before
the proxy connects. A missing or invalid rule file fails startup instead of
silently leaving the proxy on generic heuristics.
