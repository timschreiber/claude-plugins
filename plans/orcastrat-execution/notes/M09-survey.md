# M09 survey

## `run` and `plan`: the toolchain check as first preflight step

- `run` skill: `plugins/orcastrat/skills/run/SKILL.md`. Section order today: `## 1. Re-read the ground truth` (reads CLAUDE.md/AGENTS.md, plan-format.md, plan header, runs `next`) → `## 2. Preflight` with `### 2a. Checks` (items 1–8: active run, clean tree, plan status, open blocks, leftover worktrees, branch, interrupted-run recovery, pre-rename leftovers) → `### 2b. Ask for approval` (shows summary, asks `Proceed?`) → `### 2c. Prepare` (item 6 runs `run-state start … "${CLAUDE_SESSION_ID}"`, which writes the active-run marker; item 7 commits `chore(plan): start run`).
- `plan` skill: `plugins/orcastrat/skills/plan/SKILL.md`. No preflight section at all today; `## 1. Re-read the ground truth` (CLAUDE.md/AGENTS.md, plan-format.md, sources) is its first step.
- Spec §20 item 6 (`docs/orcastrat-execution-spec.md:439-451`): toolchain check is "the first preflight step on every `plan` and `run`, on every platform, before the instruction-file check". Runs directly through the session's shell tool (PowerShell tool on Windows without Git Bash) — "never a shipped script". Checks: `bash --version` ≥ 3.2; `git --version` ≥ 2.17 (`git worktree remove`, from 2.5 for `add`/`--git-common-dir`); `git rev-parse --is-inside-work-tree`; `git config user.name` and `git config user.email` both resolve; for `run` only, the clean-tree check (Change 1). On failure: `run` stops with `SETUP`; `plan` exits before surveying, except a missing/old bash only *warns* in `plan` (it doesn't run scripts). Nothing is created either way. Message lists every failed item with the platform fix: Git for Windows; the system package manager; `git init`; the `git config` commands.
- Existing clean-tree logic to reuse/fold in: `run` SKILL.md 2a item 2 (`plugins/orcastrat/skills/run/SKILL.md:96`) — `git status --porcelain` prints nothing, with the one exception of a "detailed but uncommitted milestone" (D109) whose paths are `plan.md`, that milestone's file, its `notes/<ID>-survey*.md`, or `notes/<ID>-plan-review.md`.
- No git-version check exists anywhere in the repo today (grepped); this is new.

## `plan`: full instruction-file check and outputs

- Spec §17 (Change 16), `docs/orcastrat-execution-spec.md:368-401`, is the governing text; quoted in full in the milestone Context (M09-preflight-checks.md:25-32). Key facts not already in Context:
  - Outputs live at `$(git rev-parse --git-common-dir)/orcastrat/instructions/` — same directory pattern as `run`'s briefs (`<common>/orcastrat/<plan-slug>/briefs/`, `plugins/orcastrat/scripts/task-brief:166`) and logs (`<common>/orcastrat/<plan-slug>/logs/`, D54), but instructions/ has no plan-slug segment (repo-wide, not per-plan) per spec text.
  - `review.md`: findings + actions, then general checks (`/doctor`, `/context`, "Would removing this cause Claude to make mistakes?").
  - `fix-prompt.md`: a paste-ready Claude Code prompt; spec §17 item 5 spells out its exact content (re-read CLAUDE.md/AGENTS.md/review; produce a plan with a small mechanical task list; then execute).
  - `ack`: loaded file list, `git hash-object` content hash, findings summary, the choice made.
  - Prompt only when findings exist and the hash isn't acknowledged; interactive-only; capped at ~10 lines with rest in the review; **conflicts line always shows, every invoke**, even when nag-suppressed.
  - `--yes`: never prompts; still writes review + fix-prompt, shows the one-line summary, continues.
- D40: toolchain check and instruction-file check are both built in M09, "in preflight order" (toolchain, then instructions, then model — Goal line).
- No shipped-script precedent for this check exists (Change 19.6 explicitly forbids one). Compare: `task-brief` (a shipped script) writes files under `<common>/orcastrat/<slug>/...` using `mkdir -p`, `awk`, `mv -f`, sourcing `lib/common`'s `print_path` (`plugins/orcastrat/scripts/task-brief:159-178`). The instruction-file check must do equivalent work (file discovery, `git hash-object`, file writes) as skill-instruction commands the session's shell tool runs directly, or via the session's own Write tool — no shipped script backs it.
- D65 / spec §20 item 3: commands skills tell Claude to run must be single-line, no `$(...)` substitution, no multi-line bash (this governs commands *told to* Claude, not commands inside a shipped script — D44). The instruction-file check, having no script, is therefore constrained to single-line, no-`$(...)` shell calls, or to the session's own Read/Write/Edit/Glob/Grep tools.
- No `tests/orcastrat/fixtures/` directory exists yet (glob found nothing) — any bats coverage of this check's file-content rules would need new fixtures, following `agents-files.bats`'s pattern of embedding expected text via heredocs and diffing with `missing_lines`.
- Referenced but unconfirmed here: the Claude Code docs' "CLAUDE.md files" page, against which the file list (root/nested CLAUDE.md, CLAUDE.local.md, AGENTS.md, `@` imports resolved recursively, `~/.claude/CLAUDE.md` reported separately) must be confirmed (spec §17 item 2).

## `run`: quick instruction-file check

- Spec §17 item 9 (`docs/orcastrat-execution-spec.md:398`): `run` re-finds the instruction files (a quick file search for CLAUDE.md, CLAUDE.local.md, AGENTS.md, plus the imports recorded in `ack`), hashes with `git hash-object`, compares against `ack`. Unchanged → show only the conflicts line (if any). Changed → do the full review (same as `plan`'s).
- `run` SKILL.md's own "Operating rules for long runs" bullet on reading discipline (`plugins/orcastrat/skills/run/SKILL.md:26-27`) governs how sparingly `run` should read things generally — relevant precedent for keeping this check cheap.

## `run` and `plan`: model check, removal of `model:` pins

- Current pins: `plugins/orcastrat/skills/plan/SKILL.md:6` `model: opus`; `plugins/orcastrat/skills/run/SKILL.md:6` `model: opus`; `plugins/orcastrat/skills/status/SKILL.md:6` `model: haiku`. All three to be removed (spec §21 item 2, `docs/orcastrat-execution-spec.md:464-465`).
- Spec §21 items 1–2 (`docs/orcastrat-execution-spec.md:455-468`) fully quoted in Context already (D30, D42). Model check runs "after the instruction-file check", confirming the session is on an Opus model via the model identity in the system prompt (D30) — not a tool call. Interactively: one line (session model + "planning and orchestration are designed for Opus") then AskUserQuestion **Stop** / **Continue on this model**. Under `--yes`: `run` appends `model-notice <UTC> <session model>` to `plans/<slug>/notes/run-log.md` (D42); `plan` writes the notice in its plan summary (the Reply block plan writes at the end of step 11, `plugins/orcastrat/skills/plan/SKILL.md:198-206` — currently ends with `Assumptions: none` then "Next steps"; no existing "notice" line to model this on).
- No AskUserQuestion usage exists anywhere yet in `plugins/orcastrat/` (grepped agents/skills) — this is the first use in the plugin. Spec §15 explicitly bans it for question rounds (`docs/orcastrat-execution-spec.md:327,736`) — the model check and instruction-file check are the only two sanctioned uses (spec §32 item 27, `docs/orcastrat-execution-spec.md:742`).
- `run`'s UTC-time convention: `date -u +%Y-%m-%dT%H:%M:%SZ` (used throughout, e.g. `plugins/orcastrat/skills/run/SKILL.md:65`, D88).

## Add `agents/status-reader.md`; rewrite `status` skill

- Current `status` skill (`plugins/orcastrat/skills/status/SKILL.md`, 36 lines) does everything itself: reads plan.md and in-progress/blocked milestone files, Globs `<plan dir>/notes/*-failures.md` and counts `## Attempt ` lines with Grep, replies in a fixed block (`<plan title> — <plan status>` … `Next:` line), then lists open questions. Frontmatter: `model: haiku`, `disable-model-invocation: true`, `argument-hint: "<plan dir>"`. No `tools:` line (skills don't have one — they run in the main session).
- Spec §21 item 1 (`docs/orcastrat-execution-spec.md:459-463`): `status` skill drops `model:`; body only dispatches `status-reader` with the plan path (if given) then relays its report verbatim; no `context: fork`; output format for the user is unchanged.
- `status-reader` agent spec (Context + spec §21 item 1, §22 item 3): Haiku, read-only tools, allowed read-only `git log`/`git status` only (D13, D68). Reads plan.md, milestone/task Status fields, failure logs, both trailers (`Orcastrat-Task:`, `Orchestratinator-Task:`). Replies ≤ 20 lines, including `Failures:`.
- Tools per D68 / spec §22 item 3: "read-only file tools and the shell tool for short read-only commands only" → by the pattern of `scout`/`milestone-reviewer` (`Read, Glob, Grep, Bash`) but **no `Write`**, since spec §22 item 3 says status-reader/validator "reply inline and write nothing" — this differs from scout/reviewer, which get `Write` for their notes files. Existing reviewer-tier tools lines for comparison: `scout` → `Read, Glob, Grep, Bash, Write, WebFetch, WebSearch` (`plugins/orcastrat/agents/scout.md:7`); `scout-heavy`/`reviewer`/`milestone-reviewer` → `Read, Glob, Grep, Bash, Write` (`plugins/orcastrat/agents/scout-heavy.md:7`, `reviewer.md:7`, `milestone-reviewer.md:7`).
- `tests/orcastrat/agent-files.bats` is the existing regression harness (not yet updated for `status-reader`):
  - `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger'` (`tests/orcastrat/agent-files.bats:9`) — needs `status-reader` added (per its own header comment: "The task that brings an agent file up to date adds its name here", line 6-7).
  - `"no agent's tools line names a forbidden tool"` (line 161) — auto-covers any new agent via `"$AGENTS"/*.md` glob; forbidden pattern is `^(Agent|Task|Skill|Artifact|PowerShell)(\(.*\))?$` (line 41).
  - `"every agent file has the search and command bounds section"` (line 243) — auto-covers new agents via glob.
  - `"every agent file has a tools line and no disallowedTools line"` (line 254) — auto-covers new agents via glob.
  - `"non-worker agents allow exactly the tools of their role"` (line 193) and `"non-worker agents have the no-prototyping section"` (line 232) and `"non-worker agents cap their reply at 20 lines"` (line 308) all iterate `$NON_WORKER_AGENTS` only, so `status-reader` is invisible to them until added to that list, and the test's `case` statement (lines 196-203) needs a new `status-reader) expected=...` branch.
  - No test currently distinguishes agents that "write nothing" (no `Write` tool) from `scout`/`reviewer`-style note-writers; the tools-line test would need a `status-reader`-specific expected value once added.
  - `field`, `has_line`, `missing_lines`, `write_bounds`, `write_no_prototyping` helpers (lines 15-74) are the exact machinery any new `status-reader` checks would reuse.
- `## No prototyping or duplicate work` and `## Search and command bounds` sections: exact text to copy verbatim from `plugins/orcastrat/agents/scout.md:12-25` (or any current non-worker agent — text is identical across `scout.md`, `scout-heavy.md`, `reviewer.md`, `milestone-reviewer.md`).
- Frontmatter pattern for a Haiku agent (no `effort:` field — Haiku doesn't take one): `plugins/orcastrat/agents/worker-mini-serial.md:1-8` — `model: haiku`, `maxTurns: 50`, `tools: ...`, `omitClaudeMd: true`. Note `omitClaudeMd` appears only on worker agents (`worker-mini-serial.md:7`, `worker.md:8`), not on scout/reviewer-style agents — `status-reader` reads CLAUDE.md-adjacent files only incidentally (it reads plan.md/milestone files/failure logs, not source code), so no direct precedent settles whether it needs `omitClaudeMd`.
- No `maxTurns` value is specified anywhere in the Context/spec for `status-reader`; worker-mini-serial's is 50, reviewer's is 30 (`plugins/orcastrat/agents/reviewer.md:6`), scout's is 40 (`plugins/orcastrat/agents/scout.md:6`) — no exact number is given by any Decision.

## Investigate task: skill `model:` frontmatter grep

- Direct grep already run for this survey: `model: haiku` at `plugins/orcastrat/skills/status/SKILL.md:6`; `model: opus` at `plugins/orcastrat/skills/plan/SKILL.md:6`; `model: opus` at `plugins/orcastrat/skills/run/SKILL.md:6`. These are the only three skill files in `plugins/orcastrat/skills/` (glob confirms exactly `plan`, `run`, `status`), so this is the complete list Change 21.2's CHANGELOG inventory needs.

## `reference/plan-format.md`: `Instructions max lines` header field

- Header-fields table: `plugins/orcastrat/reference/plan-format.md:66-80`. Current rows end with `Max milestones` (line 79) then `Status` (line 80). The plan.md template's field list (lines 30-42) currently ends `Worktree setup`, `Status` — no `Max run time`/`Max tasks`/`Max milestones` shown in the template block itself (they're optional and documented only in the table, per D29: "a missing field takes its default").
- D29 (plan.md:114): "`Instructions max lines` absent (no threshold)" is the default — matches spec §17 item 4 (`docs/orcastrat-execution-spec.md:388`): "An optional header field, `Instructions max lines: <n>`, adds a size finding when the total loaded line count exceeds it."
- Table-row style to follow for the new field (`Max tasks` row, `plugins/orcastrat/reference/plan-format.md:78`): `| Max tasks | Optional: none (the default, also when the field is missing) or <n>. ... |`.
- Validation checklist item to consider updating: `plugins/orcastrat/reference/plan-format.md:316` — `"plan.md has every header field with a valid value, including Parallel, Max parallel, and Worktree setup."` — doesn't currently enumerate every optional field by name, so an addition may not be required there.

## Conflicts

None found — spec, plan.md Decisions, and current code agree on every point checked above.

## Unconfirmed

1. Whether `review.md`/`fix-prompt.md`/`ack` are written via the session's Write tool or via inline heredoc/`printf` shell commands — no precedent in the repo settles this, since instruction-file check output is explicitly never a shipped script (Change 19.6) and no other skill-instruction writes an out-of-repo file today.
2. Exact scan method for "every project instruction file Claude Code loads... resolved recursively" against the Claude Code docs' "CLAUDE.md files" page — not fetched (out of scope for this read-only survey; the implementing task/planner must confirm against the docs directly, as spec §17 item 2 requires).
3. `status-reader`'s exact `maxTurns` value and whether it needs `omitClaudeMd: true` — no Decision or spec text pins either.
4. Whether the toolchain/instruction-file/model checks insert strictly before `run`'s existing 2a items (active-run marker, clean-tree, etc.), or the clean-tree check is absorbed into/duplicates the new toolchain check's "for run only" bullet — Context and spec §20 item 6 both describe the toolchain check as including a clean-tree check "for run only," but `run`'s current 2a item 2 already has one (with the D109 exception baked in); the two are not reconciled in the sources I read.
