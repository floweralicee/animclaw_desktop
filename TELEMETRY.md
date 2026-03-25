# Telemetry

AnimClaw collects **anonymous, non-identifiable** telemetry data to help us
understand how the product is used and where to focus improvements. Participation
is optional and can be disabled at any time.

Telemetry is split into two independent layers:

1. **Product telemetry** — lightweight CLI and web-app usage events.
2. **AI observability** — LLM generation, tool call, and feedback tracking via
   PostHog's LLM Analytics (powered by an OpenClaw plugin).

Both layers share the same opt-out controls and privacy mode setting.

---

## Product Telemetry

| Event                     | When                                    | Properties                                                                          |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `cli_bootstrap_started`   | `animclaw bootstrap` begins             | `version`                                                                           |
| `cli_bootstrap_completed` | Bootstrap finishes                      | `duration_ms`, `workspace_created`, `gateway_reachable`, `web_reachable`, `version` |
| `chat_message_sent`       | User sends a chat message in the web UI | `message_length`, `is_subagent`                                                     |
| `chat_stopped`            | User stops an active agent run          | —                                                                                   |
| `workspace_created`       | New workspace is created                | `has_seed`                                                                          |
| `workspace_switched`      | User switches workspaces                | —                                                                                   |
| `workspace_deleted`       | Workspace is deleted                    | —                                                                                   |
| `session_created`         | New web chat session is created         | —                                                                                   |
| `object_entry_created`    | CRM object entry is created             | —                                                                                   |
| `report_executed`         | A DuckDB report is executed             | —                                                                                   |
| `file_uploaded`           | A file is uploaded to the workspace     | —                                                                                   |
| `$pageview`               | User navigates within the web app       | `$current_url` (path only, no query params with user data)                          |

Every event includes baseline machine context: `os` (platform), `arch`, and
`node_version`.

### Anonymous install ID

A single anonymous UUID is generated on first run and persisted in
`~/.openclaw-animclaw/telemetry.json` as `anonymousId`. This install-scoped ID is
shared across all telemetry layers — CLI, web server, browser, and the OpenClaw
PostHog plugin — so a single AnimClaw installation maps to exactly one PostHog
person.

The ID is:

- **Stable** — survives restarts, upgrades, and re-bootstrap.
- **Anonymous** — a random UUID with no relation to your machine, username, or
  IP address.
- **Install-scoped** — deleting `~/.openclaw-animclaw` resets it.
- **Inspectable** — run `npx animclaw telemetry status` to see your current ID.

---

## AI Observability

The `posthog-analytics` OpenClaw plugin captures LLM interactions as PostHog AI
events. It is installed automatically during `animclaw bootstrap` when a
PostHog project key is available.

### Event hierarchy

```
Session ($ai_session_id)
  └─ Trace ($ai_trace_id)           ← one per agent run
       ├─ Generation ($ai_generation) ← the LLM call
       ├─ Span ($ai_span)            ← each tool call
       ├─ Span ($ai_span)
       └─ ...
```

### Events

| Event                       | When                                   | Key properties                                                                                                                         |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `$ai_generation`            | Agent run completes                    | `$ai_model`, `$ai_provider`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_latency`, `$ai_total_cost_usd`, `$ai_tools`, `$ai_is_error` |
| `$ai_span`                  | Each tool call completes               | `$ai_span_name` (tool name), `$ai_latency`, `$ai_is_error`, `$ai_parent_id`                                                            |
| `$ai_trace`                 | Agent run completes                    | `$ai_trace_id`, `$ai_session_id`, `$ai_latency`, `tool_count`                                                                          |
| `survey sent`               | User clicks Like/Dislike in the web UI | `$survey_response` (1=like, 2=dislike), `$ai_trace_id`, `message_id`                                                                   |
| `animclaw_message_received` | User sends a message (gateway-side)    | `channel`, `session_id`, `has_attachments`                                                                                             |
| `animclaw_session_start`    | Agent session begins                   | `session_id`, `channel`                                                                                                                |
| `animclaw_session_end`      | Agent session ends                     | `session_id`, `channel`                                                                                                                |
| `animclaw_turn_completed`   | Agent run completes                    | `session_id`, `run_id`, `model`                                                                                                        |

### Privacy mode

By default, **privacy mode is on**. When privacy mode is enabled:

- `$ai_input` and `$ai_output_choices` are replaced with `[REDACTED]`.
- Tool call parameters and results are not included in `$ai_span` events.
- Only metadata is captured: model name, token counts, latency, cost, tool
  names, and error flags.

When privacy mode is off, full message content and tool results are captured.
API keys, tokens, and credential-like strings are **always** stripped regardless
of privacy mode.

Toggle privacy mode:

```bash
npx animclaw telemetry privacy off    # capture full content
npx animclaw telemetry privacy on     # redact content (default)
```

### PostHog evaluations

Once AI events are flowing, you can configure PostHog Evaluations in the
dashboard to automatically score generations:

- **LLM-as-a-judge** — score outputs on relevance, helpfulness, hallucination,
  or custom criteria.
- **Code-based (Hog)** — deterministic checks like output length, keyword
  presence, or cost thresholds.

Evaluations run on sampled `$ai_generation` events and store pass/fail results
with reasoning. No code changes are needed — evaluations are configured entirely
in the PostHog dashboard.

### User feedback (Like / Dislike)

The web UI shows thumbs-up and thumbs-down buttons on every completed assistant
message. Clicking a button sends a `survey sent` event to PostHog linked to the
conversation's `$ai_trace_id`. This feedback appears in the PostHog LLM
Analytics trace timeline.

Feedback buttons only appear when the PostHog project key is configured. If
PostHog is unreachable, feedback calls fail silently — the chat UI is never
blocked.

---

## What We Do NOT Collect

- File contents, names, or paths
- Message contents or prompts (when privacy mode is on — the default)
- API keys, tokens, or credentials (always stripped)
- Workspace names (never sent, not even hashed)
- IP addresses (PostHog is configured to discard them)
- Environment variable values
- Error stack traces or logs
- Any personally identifiable information (PII)

---

## How to Opt Out

Any of these methods will disable telemetry entirely (both product telemetry
and AI observability):

### CLI command

```bash
npx animclaw telemetry disable
```

### Environment variable

```bash
export ANIMCLAW_TELEMETRY_DISABLED=1
```

### DO_NOT_TRACK standard

```bash
export DO_NOT_TRACK=1
```

### CI environments

Telemetry is automatically disabled when `CI=true` is set.

### Check status

```bash
npx animclaw telemetry status
```

---

## Configuration

### Privacy mode

```bash
npx animclaw telemetry privacy on     # redact message content (default)
npx animclaw telemetry privacy off    # send full message content
```

Privacy mode is stored in `~/.openclaw-animclaw/telemetry.json` and is read by both
the CLI/web telemetry layer and the OpenClaw analytics plugin.

### PostHog analytics plugin

The plugin is configured via OpenClaw's plugin config:

```bash
openclaw --profile animclaw config set plugins.entries.posthog-analytics.enabled true
openclaw --profile animclaw config set plugins.entries.posthog-analytics.config.apiKey <key>
```

This is handled automatically by `animclaw bootstrap`.

---

## Debug Mode

Set `ANIMCLAW_TELEMETRY_DEBUG=1` to print telemetry events to stderr instead of
sending them. Useful for inspecting exactly what would be reported.

## Re-enabling

```bash
npx animclaw telemetry enable
```

## How It Works

- **Shared identity**: All layers read the same `anonymousId` from
  `~/.openclaw-animclaw/telemetry.json`. The first component to run (usually the
  CLI during `animclaw bootstrap`) generates the UUID; every subsequent layer
  reuses it.
- **CLI**: The `posthog-node` SDK sends events from the Node.js process. Events
  are batched and flushed asynchronously — telemetry never blocks the CLI.
- **Web app (server)**: API route handlers call `trackServer()` which uses the
  same `posthog-node` SDK on the server side with the persisted install ID.
- **Web app (client)**: The `posthog-js` SDK is bootstrapped with the install ID
  from the server so the browser shares the same PostHog identity. No cookies
  are set; session data is stored in memory only.
- **OpenClaw plugin**: The `posthog-analytics` plugin runs in-process with the
  OpenClaw Gateway. It reads the persisted install ID and hooks into agent
  lifecycle events (`before_model_resolve`, `before_prompt_build`,
  `before_tool_call`, `after_tool_call`, `agent_end`, `message_received`,
  `session_start`, `session_end`) to emit PostHog AI events via `posthog-node`.
- **PostHog project token**: The write-only project token (`phc_...`) is
  embedded in the built artifacts. It can only send events — it cannot read
  dashboards or analytics data.
