# planandtier: where token usage and prices come from

planandtier's telemetry estimates what a run costs: each worker attempt by tier, the main session's planning
and its orchestration. These findings cover where the numbers can be read and how to price them. They are
on Claude Code 2.1.283 (Windows).

Evidence:
- `probes/evidence/planandtier-usage-shapes.json`, from `probes/planandtier/usage-shapes.js`. It summarizes
  the transcripts of the 2026-09-28 end-to-end runs (7 sessions, 7 subagent transcripts) and the Agent
  results in the agent probe logs. It holds structure and numbers only, with no message text.
- `probes/evidence/planandtier-pricing.json`: Anthropic's pricing page, fetched 2026-09-28.

## Result

| Question | Answer |
|---|---|
| Does the Agent tool's result carry usage? | **Only in the foreground.** The headless probe's `PostToolUse` result had a full `usage` block and `totalTokens`. All 5 interactive (background) launches returned `async_launched` with no usage. |
| So where is a worker's usage? | **In its transcript,** at `SubagentStop`'s `agent_transcript_path`. Each `assistant` line has `message.model` (`claude-sonnet-5` for every worker here) and `message.usage`. |
| What does `usage` hold? | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` with a `cache_creation` split into `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`, plus `service_tier` and `inference_geo`. There is no `speed` field, so fast mode cannot be detected. |
| Are lines one per message? | **No.** 15 message ids appeared on more than one line across the 7 subagent transcripts. On every repeat, the input-side counts were the same on each line, and `output_tokens` was smaller on the earlier (streaming) line. |
| How should repeats be counted? | **Take each field's largest value per message id.** Here that equals the last line per id. Counting every line overcounts output, for example 394 against 384 for one `sonnet-low` worker. |
| Can the main session's planning be told from its execution? | **Yes.** The main transcript has `permission-mode` entries, and `permissionMode` on user entries, in order. Every assistant line falls under the latest one: for example 16 under `plan` and 10 under `auto` in one run. |
| Can planning subagents be told from workers? | **Yes.** Each subagent has `subagents/agent-<id>.meta.json` with `agentType` (`planandtier:sonnet-low`, `general-purpose`, …). |

## Prices

From Anthropic's pricing page (fetched 2026-09-28), in USD per million tokens:

| Model | Input | 5 m cache write | 1 h cache write | Cache read | Output |
|---|---|---|---|---|---|
| `claude-opus-5-5` | 4 | 5 | 8 | **0.20** | 20 |
| `claude-sonnet-5` | 2 | 2.50 | 4 | 0.20 | 10 |

- **Cache reads on Opus 5.5 are 0.05× its input price,** not the usual 0.1×. So the plugin prices each
  category from the model's own row, not from a multiplier. The evidence file has the other current models.
- **Sonnet 5 is $2/$10.** The page says the launch price is now the standard price, and the rise to $3/$15
  that had been scheduled for September 1, 2026 will not happen. That resolves the conflict in
  [`planandtier-tier-findings.md`](planandtier-tier-findings.md).
- **US-only inference** (`inference_geo: "us"`) costs 1.1× in every category. Transcripts record
  `inference_geo`; every line here was `not_available`.
- **Fast mode** costs more (Opus 5.5 at $8/$40), but transcripts do not record it, so it is priced at the
  standard rate.

## The first live run

An interactive run on 2026-09-28 (15:54, Claude Code 2.1.283, planandtier installed from the marketplace at
`85084a7`, `planandtier-agents-run.md`). Evidence:
- `probes/evidence/planandtier-agents-20260928-155438-session-output.txt`: the terminal output;
- `planandtier-agents-20260928-155438-telemetry.jsonl`: the plan's telemetry file;
- `planandtier-agents-20260928-155438-git-log.txt`: the throwaway repo's commits.

- **A `SubagentStop` hook's `systemMessage` is not shown for a background worker.** None of the three
  attempt lines H4 emitted appears in the output.
- **A `Stop` hook's `systemMessage` is shown.** The end-of-run summary appeared as `Stop says: planandtier
  spend …`. So H4 now queues each attempt's line in the run state, and H5 shows the queued lines at the next
  Stop. In a background run that is the Stop right after the next dispatch.
- **A Stop block's reason shows as "Stop hook error: …".** After T02, Claude ended its turn on the worker's
  hand-back, before planandtier's notice was ready. H5 blocked the stop with the notice, and Claude
  dispatched T03. The block worked; "error" is only how Claude Code labels it.
- **The planning row counted only the approved round.** The plan was rejected once with feedback. The first
  round's planning ($0.2635, 206,756 tokens, plan id `2378412cc7b5c5b4`) was recorded under a different id
  from the approved plan (`a71be78eff4fa160`, $0.0222). The summary matched planning by id, so it showed
  $0.02. H3 and execute-plan now record a `run` record at the start, and a run's planning is its session's
  planning since the previous run start. Replaying the recorded file with the start record added gives
  planning at $0.29.
- **The workers ran on `claude-sonnet-5-5`.** The `sonnet` alias in the tier agents now resolves to Sonnet
  5.5: the transcripts' model and the commits' co-author line both say so. The price table already had it
  ($2/$10, the same as Sonnet 5).
- **The commits carried both lines** (`Planandtier-Task:` and `Planandtier-Plan: a71be78eff4fa160`), and each
  attempt's cost was $0.06 to $0.10.

## Not measured

- The per-attempt line at the next Stop, in a live run. The run guides check it.
- Opus workers, or a main session using `opusplan`. Pricing is per message model, so a mixed session is
  priced message by message; no transcript here mixed models.
