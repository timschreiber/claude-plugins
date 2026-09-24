# M09: Preflight checks and status delegation (Changes 19.6, 16, 20)

- Status: outline
- Format: 2
- Goal: Every `plan` and `run` starts with the toolchain check, then the instruction-file check, then the model check, in that order and before anything else. `run` writes its marker only after all three and "Proceed?". The instruction-file check writes `review.md`, `fix-prompt.md` and `ack` inside `.git`, prompts only when findings are new or changed, and never edits instruction files. No skill pins a model. `status` dispatches a new Haiku `status-reader` agent and relays its report.
- Depends on: M08
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §20 item 6 (toolchain check), §17 (Change 16), §21 (Change 20), §22 item 3 (`status-reader` allowlist); Decisions D12, D13, D29, D30, D40.

- These checks are skill instructions that run commands directly through the session's shell tool, not shipped scripts. Change 19.6 says the toolchain check "is never a shipped script". Change 19's rule is to prefer the shell tool over a new script, and Change 6 lists every new script.
- Toolchain check:
  - `bash --version` ≥ 3.2.
  - `git --version` ≥ 2.17.
  - `git rev-parse --is-inside-work-tree` succeeds.
  - `git config user.name` and `git config user.email` both resolve.
  - For `run` only, the clean-tree check (from M05).
  - On failure, `run` stops with `SETUP`; `plan` exits before surveying, but a missing or old bash only warns in `plan`. Nothing is created either way.
  - One message lists every failed item with its per-platform fix: Git for Windows on native Windows; the system package manager elsewhere; `git init`; the `git config` commands.
- Instruction-file check (Change 16):
  - Files checked: root and nested CLAUDE.md, CLAUDE.local.md, AGENTS.md, and `@` imports resolved recursively. Confirm the list against the Claude Code docs' "CLAUDE.md files" page. `~/.claude/CLAUDE.md` is reported separately, as information.
  - Leanness findings, with the spec's action table. Conflicts, with the actions given.
  - `Instructions max lines` is an optional header field (D29).
  - Outputs go in `<git-common-dir>/orcastrat/instructions/`: `review.md`, `fix-prompt.md` (with the standard prompt rules spelled out), and `ack` (files, `git hash-object` hash, findings summary, choice).
  - Prompt through AskUserQuestion (Stop and fix it / Continue) only when there are findings and the hash isn't acknowledged. Never prompt under `--yes`. The conflicts line shows on every invoke.
  - `plan` does the full review. `run` rehashes and compares against `ack`, and does the full review only on a change.
  - Never edit instruction files.
- Model check (D30):
  - After the instruction-file check, confirm the session is on an Opus model.
  - Interactively, AskUserQuestion: **Stop** or **Continue on this model**.
  - Under `--yes`, `run` appends `model-notice <UTC> <session model>` to `notes/run-log.md` (D42), and `plan` writes the notice in its plan summary. Both continue.
- `status-reader`:
  - Frontmatter: `model: haiku`, `tools: Read, Glob, Grep, Bash`, read-only `git log` / `git status` by instruction (D13).
  - It reads `plan.md`, milestone and task Status fields, failure logs, and both trailers (`Orcastrat-Task:`, `Orchestratinator-Task:`).
  - It returns at most 20 lines, including `Failures:`.
- The `status` skill drops `model:`, dispatches `status-reader` with the plan path, and relays its report verbatim. The output format is unchanged. No `context: fork`.
- Remove `model:` from `plan`, `run` and `status`. Agents keep their pins.

## Outline

- `run` and `plan`: the toolchain check as the first preflight step, with the messages above.
- `plan`: the full instruction-file check and its outputs, prompt, `--yes` handling and conflicts line.
- `run`: the quick instruction-file check (rehash and compare `ack`), falling back to the full review on a change.
- `run` and `plan`: the model check, and removal of their `model:` pins.
- Add `agents/status-reader.md`. Rewrite the `status` skill to dispatch it, with no `model:`.
- An investigate task, run before the pins are removed, records every skill's `model:` frontmatter (a grep with `path:line`) in its note, for the CHANGELOG (M15).
- `reference/plan-format.md`: the `Instructions max lines` header field.
