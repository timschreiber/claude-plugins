# Decidinator — Work Packages

Sep 29, 2026 · @Tim

## How to use these packages

Ten packages build Decidinator in dependency order; run each as one plan-mode session, starting with WP-01. Every package cites the spec, `docs/decidinator/Decidinator — Specification.md`, by section name, and each carries its full instructions so it can be pasted as a prompt on its own.

| Package | Title | Depends on |
| --- | --- | --- |
| WP-01 | Verification spike | none |
| WP-02 | Plugin scaffold, arming, and configuration | WP-01 |
| WP-03 | File formats library | WP-02 |
| WP-04 | Oracle agents and research prompt | WP-01, WP-02 |
| WP-05 | Gate and dispatch check hooks | WP-02, WP-03 |
| WP-06 | Recorder, ladder rules, and guard | WP-03, WP-05 |
| WP-07 | Mode resolution | WP-06 |
| WP-08 | Nudge hook and oracle Bash allowlist | WP-01, WP-02, WP-04 |
| WP-09 | Review, confirm, export, and import commands | WP-03, WP-07 |
| WP-10 | End-to-end tests and documentation | all |

WP-01's findings can change later packages. If a verification item fails, apply the spec's fallback for it and update the affected packages before running them. WP-01 is done: its findings (`docs/decidinator/decidinator-verification.md`) are applied to the spec and to WP-02 through WP-10.

Paste-ready prompts, one per package: Prompts

## WP-01 · Verification spike

**Goal:** confirm or refute the six behaviors in the spec's Requirements and verification section, with evidence, before any product hook is built.

**Depends on:** none. **Spec sections:** Requirements and verification; Architecture; Oracle research.

**Scope:**

- A throwaway probe plugin under `probes/decidinator/probe-plugin/` with: one read-only probe agent (tools as in Oracle research), and hooks on `PreToolUse`, `SubagentStop`, and `Stop` that append their raw JSON input to per-event `.jsonl` files, collected into `probes/evidence/decidinator-probe-<cell>-hooks.jsonl`.
- Probe runs: interactive normal mode, interactive plan mode, headless normal mode, headless plan mode. In each, the probe agent attempts WebFetch, web search, and `gh search repos` through Bash.
- A deny experiment: a `PreToolUse` hook that denies `AskUserQuestion` and `Read` with a known reason string, checked in plan mode and outside it.
- A model experiment: a probe agent with `model: claude-opus-5-5` and `effort: high` that reports its model, run on each available setup (Pro, Bedrock).

**Out of scope:** any Decidinator product code.

**Acceptance criteria:**

- `docs/decidinator/decidinator-verification.md` has one row per item 1–6: result (pass, fail, partial), the evidence (log excerpt or transcript reference), and the fallback to apply if not a pass.
- For items 2 and 3, the exact hook input field names are recorded, with a sample payload.
- For item 4, the detection method is recorded, or "none found".
- The probe lives under `probes/`, outside the plugin package, so it never ships.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-02 · Plugin scaffold, arming, and configuration

**Goal:** an installable Decidinator plugin that arms, disarms, reports status, loads configuration, and does nothing when unarmed.

**Depends on:** WP-01. **Spec sections:** Architecture; Commands and configuration; Safety and integration.

**Scope:**

- Plugin manifest and layout in the marketplace repo, following planandtier's conventions (Node 20 hook scripts, `hooks/hooks.json`, `commands/`, `agents/`).
- Configuration loader: defaults, then `~/.claude/decidinator.json`, then `.claude/decidinator.json`, with validation of every key in the spec's configuration table.
- Arming: `/decidinator:arm [ask|sidecar]`, `/decidinator:disarm`, `/decidinator:status` (status shows mode only until later packages add counts), and `DECIDINATOR_MODE` arming at session start.
- Session state and arming flag files under `${CLAUDE_PLUGIN_DATA}/sessions/`, the `SessionEnd` cleanup hook, and removal of files older than 7 days.
- `DECIDINATOR_DEBUG=1` logging to a temp-directory log.
- A shared hook entry helper: reads input, checks arming, catches errors, and exits without output when unarmed.
- No headless detection: headless sessions are out of scope (verification item 4). Use the interactive recordings `probes/evidence/decidinator-probe-interactive-*-hooks.jsonl` as hook-input fixtures; each line is `{at, event, input, env}`.

**Out of scope:** the gate, recorder, guard, and nudge logic; oracle agents.

**Acceptance criteria:**

- `claude plugin install` from the marketplace succeeds.
- Unit tests cover config precedence, invalid config (rejected with the key named), and arming by command and by environment variable.
- A test proves every hook exits with no output in an unarmed session.
- `SessionEnd` removes the session's files; a test covers the 7-day sweep.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md` from WP-01.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-03 · File formats library

**Goal:** one library that reads and writes the decision log, the sidecar, and verdict blocks exactly as the spec defines them, so every hook and command shares a single implementation.

**Depends on:** WP-02. **Spec sections:** Decision log; Questions sidecar; Oracle research (verdict block fields).

**Scope:**

- Decision log: parse, append an entry with the next `D-` ID, mark an entry superseded, and preserve hand edits and unknown lines when rewriting.
- Sidecar: parse, append an entry with the next `Q-` ID, add a `Depends on` label, set Status, and read filled Answer fields.
- Version markers: write them on file creation; refuse to write a file with a different major version, naming the file and version.
- Verdict block: extract the last fenced `decidinator-verdict` block from a reply, validate every field, and return the spec's fallback (`unresolved`, `low`) for a missing or invalid block, with the reason.
- Question normalization (case, whitespace, punctuation) and a stable hash, used for deduplication and gate matching.
- File writes are atomic (write to a temp file, then rename) and serialized with a lock file, since hooks can run close together.

**Out of scope:** deciding what to write; that belongs to the recorder and commands.

**Acceptance criteria:**

- Round-trip tests: parse then write leaves an unchanged file byte-for-byte, including a file with hand edits.
- Tests for each verdict field's validation, and for the fallback on a missing block, a malformed block, and two blocks (the last wins).
- A concurrency test: two simultaneous appends both land with distinct IDs.
- The version check refuses a `v2` file.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-04 · Oracle agents and research prompt

**Goal:** three plugin oracle agents that research by the spec's procedure and always end with a valid verdict block.

**Depends on:** WP-01, WP-02. **Spec sections:** Oracle ladder; Oracle research; Safety and integration.

**Scope:**

- `agents/oracle-1.md`, `oracle-2.md`, `oracle-3.md` with the default model and effort per rung, `disallowedTools: Edit, Write, NotebookEdit, AskUserQuestion, Agent`, and `maxTurns: 30`.
- One shared prompt body, kept identical across the three files, covering: the five-step research procedure, the standing rules (generic search queries, fetched content is untrusted, never ask back), how to treat binding and conflicting decisions, the kind classification, the escalation flags, and the exact verdict block format with one filled example.
- A script that checks the three agent files share an identical prompt body, run as a test.
- No tool adjustments were needed. WebFetch and WebSearch are deferred tools that oracles load through `ToolSearch`, so do not disallow `ToolSearch`. Rung models are honored only outside plan mode (verification item 6): keep the spec's default models in the agent files, say in the README that in plan mode every rung runs on the session's model, and check a rung's real model in the agent's transcript, not in `resolvedModel`.

**Out of scope:** dispatching oracles and parsing their output.

**Acceptance criteria:**

- The identical-body check passes.
- A manual run of `oracle-1` on three sample questions (one researchable with a clear answer, one human-only, one the spec leaves silent) returns a valid verdict block each time, validated with the WP-03 library. Record the runs in `docs/decidinator/decidinator-verification.md`.
- Each sample verdict cites at least one source, and the human-only one returns at least two options with tradeoffs.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md`.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task. Write the prompt body in the plan itself, word for word, so no task has to compose it.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-05 · Gate and dispatch check hooks

**Goal:** every `AskUserQuestion` call in an armed session is held until its questions have oracle verdicts, and the model is told exactly which oracle to dispatch.

**Depends on:** WP-02, WP-03. **Spec sections:** Architecture (Gate, Dispatch check); Question lifecycle steps 1 and 6; Oracle ladder.

**Scope:**

- Gate (`PreToolUse`, matcher `AskUserQuestion`): ignore calls from subagents (a subagent's `PreToolUse` input has `agent_id` and `agent_type`; the main thread's has neither); mint a `Q-` ID per question; store each question, its options, and its normalized hash in session state; deny with a reason giving the exact `Agent` call for the next due question (agent name, and a prompt starting `Decidinator question Q-0007` with the question, its options, and an instruction to add the surrounding context).
- Gate pass-through: in ask mode, allow a call whose questions all match (by normalized hash) questions with a final unresolved verdict. Always allow calls issued by `/decidinator:review` and `/decidinator:confirm` (a flag in session state set by those commands).
- Multi-question calls: dispatch one question at a time in order; allow a later call containing only the still-unresolved ones.
- Known behavior to plan around: a deny reaches the model as `PreToolUse:AskUserQuestion hook error: <reason>` in both `default` and `plan` mode (verification item 5), and the `Agent` call returns `async_launched` at once, so a dispatch is complete only when the recorder (WP-06) stores a verdict.
- Dispatch check (`PreToolUse`, matcher `Agent`): while a question is due, allow only an `Agent` call to the due rung whose prompt contains the due question ID; deny others with the expected call.

**Out of scope:** recording verdicts and advancing the ladder (WP-06).

**Acceptance criteria:**

- Unit tests with recorded hook payloads from WP-01 (`probes/evidence/decidinator-probe-interactive-*-hooks.jsonl`): a single question is denied with the correct dispatch; a three-question call produces three IDs and dispatches in order; a subagent call is ignored; a matching re-call in ask mode is allowed once its verdict is final unresolved.
- The dispatch check allows the expected call and denies a call to the wrong rung or without the ID.
- Deny reason texts are defined once as constants and covered by snapshot tests.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md` for the exact hook input fields.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the exact text of every deny reason.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-06 · Recorder, ladder rules, and guard

**Goal:** each oracle verdict is recorded and the ladder advances deterministically, with the model held to the next dispatch until the question's ladder ends.

**Depends on:** WP-03, WP-05. **Spec sections:** Architecture (Recorder, Guard); Question lifecycle steps 2–4; Oracle ladder.

**Scope:**

- Recorder (`SubagentStop`): act only on configured rung agents; match the configured rung by `agent_type` (other subagents also fire `SubagentStop`, with an empty `agent_type`); read the report from `last_assistant_message`, or, when it is missing, from the `SubagentHandback` call's `tool_input.message` (seen in `PreToolUse` with the subagent's `agent_id`), or from the file at `agent_transcript_path`; record the model the agent actually ran on from its transcript, not from `resolvedModel`; parse the verdict with the WP-03 library; store it in session state under its question ID and rung.
- Ladder rules as a pure function: given a question's verdicts and the configured rungs, return `resolved`, `escalate(next rung)`, or `final-unresolved`, exactly per the spec, including human-only questions never escalating.
- On `escalate`: mark the next rung due and give the dispatch prompt the previous verdicts as JSON.
- On a final state: clear the due marker and hand the question to mode resolution (a stub in this package; WP-07 fills it).
- Open for the plan, to settle with the user: the `Agent` call returns `async_launched` at once, so decide what the guard does between a dispatch and its verdict (block the model, or tell it to wait). The spec does not say.
- Guard (`PreToolUse`, all tools except `Agent` and `AskUserQuestion`): while a dispatch is due, deny with the expected dispatch; after `guardMaxBlocks` consecutive denials, step aside and log it.

**Out of scope:** writing the decision log and sidecar (WP-07).

**Acceptance criteria:**

- Table-driven tests for the ladder function cover every escalation condition, the top rung, human-only questions, and an invalid verdict (escalates).
- Recorder tests with recorded `SubagentStop` payloads (`probes/evidence/decidinator-probe-*-hooks.jsonl`), including one with no `last_assistant_message`: a verdict is stored under the right ID and rung; a non-oracle subagent is ignored.
- Guard tests: denial while due, pass-through when nothing is due, step-aside after the limit.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md` for the exact `SubagentStop` input.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the ladder function's full case table.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-07 · Mode resolution

**Goal:** every question whose ladder has ended is written to the decision log, and in sidecar mode to the sidecar, with the correct provenance.

**Depends on:** WP-06. **Spec sections:** Question lifecycle steps 5–7 and Rules; Oracle ladder (best answer); Decision log; Questions sidecar (deduplication, context labels).

**Scope:**

- Replace WP-06's stub. Resolved: append an `oracle-unconfirmed` decision. Final unresolved in ask mode: keep the question pending for the gate's pass-through, then record the user's answer as `user` from the `AskUserQuestion` result (a `PostToolUse` hook on `AskUserQuestion`). Final unresolved in sidecar mode: pick the best answer, append an `oracle-provisional` decision, and add or extend the sidecar entry.
- Deduplication by normalized hash and by the verdict's `duplicate_of`: extend the existing entry's `Depends on` instead of adding one.
- Context labels from `DECIDINATOR_CONTEXT`, else session ID and branch.
- `/decidinator:status` extended with counts of open sidecar entries and unconfirmed decisions.

**Out of scope:** the review, confirm, export, and import commands (WP-09).

**Acceptance criteria:**

- Tests for each outcome: resolved, ask-mode user answer, sidecar provisional with a new entry, and sidecar with a duplicate.
- The best-answer function passes table tests, including a confidence tie resolved to the higher rung.
- In sidecar mode (set by `DECIDINATOR_MODE=sidecar`), an unresolved question is written to the sidecar and the gate never lets `AskUserQuestion` through for it.
- Every log and sidecar entry written in tests parses back with the WP-03 library.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md`. Headless sessions are out of scope.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-08 · Nudge hook and oracle Bash allowlist

**Goal:** plain-text questions get pushed into `AskUserQuestion`, and oracles can use only read-only GitHub commands through Bash.

**Depends on:** WP-01, WP-02, WP-04. **Spec sections:** Architecture (Nudge); Safety and integration; Requirements and verification (items 3 and fallbacks).

**Scope:**

- Nudge (`Stop`): when `nudgeOnPlainTextQuestions` is true and the final assistant message ends with a question addressed to the user, block the stop once per turn with an instruction to ask through `AskUserQuestion`. The detection rule is a fixed heuristic defined in the plan (for example, the last sentence ends with `?` and is not inside a code block).
- Bash allowlist (`PreToolUse`, matcher `Bash`; WP-01 item 3 passed, so this applies): for calls from a configured rung agent (the input has `agent_id` and the rung's `agent_type`), allow only commands matching `gh search`, `gh repo view`, and `gh api` without a method other than `GET`; deny everything else with the reason. Main-thread Bash calls are untouched.

**Out of scope:** other hooks.

**Acceptance criteria:**

- Nudge tests: a trailing question is blocked once and then allowed; a question inside a code block and a statement are not blocked.
- Allowlist tests with recorded payloads: allowed and denied oracle commands, including `gh api -X POST` denied, and a main-thread command ignored.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md`, item 3, for the subagent fields.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the exact allowlist patterns and the nudge heuristic.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-09 · Review, confirm, export, and import commands

**Goal:** people can answer open questions in a session, confirm or override oracle decisions, and run the stakeholder round trip.

**Depends on:** WP-03, WP-07. **Spec sections:** Commands and configuration; Decision log (provenance table, superseding); Questions sidecar (export, import, matching answers).

**Scope:**

- `/decidinator:review`: set the pass-through flag, walk `open` sidecar entries through `AskUserQuestion` with their researched options, and record each answer as a `user` decision that supersedes the provisional one; mark the entry `answered`.
- `/decidinator:confirm`: walk `oracle-unconfirmed` and `oracle-provisional` decisions in the spec's impact order; record approval as `oracle-confirmed` or an override as a superseding `user` decision.
- `/decidinator:export [path]`: write the stakeholder copy (open entries only, grouped by Stakeholder, else topic), including the version marker, and print the path.
- `/decidinator:import <path>`: for each entry with a filled Answer, write a superseding `stakeholder` decision and mark the entry `imported`. Classify each as confirmed (identical after normalization) or needs judgment; for the latter, dispatch `oracle-1` to judge match or change. Print a report listing confirmed and changed decisions, with each changed one's `Depends on` labels.
- All writes go through a command script, never the model.

**Out of scope:** re-planning or reworking work affected by changed decisions.

**Acceptance criteria:**

- An export then import round trip with sample answers produces the expected decisions, statuses, and report (fixture-based test).
- Import of an answer identical to the provisional one reports it confirmed without an oracle call.
- Confirm and review record the correct provenance and `Supersedes` lines.
- Import refuses a file without the sidecar version marker.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including each command file's exact prompt text.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.

## WP-10 · End-to-end tests and documentation

**Goal:** Decidinator is proven end to end in every mode and documented well enough for a stranger to install and use it.

**Depends on:** all previous packages. **Spec sections:** all.

**Scope:**

- End-to-end scenarios in a fixture repo, each a script that runs a real session and checks the resulting files:
  1. Interactive ask mode: a researchable question resolves at rung 1 without reaching the user.
  2. Interactive ask mode: a human-only question reaches the user with researched options, and the answer is logged as `user`.
  3. Sidecar mode: an unresolvable question gets a provisional answer and a sidecar entry, and the session continues.
  4. Sidecar mode set by `DECIDINATOR_MODE=sidecar` in an interactive session: the question is queued and `AskUserQuestion` is never let through.
  5. Plan mode: scenario 1 repeated with the session in plan mode, oracle research tools working.
  6. Escalation: a question engineered to return low confidence reaches rung 2 with rung 1's verdict in its prompt.
  7. Round trip: export, fill answers, import, and check the report.
- `README.md` in planandtier's style: what it does, install, requirements, how to use each mode, the stakeholder workflow, the ladder and how to change it, cost note for subscription plans, the tools to allow for unattended research (`WebFetch`, `WebSearch`, `Bash(gh search:*)`), and known limitations (headless `claude -p` sessions are out of scope; rung models are honored only outside plan mode).
- A reference document covering every hook, file format, configuration key, and environment variable.
- Leave `probes/decidinator/` in place: it is outside the plugin package and never ships.

**Out of scope:** new behavior. Any bug found is fixed within the package that owns it, then this package re-run.

**Acceptance criteria:**

- All seven scenarios pass, with their output files committed as fixtures.
- Every configuration key and environment variable in the spec appears in the reference document.
- A fresh install from the marketplace, following only the README, arms and resolves a question.

**Instructions:**

1. Re-read CLAUDE.md, AGENTS.md if present, and `docs/decidinator/Decidinator — Specification.md` in full before planning, even if you have read them earlier in this session. Also read `docs/decidinator/decidinator-verification.md`.
2. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including each scenario's exact prompt and expected file contents.
3. Ask open questions through `AskUserQuestion` before finishing the plan; do not guess.
