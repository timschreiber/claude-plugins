# M04: Worker tiers and agent prefix hygiene (Changes 4, 21)

- Status: outline
- Format: 2
- Goal: The plan has five tiers (`worker-mini`, `worker-light`, `worker`, `worker-heavy`, `specialist`) served by six worker agents, with the models, efforts and turn limits from Change 4's table. `run` dispatches `worker-mini` to `worker-mini-serial` or `worker-mini-parallel` by mode, and climbs the new ladder. The tier rubric is rewritten, and every reader of tier names is updated. Every existing agent has an explicit minimal `tools` allowlist in place of `disallowedTools`. Agent files hold every instruction that applies to every dispatch and nothing per-run, and dispatch messages carry only task-unique lines. The "before" dispatch sizes are recorded.
- Depends on: M03
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §5 (Change 4), §22 (Change 21), §1.4; Decisions D12, D13, D14, D28.

Tier table (Change 4):

| Plan tier | Agent | Model / effort | `maxTurns` |
|---|---|---|---|
| `worker-mini` | `worker-mini-serial` | Haiku, no effort | 50 |
| `worker-mini` | `worker-mini-parallel` | Sonnet / low | 50 |
| `worker-light` | `worker-light` | Sonnet / medium | 50 |
| `worker` | `worker` | Sonnet / high | 60 |
| `worker-heavy` | `worker-heavy` | Opus / medium | 80 |
| `specialist` | `specialist` | Opus / high | 80 |

- The ladder is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`. The three-rung cap and resume come in M05.
- Allowlists (Change 21.3, with D12: the shell tool is `Bash` only; D13: path limits are instructions only):
  - Workers: `Read, Edit, Write, Glob, Grep, Bash`.
  - `scout`: `Read, Glob, Grep, Bash, Write, WebFetch, WebSearch`.
  - `scout-heavy`, `reviewer`, `plan-reviewer`, `milestone-reviewer`: `Read, Glob, Grep, Bash, Write`.
  - `planner`: `Read, Glob, Grep, Write`.
  - Agents created later get theirs when they are created (D28): `merger` in M07, `status-reader` in M09, `validator` in M10, `decider` in M12.
- Quote every frontmatter value that contains `: ` (§1.4).
- Existing plans read the new tier meanings. There is no mapping and no format change (Change 4).
- Standing rule (Change 21.2): any later instruction that applies to every dispatch goes in the agent file, not the dispatch template. State this rule once in `run`.
- The README cast table is updated in M15, not here.

## Outline

- Record the "before" dispatch sizes (D14) in `plans/orcastrat-execution/notes/dispatch-sizes.md`, before any agent or dispatch template changes. Measure in characters, for one task per current tier from `plans/orchestratinator-robustness`: dispatch message + milestone file + `plan.md`.
- Add `agents/worker-mini-serial.md` and `agents/worker-mini-parallel.md`, built from the current worker body (literal-content transcription tasks).
- Update the frontmatter (`model`, `effort`, `maxTurns`, `description`, `tools`) of `worker-light`, `worker`, `worker-heavy` and `specialist` to the table.
- Replace `disallowedTools` with `tools` in `scout`, `scout-heavy`, `reviewer`, `plan-reviewer`, `milestone-reviewer` and `planner`.
- Move every instruction that `run` sends on every dispatch into the matching agent files, and trim `run`'s dispatch templates to task-unique lines. Remove any per-run content (dates, paths, plan names) from agent files.
- Rewrite the tier rubric in `reference/plan-format.md` per Change 4:
  - `worker-mini` only when Steps contain the literal final content;
  - `worker-light` is the default;
  - `worker` for intricate fully specified work;
  - `worker-heavy` and `specialist` each need a Why this tier line;
  - more than about one task in ten being `worker-heavy` or `specialist` means the milestone is under-specified;
  - plan the tier where the task is expected to succeed.
  Update the Tier field's valid values and the Tier adjustment text to match.
- Update every other place that names tiers: `run` (ladder, and choosing the `worker-mini` agent by serial or parallel mode), `plan`, `planner`, `plan-reviewer` (tier fit, and the one-in-ten rule), `milestone-reviewer`, `status`. A worker that returns no report counts as a failed attempt in `run`.
