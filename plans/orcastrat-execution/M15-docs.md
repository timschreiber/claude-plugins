# M15: Docs, CHANGELOG, CLAUDE.md (§28, Change 23)

- Status: outline
- Format: 2
- Goal: The plugin README documents everything §28 lists, including the Prerequisites section (Change 23, placed before Install), "During a run" (Change 22), the Windows notes (D08), and the cast table with models, efforts and tool allowlists. The CHANGELOG's Unreleased section has the *Added*, *Changed* and *Removed* entries from §28, including the runtime inventory, the model-pin grep, and the before and after dispatch sizes. CLAUDE.md describes the plugin as it now is. `Validate-All.ps1` and the bats tests pass.
- Depends on: M14
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §28 (Docs), §24 (Change 23), §23 item 2 (Change 22), §20 item 10, §22 items 3–4, §9 (README notes on one run per checkout), §30 (Validate-All and tests); Decisions D08, D09, D12, D14, D20, D26, D34.

- Prerequisites, before `## Install`, covering Change 23 items 1–10:
  - "Tested with Claude Code 2.1.281" (D09).
  - The preflight table's wording matches the toolchain check's actual messages in the `run` and `plan` skills (M09). Copy them from there.
- "During a run": Change 22.2's seven points.
- Windows notes (D08):
  - Defender exclusions for the repo, `.git/orcastrat/`, and package caches (`~/.m2`, `~/.gradle`, the npm cache, the NuGet cache).
  - The caution that exclusions turn off real-time scanning, so only exclude trusted repos and caches.
  - Memory ≈ one build × `Max parallel`.
  - The worktree file-lock note.
  Prerequisites item 7 links here.
- The cast table: every skill and agent with model, effort and tool allowlist, taken from the agent files' frontmatter as they are after M14. The README says workers re-read CLAUDE.md on every task (Change 21.4).
- CHANGELOG, under `## [Unreleased]`: new entries prefixed `orcastrat:` (D20), and the rename entry from M01 kept.
  - *Added* and *Changed*: the lists in §28.
  - *Removed*: the soft-reset guard; runtime PowerShell, with the inventory from M02's investigate note (D34: none existed).
  - Also included: the model-pin grep from M09's investigate note and the dispatch sizes from `notes/dispatch-sizes.md` (D14).
- CLAUDE.md (D26):
  - update the plugin's description (skills, agents, hooks, bash scripts; no longer "pure Markdown");
  - add `bash scripts/run-bats.sh` (D02) to Commands;
  - describe `.github/workflows/orcastrat.yml` next to the existing CI paragraph.
- Leave the "Formerly Orchestratinator" note and the upgrade section from M01 in place.

## Outline

- README: Prerequisites (Change 23), before `## Install`.
- README: how commits work; resume, the ladder, the failure log, and LIMIT (including `Max milestones`); parallel defaults, conflict handling, and the serial fallback; Windows notes.
- README: resuming a run (the `next` script, and that a fresh session picks up from the plan files and git, D79); task briefs, report files, `DONE_WITH_CONCERNS`, rubric-scored reviews with the validator, the run report; the Stop hook (heartbeat, loop guard, one active run per checkout); the decider, auto-decide and its limit, and that planning questions are always answered by the user.
- README: the interview, write-back, `--skip-interview`; targeted Verify; the instruction-file check and what to do about its findings; "During a run"; the cast table with allowlists.
- CHANGELOG *Added*, *Changed* and *Removed* entries per §28, with the inventory, model-pin grep, and dispatch sizes.
- CLAUDE.md updates per D26.
