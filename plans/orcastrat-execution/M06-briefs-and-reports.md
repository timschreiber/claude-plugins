# M06: Task briefs and report files (Changes 7, 9)

- Status: outline
- Format: 2
- Goal: `task-brief` writes each task's brief inside `.git`, with bats tests. `run` generates a brief before every dispatch, names it with `Brief:`, and regenerates it when Decisions changed. Workers and the per-task reviewer read the brief instead of plan files. Workers write report files with RED and GREEN evidence and reply in at most 10 lines. `DONE_WITH_CONCERNS` triggers a review. `RED: CONFIRMED` without RED evidence fails the attempt. Other agents write long output to notes files and reply in at most 20 lines. Notes are committed before the next dispatch, and the "after" dispatch sizes are recorded. A `next` script, with bats tests, tells `run` where the run is, so it never re-reads plan.md or the milestone file to find its place, and every bookkeeping step resumes from git (Change 25).
- Depends on: M05
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §8 (Change 7), §10 (Change 9), §22 item 2 (invariant instructions in agent files); Decisions D04, D05, D14, D32, D79 (spec §25a, Change 25).

- `task-brief <plan-dir> <task-id>` writes `<git-common-dir>/orcastrat/<plan-slug>/briefs/<task-id>.md`. The brief contains `plan.md`'s Decisions, the milestone's whole Context section (which will carry the Conventions block, D32, from M14), and the task block: fields, Objective, Read first, Interfaces, Steps, Done when. The script prints the brief's absolute path through `print_path`, and nothing else on success (D43, D44). Other paths `run` hands to agents (the report and the failure log) follow D43 too. It follows M02's bash rules and has bats tests.
- Workers and the reviewer still re-read CLAUDE.md and AGENTS.md first, and still read everything in Read first.
- The orchestrator finds its place with `next` (D79), never reads plan.md's Decisions, and reads only the current task's block when it needs a field `next` doesn't print.
- The report file is `plans/<slug>/notes/reports/<task-id>.md`. It covers: what was implemented; files changed; RED evidence (command and failing output); GREEN evidence (command and passing output); self-review; concerns. Resumes append to it. It is always in scope, and `run` includes it in the status commit (M05 already scopes it).
- The worker reply is the status block plus the report path, at most 10 lines. The new status is `DONE_WITH_CONCERNS`.
- Every-dispatch instructions go in agent files, not the dispatch (Change 21.2 standing rule, M04).
- D14: append the "after" sizes (dispatch message + brief, in characters, for the same tasks M04 measured) to `plans/orcastrat-execution/notes/dispatch-sizes.md`.

## Outline

- `task-brief` script and `tests/orcastrat/task-brief.bats`.
- `next` script and `tests/orcastrat/next.bats` (D79, spec §25a item 1), with a fixture plan for each state in spec §25a item 5. `next` sources `lib/common` and prints paths through `print_path`.
- `run`: find its place with `next` at start, before each wave, after compaction and on a Stop-hook return, replacing the operating rule that re-reads plan.md and the milestone file; stop reading plan.md's Decisions (spec §25a item 2).
- `run`: the resume-from-git checks for every bookkeeping step (spec §25a item 3): committed notes skip their agent, a detailed-but-uncommitted milestone is validated and committed, `recover` results are applied, uncommitted work in a task's Files is a failed attempt.
- `run`: generate the brief before each dispatch; the dispatch carries `Brief: <path>` plus the other task-unique lines. Reuse the brief on resumes and retries, but regenerate it when `plan.md`'s Decisions changed since it was generated.
- `run`: read only plan.md's header fields and, when a field `next` doesn't print is needed, the current task block; never plan.md's Decisions, at start or otherwise (D79).
- Worker agents (all six) and `reviewer`: read the brief instead of `plan.md` and the milestone file; write the report file; the reply format with `DONE_WITH_CONCERNS`; RED evidence required for `RED: CONFIRMED`.
- `run`: handle `DONE_WITH_CONCERNS` like `DONE`, plus a `reviewer` dispatch with the concerns, where a FAIL is a failed attempt. Fail the attempt with `RED not confirmed` when the report lacks RED evidence. The failure log and resume messages point to the report file.
- `scout`, `scout-heavy`, `planner`, `reviewer`, `plan-reviewer`, `milestone-reviewer`: write anything long to a file under `plans/<slug>/notes/` and reply with a status block and the path, in at most 20 lines. Agents created later (`merger`, `validator`, `decider`, `status-reader`) follow the same rule when created.
- `run`: commit any notes file an agent or `run` wrote in the next bookkeeping commit, before the next dispatch.
- Record the "after" dispatch sizes (D14).
