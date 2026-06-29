# MCP ErrorLens — Structured Error Semantics Layer for LLM Tool Recovery

**Research grounding date:** 2026-06-25  
**Recommended build type:** Lightweight MCP proxy + companion MCP server + CLI  
**Primary stack:** TypeScript / Node.js  
**Do not build:** another memory server, another generic connector, another eval-only framework, another security-only sandbox

---

## 1. Executive Decision

Build **MCP ErrorLens**: a local-first reliability layer that sits between an AI client and existing MCP servers, intercepts tool failures, classifies them into machine-readable structured errors, and returns concise recovery guidance that an LLM agent can actually use.

The project is attractive because the MCP ecosystem is already overloaded with connector servers, memory servers, fact-checking servers, eval harnesses, security scanners, and generic tool routers. The weaker and less-saturated pressure point is **runtime recovery from ambiguous, unstructured, inconsistent MCP failures**.

The product promise:

> **Make MCP failures recoverable. Stop agents from flailing after `Operation failed`.**

ErrorLens should be useful to developers immediately because it improves the behavior of MCP servers they already use instead of asking them to replace those servers.

---

## 2. Why This Is the Right Pressure Point

### 2.1 The MCP ecosystem is crowded in the obvious places

Current MCP directories and registries show broad coverage across categories such as RAG, browser automation, web scraping, cloud platforms, developer tools, CI/CD, file systems, knowledge/memory, security, code execution, testing, API testing, documentation access, and many more. There are also reports of thousands to tens of thousands of MCP servers across registries and marketplaces.

That means a new project should avoid being a simple connector. The next useful thing should solve a cross-cutting problem that affects all those connectors.

### 2.2 Memory is explicitly not the opportunity

Memory/context MCPs already exist in many forms: persistent memory, task state, decision ledgers, context packs, claims ledgers, checkpoints, and session continuity. The user specifically rejected memory, and the market already supports that rejection.

### 2.3 Eval, conformance, and inspector tools are adjacent but not enough

The ecosystem already contains:

- Official conformance testing for protocol compliance.
- Official inspector tools for debugging MCP servers during development.
- Evaluation frameworks that test whether agents can use MCP tools.
- Scenario-based MCP checkers and MCP benchmarks.

These are useful, but they mostly answer:

> “Does this server/client/agent work under a test scenario?”

ErrorLens should answer a different runtime question:

> “The agent is failing right now. What exactly failed, is it safe to retry, what should the agent do next, and what should it avoid doing?”

### 2.4 Security wrappers are adjacent but not the main gap

Security is already a highly active MCP area: runtime guards, policy enforcers, tool poisoning scanners, admission controls, and authority-control research exist. ErrorLens should not try to become another broad security gate.

Instead, it should focus on **recoverability and operational clarity**. It may include safety-sensitive retry rules, but its core identity is reliability, not sandboxing.

### 2.5 Fact-checking/provenance is adjacent but already represented

There are claim verifiers, citation checkers, source verifiers, and provenance-aware factuality tools. ErrorLens should not compete there.

Its focus is lower-level and more general: tool failure semantics, retries, state ambiguity, idempotency, validation errors, auth failures, rate limits, and recovery planning.

---

## 3. The Core Problem

LLM agents increasingly fail not because they lack tools, but because they cannot reliably recover from bad tool outcomes.

Common MCP failure patterns:

- A tool returns `Operation failed` with no useful details.
- A server throws an opaque JSON-RPC error.
- A tool times out after a possibly side-effecting operation.
- The agent retries something that should not be retried.
- The agent gives up on something that should be retried.
- The agent switches to a dangerous workaround.
- The agent misreads auth, rate-limit, validation, and transient infrastructure errors as the same kind of failure.
- The agent cannot tell whether a failed write partially succeeded.
- The agent has no stable trace ID or compact explanation to pass into later reasoning.

This worsens with long-horizon tasks because one ambiguous tool failure can poison the entire plan.

---

## 4. Product Concept

### Name

**MCP ErrorLens**

Alternative names:

- **Faultline MCP**
- **SERF-MCP** — Structured Error Recovery Framework for MCP
- **MCP RecoveryKit**
- **MCP Doctor Proxy**

Recommended public name: **MCP ErrorLens**. It is clear, memorable, and GitHub-friendly.

### One-liner

> A local MCP proxy that turns vague tool failures into structured, recoverable errors for LLM agents.

### GitHub tagline

> Stop MCP agents from spiraling after vague tool errors.

### README opening

Most MCP servers tell agents that something failed. Very few tell agents what kind of failure it was, whether retrying is safe, whether a side effect may have happened, or what to do next. ErrorLens adds that missing layer without requiring every MCP server to rewrite its error handling.

---

## 5. Target User

Primary users:

- Developers building MCP servers.
- Developers using Claude Desktop, Cursor, VS Code/Copilot-style agents, or custom MCP clients.
- Agent builders who need better recovery in long-running workflows.
- Teams that want better MCP traces without adopting a heavyweight observability stack.

Secondary users:

- Open-source MCP maintainers who want to improve their server’s error semantics.
- People debugging unreliable local tool use.
- Teams evaluating third-party MCP servers before trusting them.

---

## 6. What ErrorLens Is and Is Not

### It is

- A local-first MCP reliability proxy.
- A structured error normalizer.
- A retry/idempotency advisor.
- A compact trace recorder.
- A companion MCP server that exposes diagnostic tools.
- A developer CLI for replaying and explaining failed tool calls.

### It is not

- Not a memory MCP.
- Not another SaaS wrapper.
- Not an eval-only framework.
- Not a broad security sandbox.
- Not a fact-checker.
- Not a model fine-tune.
- Not a replacement for official MCP conformance tests.
- Not a replacement for each server’s native error handling.

---

## 7. MVP Feature Set

The MVP should be small but impressive. It should solve one thing beautifully.

### 7.1 Proxy Mode

ErrorLens runs as an MCP server that forwards calls to one or more upstream MCP servers.

Flow:

1. AI client connects to ErrorLens.
2. ErrorLens exposes selected upstream tools.
3. AI calls an upstream tool through ErrorLens.
4. ErrorLens forwards the request.
5. ErrorLens intercepts the response or error.
6. If successful, it returns the result with minimal modification.
7. If failed, it returns a structured error package with recovery guidance.
8. ErrorLens records a compact local trace.

### 7.2 Companion Mode

ErrorLens can also run as a normal MCP server with diagnostic tools:

- `classify_error`
- `explain_failure`
- `recommend_recovery`
- `replay_trace`
- `summarize_failures`
- `generate_adapter_rule`

This lets users paste or feed failed traces into the agent and receive structured advice, even before full proxy mode is mature.

### 7.3 CLI

Suggested commands:

```text
errorlens init
errorlens add-server
errorlens proxy
errorlens doctor
errorlens traces
errorlens replay <trace-id>
errorlens report
errorlens rules test
```

The CLI should be simple enough for a README demo.

### 7.4 Local Trace Store

Store traces locally as JSONL or SQLite.

MVP recommendation: **JSONL first**, SQLite later.

Trace contents:

- Trace ID
- Timestamp
- Client name if available
- Upstream server name
- Tool name
- Redacted arguments
- Duration
- Raw error summary
- Structured classification
- Recovery recommendation
- Whether retry would be safe

Default posture:

- Local only.
- No telemetry.
- Redact secrets by default.
- Allow users to disable trace persistence.

---

## 8. Structured Error Model

The heart of the project is a simple structured error envelope.

The model should be compact enough for LLM context but precise enough to guide behavior.

Conceptual shape:

```json
{
  "ok": false,
  "trace_id": "err_01J...",
  "error": {
    "code": "RATE_LIMITED",
    "layer": "upstream",
    "category": "rate_limit",
    "permanence": "transient",
    "retry": {
      "safe": true,
      "after_ms": 30000,
      "max_attempts": 2,
      "requires_idempotency_key": false
    },
    "state_impact": "none",
    "user_action_required": false,
    "agent_next_steps": [
      "Wait at least 30 seconds before retrying.",
      "Retry the same request without changing semantic parameters.",
      "If the second retry fails, summarize the rate-limit issue to the user."
    ],
    "do_not": [
      "Do not retry in a tight loop.",
      "Do not switch to a destructive alternative tool."
    ],
    "evidence": {
      "status": 429,
      "matched_text": "too many requests",
      "upstream_server": "example-server",
      "tool": "search_docs"
    }
  }
}
```

The exact wire representation must respect MCP conventions. For tool-level failures, prefer returning a normal tool result with error content and an `isError`-style indication when supported. For protocol-level failures, preserve proper JSON-RPC error behavior. The goal is to improve semantics without breaking clients.

---

## 9. Error Taxonomy

Start with a practical taxonomy, not an academic one.

### Top-level layers

- `transport`
- `protocol`
- `tool`
- `upstream_api`
- `auth`
- `rate_limit`
- `validation`
- `state`
- `permission`
- `filesystem`
- `network`
- `timeout`
- `unsafe_operation`
- `unknown`

### Common codes

#### Transport and protocol

- `MCP_SERVER_UNREACHABLE`
- `MCP_SERVER_CRASHED`
- `TRANSPORT_CLOSED`
- `JSON_RPC_PARSE_ERROR`
- `PROTOCOL_VERSION_MISMATCH`
- `TOOL_NOT_FOUND`
- `TOOL_SCHEMA_INVALID`

#### Auth and permission

- `AUTH_MISSING`
- `AUTH_EXPIRED`
- `AUTH_INSUFFICIENT_SCOPE`
- `PERMISSION_DENIED`
- `CONSENT_REQUIRED`

#### Rate and quota

- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `CONCURRENCY_LIMITED`

#### Input and validation

- `MISSING_REQUIRED_FIELD`
- `INVALID_FIELD_TYPE`
- `INVALID_ENUM_VALUE`
- `INPUT_TOO_LARGE`
- `AMBIGUOUS_INPUT`
- `SCHEMA_CONTRACT_VIOLATION`

#### State and consistency

- `RESOURCE_NOT_FOUND`
- `RESOURCE_ALREADY_EXISTS`
- `STATE_CONFLICT`
- `STALE_VERSION`
- `PRECONDITION_FAILED`
- `PARTIAL_SUCCESS`
- `SIDE_EFFECT_UNKNOWN`

#### Upstream and infrastructure

- `UPSTREAM_500`
- `UPSTREAM_502`
- `UPSTREAM_503`
- `UPSTREAM_504`
- `NETWORK_TIMEOUT`
- `DNS_FAILURE`
- `TLS_FAILURE`

#### Safety-sensitive

- `DESTRUCTIVE_ACTION_BLOCKED`
- `NON_IDEMPOTENT_RETRY_UNSAFE`
- `POSSIBLE_DUPLICATE_SIDE_EFFECT`

---

## 10. Recovery Semantics

Every structured error should tell the agent five things:

1. **What failed?**
2. **Why does ErrorLens think that?**
3. **Can the agent retry?**
4. **Could a side effect already have happened?**
5. **What should the agent do next?**

### Retry policy fields

- `safe`: boolean
- `after_ms`: number or null
- `max_attempts`: number
- `backoff`: `none | fixed | exponential | respect_retry_after`
- `requires_idempotency_key`: boolean
- `same_arguments_required`: boolean

### State-impact fields

- `none`: no side effect occurred.
- `read_only`: read operation failed.
- `unknown`: ErrorLens cannot determine state impact.
- `possibly_applied`: operation may have partially succeeded.
- `applied`: operation appears to have succeeded despite a later error.

### Agent guidance style

Guidance must be short, imperative, and tool-use oriented.

Good:

> Retry after 30 seconds with the same arguments. If it fails again, stop and tell the user the upstream service is rate-limiting requests.

Bad:

> The operation experienced a temporary rate-limit condition, which might be resolved later depending on upstream capacity.

---

## 11. Adapter Rules

ErrorLens should support small YAML adapter rules for specific servers.

Conceptual example:

```yaml
server: github-mcp
rules:
  - name: github-rate-limit
    match:
      status: 403
      message_regex: "rate limit|secondary rate limit|abuse detection"
    classify:
      code: RATE_LIMITED
      layer: upstream_api
      category: rate_limit
      permanence: transient
      retry:
        safe: true
        after_ms: 60000
        max_attempts: 1
      state_impact: none
      user_action_required: false
      agent_next_steps:
        - "Wait before retrying."
        - "Use a narrower query if the next attempt fails."
      do_not:
        - "Do not retry rapidly."
```

Adapter rules make the project extensible without bloating the core.

---

## 12. Classification Heuristics

MVP should be deterministic. Do not require an LLM to classify errors.

### Inputs to classifier

- MCP error object
- Tool result content
- HTTP status if present
- Stderr/stdout snippets if from stdio upstream
- Exception name
- Error message
- Tool schema
- Tool name
- Arguments shape
- Duration
- Whether call timed out
- User-provided adapter rules

### Matching strategy

Order of precedence:

1. Exact adapter rule match.
2. Protocol-level error match.
3. HTTP/status/code match.
4. Known exception/errno match.
5. Regex/message match.
6. Tool schema validation comparison.
7. Timeout/side-effect ambiguity check.
8. Unknown fallback.

### Important default rule

For non-idempotent tools, a timeout after dispatch should produce:

- `code: SIDE_EFFECT_UNKNOWN`
- `retry.safe: false`
- `state_impact: possibly_applied`
- Guidance: query current state before retrying.

This one rule alone can prevent many dangerous agent behaviors.

---

## 13. Architecture

### Package layout

```text
mcp-errorlens/
  README.md
  LICENSE
  package.json
  tsconfig.json
  docs/
    concept.md
    taxonomy.md
    adapters.md
    client-setup.md
  examples/
    fake-broken-server/
    claude-desktop-config.example.json
    cursor-config.example.json
  src/
    core/
      structured-error-model.ts
      taxonomy.ts
      classifier.ts
      recovery.ts
      redaction.ts
      adapters.ts
    proxy/
      proxy-server.ts
      upstream-client.ts
      tool-registry.ts
      result-wrapper.ts
    companion/
      mcp-tools.ts
      diagnostic-server.ts
    trace/
      trace-model.ts
      jsonl-store.ts
      replay.ts
      report.ts
    cli/
      index.ts
      commands/
        init.ts
        add-server.ts
        proxy.ts
        doctor.ts
        traces.ts
        replay.ts
        report.ts
    config/
      config-model.ts
      load-config.ts
      validate-config.ts
  tests/
    fixtures/
    unit/
    integration/
```

### Recommended dependencies

Keep this lean.

- MCP TypeScript SDK
- `zod` for schema validation
- `commander` or `yargs` for CLI
- `yaml` for config and adapter rules
- `nanoid` or equivalent for trace IDs
- Node built-ins for filesystem/process handling

Avoid heavy dependencies in the MVP.

### Runtime modes

#### Mode A — Companion Server

Easiest to implement first.

The user adds ErrorLens as a normal MCP server. It exposes diagnostic tools. The agent can call ErrorLens when another MCP call fails or when the user pastes an error.

Pros:

- Fast to ship.
- Low protocol risk.
- Useful immediately.

Cons:

- The agent must choose to use it.
- It does not automatically wrap every tool failure.

#### Mode B — Proxy Server

The main differentiator.

The user points the AI client at ErrorLens. ErrorLens launches or connects to upstream MCP servers and exposes their tools with ErrorLens wrapping.

Pros:

- Automatic failure normalization.
- Stronger wow factor.
- Better GitHub/README demo.

Cons:

- More protocol complexity.
- Must carefully preserve upstream tool schemas and behavior.

#### Mode C — Trace Analyzer CLI

Reads JSONL traces and produces a local report.

Pros:

- Great for maintainers.
- Useful in CI.
- Easy to demonstrate with fixtures.

Cons:

- Less magical than proxy mode.

Recommended implementation order:

1. Companion Server
2. Core classifier
3. CLI trace/replay/report
4. Proxy Mode for stdio upstreams
5. Streamable HTTP upstreams
6. Adapter marketplace/community rules

---

## 14. Config Design

Example config:

```yaml
version: 1
trace:
  enabled: true
  path: .errorlens/traces.jsonl
  redact_secrets: true
proxy:
  expose_tool_prefix: true
  default_timeout_ms: 60000
  max_result_chars: 12000
servers:
  github:
    transport: stdio
    command: npx
    args:
      - -y
      - github-mcp-server
    env:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    adapter_rules:
      - ./rules/github.yaml
  docs:
    transport: streamable_http
    url: http://localhost:3333/mcp
rules:
  load_builtin: true
  custom_paths:
    - ./rules
redaction:
  enabled: true
  patterns:
    - name: generic-token
      regex: "(?i)(api[_-]?key|token|secret|password)=([^\\s]+)"
```

---

## 15. MCP Tool Design for Companion Mode

Keep the exposed tool list small. Too many tools would repeat the broader MCP ecosystem problem.

### Tool: `classify_error`

Purpose:

Classify a raw MCP/tool error into the ErrorLens structured error model.

Inputs:

- `server_name`
- `tool_name`
- `raw_error`
- `raw_result`
- `duration_ms`
- `tool_arguments_summary`
- `tool_side_effect_type`: `read | write | destructive | unknown`

Output:

- Structured error object
- Confidence
- Recovery guidance

### Tool: `recommend_recovery`

Purpose:

Given a structured error, produce short next-step instructions for the agent.

Inputs:

- Structured error object
- Current task goal
- Available alternative tools, optional

Output:

- `next_steps`
- `safe_to_retry`
- `requires_user_input`
- `stop_condition`

### Tool: `replay_trace`

Purpose:

Load a local trace and explain what happened.

Inputs:

- `trace_id`

Output:

- Timeline
- Failure classification
- Recommended fix

### Tool: `summarize_failures`

Purpose:

Summarize recent MCP failures for maintainers.

Inputs:

- time range
- server filter
- tool filter

Output:

- Top failure categories
- Most unreliable tools
- Suggested adapter rules
- Suggested server-side fixes

---

## 16. CLI Design

### `errorlens init`

Creates:

```text
.errorlens/
  config.yaml
  rules/
  traces.jsonl
```

### `errorlens doctor`

Checks:

- Config validity
- Upstream command availability
- Environment variables present or missing
- Basic server startup
- Tool listing works
- Adapter rules parse
- Trace path writable

### `errorlens proxy`

Starts proxy mode.

### `errorlens replay <trace-id>`

Prints a concise diagnostic:

```text
Trace: err_01J...
Server: github
Tool: create_issue
Classification: SIDE_EFFECT_UNKNOWN
Reason: tool timed out after dispatching a write-like operation
Retry safe: no
Recommended next step: query issue list/search before retrying create_issue
Do not: blindly call create_issue again
```

### `errorlens report`

Outputs:

- Error counts by category
- Top failing servers
- Top failing tools
- Retry-safe vs retry-unsafe failures
- Unknown classifications needing adapter rules

---

## 17. Demo Scenario

The README demo should use a fake broken MCP server included in the repo.

### Fake tools

- `search_docs`: sometimes returns 503.
- `create_ticket`: sometimes times out after creating a ticket.
- `update_record`: returns validation errors.
- `delete_file`: blocked by policy.

### Demo sequence

1. Run fake server directly.
2. Show the agent receiving vague errors.
3. Run fake server through ErrorLens.
4. Show structured error response.
5. Show the agent choosing a safer next step.
6. Show `errorlens report` summarizing failures.

This creates a compelling GitHub demo without depending on third-party services.

---

## 18. Quality Gates

Before calling the project usable, it should pass these checks:

### Functional

- Classifies common HTTP errors correctly.
- Classifies common Node process/transport errors correctly.
- Detects validation-like errors.
- Detects rate limits.
- Detects auth failures.
- Handles unknown errors gracefully.
- Redacts secrets from traces.
- Preserves successful tool responses.
- Does not mutate upstream tool arguments.

### Protocol

- Works with stdio upstream server in proxy mode.
- Tool listing from upstream is preserved.
- Tool schemas are preserved or minimally annotated.
- Tool errors are wrapped without crashing the client.
- Server can be inspected using official MCP inspector tooling.

### Agent behavior

Create fixture tests where an agent-like caller receives:

- Generic 429 error → ErrorLens returns retry-after guidance.
- Timeout on read-only tool → safe retry.
- Timeout on write-like tool → unsafe retry; query state first.
- 401 auth error → ask user to refresh credentials.
- Validation error → correct input instead of retrying.
- 404 missing resource → search/list resources before create/update.

### Developer experience

- Install in one command.
- Works locally without API keys for demo.
- README quickstart under five minutes.
- No cloud account required.
- No GPU or model dependency.

---

## 19. Security and Privacy Requirements

ErrorLens will see tool names, arguments, results, and errors. Treat that as sensitive.

### Hard requirements

- No telemetry by default.
- Local trace store only.
- Redact secrets before writing traces.
- Allow tracing to be disabled.
- Never print full environment variables.
- Never log full tokens.
- Never send traces to external services in MVP.
- Make it obvious when a tool call may be destructive.

### Redaction defaults

Detect and redact:

- API keys
- Bearer tokens
- GitHub tokens
- OpenAI/Anthropic tokens
- Password-like key names
- Private keys
- Long high-entropy strings

### Important disclaimer

ErrorLens improves recovery semantics. It is not a security sandbox and should not be marketed as one.

---

## 20. Repository Positioning

### README headline

# MCP ErrorLens

**Structured error recovery for MCP agents.**

### README subheadline

MCP servers often fail with vague messages. ErrorLens turns those failures into structured, retry-aware, state-aware guidance that agents can use.

### Why users install it

- Their agent keeps getting stuck after vague tool errors.
- They want to know whether retrying a failed tool call is safe.
- They maintain an MCP server and want better diagnostics.
- They use multiple MCP servers and want one consistent failure language.
- They want local traces without a heavyweight observability product.

### Avoid overclaiming

Do not claim:

- “Solves all MCP reliability.”
- “Makes agents safe.”
- “Prevents prompt injection.”
- “Automatically fixes every server.”

Claim:

- “Makes tool failures easier for agents and developers to recover from.”
- “Adds structured failure semantics around existing MCP servers.”
- “Helps prevent unsafe blind retries after ambiguous side-effecting failures.”

---

## 21. Implementation Roadmap

### Phase 0 — Repo and specification

Deliverables:

- README with concept and demo GIF placeholder.
- `docs/taxonomy.md`.
- `docs/structured-error-model.md`.
- `docs/adapters.md`.
- Basic package setup.

Definition of done:

- A reader understands exactly what problem the project solves.
- No code claims that do not exist yet.

### Phase 1 — Core classifier and companion MCP

Deliverables:

- Structured error model.
- Deterministic classifier.
- Recovery guidance generator.
- Companion MCP server exposing `classify_error`, `recommend_recovery`, and `summarize_failures`.
- Unit tests with fixture errors.

Definition of done:

- A user can paste an error and get useful structured recovery guidance.

### Phase 2 — Trace store and CLI

Deliverables:

- JSONL trace store.
- `errorlens init`.
- `errorlens doctor`.
- `errorlens traces`.
- `errorlens replay`.
- `errorlens report`.

Definition of done:

- A maintainer can inspect recent failures locally.

### Phase 3 — Proxy mode for stdio MCP servers

Deliverables:

- Launch/connect to one upstream stdio MCP server.
- Mirror upstream tool list.
- Forward tool calls.
- Preserve successful responses.
- Wrap failures.
- Record traces.

Definition of done:

- ErrorLens can sit between a real client and a fake broken server.

### Phase 4 — Adapter rules

Deliverables:

- YAML rule parser.
- Rule validation.
- Built-in generic rules.
- Example rules for common error classes.
- `errorlens rules test`.

Definition of done:

- Users can add server-specific mappings without changing code.

### Phase 5 — Streamable HTTP and polish

Deliverables:

- Streamable HTTP upstream support.
- Better docs for Claude Desktop/Cursor/custom clients.
- Better failure reports.
- Screenshots/demo recording.
- GitHub release.

Definition of done:

- The project feels installable by strangers.

---

## 22. Risks and Mitigations

### Risk: MCP proxy compatibility is harder than expected

Mitigation:

Start with companion mode and stdio proxy only. Do not try to support every transport/client in MVP.

### Risk: Users confuse ErrorLens with a security sandbox

Mitigation:

Use clear wording: reliability layer, not security sandbox.

### Risk: Classifier is too generic to be useful

Mitigation:

Ship adapter rules and strong built-in heuristics for the most common failures: auth, rate limits, validation, timeout, state conflict, and side-effect ambiguity.

### Risk: Tool output becomes too verbose for agents

Mitigation:

Return compact agent guidance by default. Put verbose diagnostics in trace reports.

### Risk: Existing MCP gateways/tool routers add similar functionality

Mitigation:

Position ErrorLens narrowly: structured recovery semantics and traceable failure classification, not general routing.

---

## 23. What to Avoid During Implementation

Do not:

- Add memory features.
- Add an LLM dependency to the MVP.
- Build a web dashboard first.
- Support every MCP transport immediately.
- Create dozens of MCP tools.
- Log secrets.
- Claim formal security guarantees.
- Let the project become a generic MCP marketplace/gateway.
- Build custom auth integrations before the core works.
- Add Docker/Kubernetes complexity unless absolutely needed.

---

## 24. First GitHub Release Checklist

A good first public release should include:

- Clear README.
- One-command local install.
- Fake broken server demo.
- Companion MCP mode.
- Stdio proxy mode.
- Core taxonomy docs.
- Adapter rule docs.
- Local trace report command.
- Tests for key classifications.
- Security/privacy note.
- Limitations section.

Recommended version: `v0.1.0`.

---

## 25. Suggested Future Features

Only after MVP works:

- Community adapter rule registry.
- Confidence scoring based on historical outcomes.
- MCP client setup wizard.
- CI mode for MCP server maintainers.
- HTML report output.
- Import traces from other MCP clients.
- Optional LLM-powered adapter suggestion, disabled by default.
- Team-shared redacted trace bundles.
- OpenTelemetry export, optional.

---

## 26. Drop-In Prompt for the Next Coding Session

Use this prompt in the next session to start implementation:

> Build the project described in this plan: **MCP ErrorLens**, a local-first TypeScript/Node.js MCP reliability layer that turns vague MCP/tool failures into structured, retry-aware, state-aware recovery guidance for LLM agents. Do not write a SaaS app, do not add memory features, do not use model fine-tuning, and do not introduce heavyweight dependencies. Start with a clean open-source repo structure, then implement Phase 1 first: core structured error model, deterministic classifier, recovery guidance generator, companion MCP server exposing a small diagnostic tool set, fixtures, and tests. After Phase 1 works, implement JSONL tracing and CLI commands, then stdio proxy mode. Keep all outputs compact and agent-friendly. Treat privacy seriously: local-only traces, no telemetry, redaction by default. Follow the architecture, taxonomy, roadmap, and quality gates in this markdown file.

---

## 27. Final Recommendation

Build **MCP ErrorLens**.

It is specific enough to implement, broad enough to matter, and differentiated enough to stand out on GitHub. It targets a real 2026 LLM/tool-use pressure point: agents do not merely need more tools; they need failures to become recoverable, safe, and semantically clear.

The MVP is realistic for a white-coded project because it is deterministic infrastructure, not model research. It can start as a compact companion MCP server and grow into a proxy. That gives you a path to ship something useful quickly while still having a strong long-term product story.
