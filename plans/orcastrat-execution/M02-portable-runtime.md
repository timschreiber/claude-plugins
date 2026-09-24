# M02: Portable runtime foundation (Change 19)

- Status: outline
- Format: 2
- Goal: The portability rule is in place and enforced. The inventory of scripts and embedded commands is recorded. Every command that skills and agents tell Claude to run is a single-line call to a script or to `git`, with no `$(...)` and no multi-line bash (except the Change 6 steps M03 replaces). `plan` and `planner` write Verify commands that run from bash, and the plan-reviewer flags non-bash Verify syntax as advisory. A bats harness exists under `tests/orcastrat/` with a passing no-PowerShell test. `.github/workflows/orcastrat.yml` runs the checks on three OSes, and `Validate-All.ps1` has the same no-`.ps1` check.
- Depends on: M01
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §20 (Change 19) items 1–4 and 7–9, §1.6, §31; Decisions D02, D03, D11, D22, D34, D41, D43, D44. Item 5 (hooks) is built in M08, item 6 (the toolchain check) in M09 (D40), and item 10 (README) in M15.

- Shipped runtime means bash 3.2 compatible code plus `git` and `grep`, `sed`, `awk`, `tail`, `head`, `date`, `mkdir`, `rm`, `cat`. No associative arrays, no `mapfile`, no `${var,,}`. No `pwsh`, `powershell`, `jq`, Node or Python at runtime.
- Dev tooling (`scripts/*.ps1`) stays PowerShell and lives outside the plugin. Nothing the plugin ships may invoke it.
- D34: the plugin has no runtime PowerShell today, so Change 19.2 deletes nothing. The inventory records that.
- Paths such as `$(git rev-parse --git-dir)/…` in the spec describe what scripts resolve internally. In skill and agent text, describe them by intent instead ("the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>`").
- The `cd "<worktree>" && <command>` rule for workers in parallel waves stays; spec §6 item 2 keeps it. It is a single line with no command substitution.
- Commands that a Change 6 script replaces in M03 are left for M03: the "Verify a command" definition and its log paths, the scope checks, the push check, and the recovery grep in `run`. The inventory marks each of them `replaced in M03`.
- Bats runs only through `bash scripts/run-bats.sh` (D02), with the tag pinned per D41. shellcheck runs only in CI. No npm or Node.
- `plugins/orcastrat/scripts/lib/common` holds `print_path` (D43, D44). Every script sources it. Scripts may use `$(...)` internally.

## Outline

- Investigate: run `git ls-remote --tags https://github.com/bats-core/bats-core`, and record the highest release tag that isn't a pre-release, with that URL, in the investigate note (D41).
- Add `scripts/run-bats.sh` per D02, pinned to the recorded tag, and add `.tools/` to `.gitignore`. This comes before any `.bats` task, since every later Verify uses it.
- Add `plugins/orcastrat/scripts/lib/common` with `print_path <path>` (D44), and `tests/orcastrat/lib-common.bats`, which uses a stub `cygpath` on `PATH` to assert both the `cygpath -m` form and the pass-through form.
- Investigate: inventory every script and every embedded command line under `plugins/orcastrat/` (skills, agents, reference, README). Give each its `path:line`, runtime or dev tooling, whether it uses `$(...)`, multi-line bash, or `pwsh`/`powershell`/`.ps1`, and whether a Change 6 script replaces it in M03. Write this to the investigate note. M15 copies it into the CHANGELOG.
- Rewrite every inventoried runtime command not marked `replaced in M03` into a single-line call to a script or to `git`, or into an intent description, in the skill and agent files that contain it.
- In `reference/plan-format.md`, and in the `plan` skill and `planner` agent, state that Verify commands run with `bash -c` from the repo root, and that PowerShell projects call their tooling explicitly (for example `pwsh -NoProfile -File scripts/verify.ps1`). In `plan-reviewer`, add an advisory check for a Verify that relies on non-bash syntax.
- Add `tests/orcastrat/test_helper.bash`, with a helper that creates a temporary fixture git repo with a commit identity. Add `tests/orcastrat/no-powershell.bats`, which implements D11: no `.ps1` under `plugins/orcastrat/`, and no `pwsh` or `powershell` (case-insensitive) under `plugins/orcastrat/scripts/` or `plugins/orcastrat/hooks/`. The test passes when those directories don't exist yet.
- Add `.github/workflows/orcastrat.yml` per D22. Triggers: `push` on all branches, and `pull_request`. A matrix over `ubuntu-latest`, `macos-latest` and `windows-latest`, using Git Bash on Windows, runs `bash scripts/run-bats.sh`. A `shellcheck` job on `ubuntu-latest` checks every file under `plugins/orcastrat/scripts/` and `plugins/orcastrat/hooks/` except `hooks.json`, and succeeds when there are none yet. `validate.yml` is unchanged.
- Add the D11 check to `scripts/Validate-All.ps1` as its own `== orcastrat portability` step, which fails the run on a violation.
