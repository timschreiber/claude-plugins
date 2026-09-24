# M07: Parallel waves and dispatch order (Changes 5, 22)

- Status: blocked
- Format: 2
- Goal: Parallel waves follow Change 5's mechanism. Workers commit in worktrees under `<git-common-dir>/orcastrat/<plan-slug>/worktrees/`. `run` checks each task branch, then integrates in task order with `integrate` (multi-commit). A new `merger` agent handles conflicts, falling back to a serial rerun at the tier that succeeded. A containment failure downgrades the run to serial without stopping it. The default for plans written from now on is `Max parallel: 2`. The plan format says tiny tasks are batched rather than parallelized. Same-tier tasks are dispatched back to back within a wave.
- Depends on: M06
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §6 (Change 5), §23 item 1 (Change 22), §22 item 3 (the `merger` allowlist); Decisions D05, D12, D13, D17, D18, D29.

- D48, D66: the new agent file gets the `## Search and command bounds` section and the `## No prototyping or duplicate work` section (both added in M04), and its `tools` line names no `Agent`, `Task`, `Skill` or `Artifact`; `tests/orcastrat/agent-files.bats` checks all three.

- Worktrees: `git worktree add -b <task branch> <path> BASE`, under `<git-common-dir>/orcastrat/<plan-slug>/worktrees/`. The task branch is `orcastrat/<plan-slug>/<task-id>` (D18). Worktree setup sets `ORCASTRAT_MAIN` and `ORCHESTRATINATOR_MAIN` (D17). The dispatch carries `Worktree: <path>`, and workers keep the "cd into it for every command" rules.
- Per task, in its worktree: `scope-check`, `verify` and `push-check` (M03 scripts, directory argument per D05).
- Integration: `integrate <task-branch> <BASE>`, in task order, onto the plan branch. The old "exactly one commit" check is removed, since tasks may have several commits.
- `merger`:
  - Frontmatter: `model: sonnet`, `effort: high`, `tools: Read, Glob, Grep, Edit`. No shell; `run` does all git steps. The spec gives no `maxTurns`, so the file sets none.
  - Input: the Objective, Steps and Interfaces of the task being merged, the same for each already-merged task touching the same files, and the conflicted files. It edits only the conflicted files.
  - Its reply follows M06's 20-line rule.
- Merge failure (the merger can't resolve it, or the re-verify fails): abort the cherry-pick, discard the task branch, and rerun the task serially on the integrated result at the tier that succeeded. This is not a failed attempt and doesn't stop the run.
- Containment: after each worker returns, the main checkout must be clean and on the plan branch. If it isn't:
  - reset it to the wave's starting commit and clean it;
  - discard the wave's worktrees;
  - rerun the wave's tasks serially;
  - switch the rest of the run to serial, reporting it in one line.
  No Stop.
- Keep the combined re-verify after each wave and the cleanup of integrated worktrees.
- Dispatch order: when a wave's tasks can run in any order, dispatch same-tier tasks back to back. Serial execution and commit order follow that grouping. Parallel integration stays in task order.
- `worker-mini` in a parallel wave dispatches `worker-mini-parallel` (M04).

## Outline

- Add `agents/merger.md` with the frontmatter and instructions above.
- `run`: rewrite the parallel section (worktree creation, dispatch, per-task checks, integration via `integrate`, conflict handling via `merger` with the serial-rerun fallback, containment check and downgrade, combined re-verify, cleanup).
- `run`: bring resume, the three-rung ladder, the failure log and escalation commits to parallel tasks (D82), and make a scope violation in a parallel wave a failed attempt (D83).
- `run`: same-tier grouping of dispatch order in serial and parallel modes.
- `reference/plan-format.md`, `plan` skill, `planner`: `Max parallel` default 2 for new plans (D29), and "waves with only tiny tasks are batched (`Batch: yes`) rather than parallelized".
- Worker agents: the worktree rules, conditional on a `Worktree:` line (already there; confirm they follow Change 21.2).
