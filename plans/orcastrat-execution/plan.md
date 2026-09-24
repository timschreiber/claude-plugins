# Plan: Orcastrat execution changes

- Goal: `plugins/orchestratinator/` is renamed to `plugins/orcastrat/` and implements every change in `docs/orcastrat-execution-spec.md` (Changes 1–24): workers commit their own work and are resumed before escalating on a three-rung ladder; five plan tiers on six worker agents; parallel waves rebuilt with cherry-pick integration, a `merger`, and a serial fallback; bash bookkeeping scripts (`scope-check`, `push-check`, `verify`, `integrate`, `recover`, `task-brief`, `run-report`, `run-state`) with bats tests; task briefs, report files and `DONE_WITH_CONCERNS`; a Stop hook that keeps runs going; rubric-scored reviews checked by a `validator`; a run report; a `decider` for GAPs; targeted Verify; the planning interview with spec write-back; the batch pilot; the instruction-file, toolchain and model checks; conventions excerpts; rule and hook suggestions; `status` delegating to `status-reader`; minimal tool allowlists; a three-OS CI workflow. The shipped runtime is bash 3.2 plus `git` only, the README and CHANGELOG describe it all, and `./scripts/Validate-All.ps1` and the bats tests pass.
- Sources: `docs/orcastrat-execution-spec.md`
- Branch: orcastrat-execution
- Final verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Detailing: rolling
- Gates: detail
- Parallel: off
- Max parallel: 3
- Worktree setup: none
- Status: in-progress

## Milestones

| ID | Title | Status | File |
|---|---|---|---|
| M01 | Rename to Orcastrat (Change 24) | done | M01-rename.md |
| M02 | Portable runtime foundation (Change 19) | ready | M02-portable-runtime.md |
| M03 | Git bookkeeping scripts (Change 6) | outline | M03-git-scripts.md |
| M04 | Worker tiers and agent prefix hygiene (Changes 4, 21) | outline | M04-tiers-and-agent-hygiene.md |
| M05 | Worker commits, resume, runaway guard (Changes 1, 2, 3) | outline | M05-commits-resume-runaway-guard.md |
| M06 | Task briefs and report files (Changes 7, 9) | outline | M06-briefs-and-reports.md |
| M07 | Parallel waves and dispatch order (Changes 5, 22) | outline | M07-parallel-waves.md |
| M08 | Stop hook (Change 8) | outline | M08-stop-hook.md |
| M09 | Preflight checks and status delegation (Changes 19.6, 16, 20) | outline | M09-preflight-checks.md |
| M10 | Scored reviews and the validator (Change 10) | outline | M10-scored-reviews.md |
| M11 | Run report and rule suggestions (Changes 11, 18) | outline | M11-run-report-and-suggestions.md |
| M12 | The decider (Change 12) | outline | M12-decider.md |
| M13 | Targeted Verify and the planning interview (Changes 13, 14) | outline | M13-targeted-verify-and-interview.md |
| M14 | Batch pilot and conventions excerpts (Changes 15, 17) | outline | M14-batch-pilot-and-conventions.md |
| M15 | Docs, CHANGELOG, CLAUDE.md (§28, Change 23) | outline | M15-docs.md |

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: goal, replaces the isolation and best-practices specs → M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14, M15
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only → M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14
- `docs/orcastrat-execution-spec.md` §1.2: plan format is a contract, every reader updated per milestone → M04, M05, M06, M07, M10, M12, M13, M14
- `docs/orcastrat-execution-spec.md` §1.3: no design decisions below the plan; decider only recommends → M05, M12
- `docs/orcastrat-execution-spec.md` §1.4: frontmatter is valid YAML → M01, M04, M07, M09, M10, M12
- `docs/orcastrat-execution-spec.md` §1.5: cost is display-only → M05, M11
- `docs/orcastrat-execution-spec.md` §1.6: shipped runtime portable → M02, M03, M06, M08, M11
- `docs/orcastrat-execution-spec.md` §2: Change 1, workers commit; clean tree; BASE; scope check; status commit with trailer; failed-attempt reset; push check; soft-reset guard removed → M05
- `docs/orcastrat-execution-spec.md` §3: Change 2, resume once before escalating, with fallback → M05
- `docs/orcastrat-execution-spec.md` §4: Change 3, three-rung ladder, failed-attempt definition, worker breaker, failure log, escalation context, limits, status Failures line → M05
- `docs/orcastrat-execution-spec.md` §5: Change 4, five tiers on six agents, ladder, tier rubric, every tier reader → M04
- `docs/orcastrat-execution-spec.md` §6: Change 5, parallel waves, merger, containment, defaults → M07
- `docs/orcastrat-execution-spec.md` §7: Change 6, git scripts (`scope-check`, `push-check`, `verify`, `integrate`, `recover`) → M03
- `docs/orcastrat-execution-spec.md` §7: Change 6, `task-brief`, `run-report`, Stop hook script → M06, M08, M11
- `docs/orcastrat-execution-spec.md` §8: Change 7, task briefs → M06
- `docs/orcastrat-execution-spec.md` §9: Change 8, Stop hook, marker, heartbeat, loop guard → M08
- `docs/orcastrat-execution-spec.md` §10: Change 9, report files, `DONE_WITH_CONCERNS`, RED evidence, reply caps, notes committed → M06
- `docs/orcastrat-execution-spec.md` §11: Change 10, rubric, blocking candidates, `validator` → M10
- `docs/orcastrat-execution-spec.md` §12: Change 11, run report → M11
- `docs/orcastrat-execution-spec.md` §13: Change 12, decider and auto-decide → M12
- `docs/orcastrat-execution-spec.md` §14: Change 13, targeted Verify → M13
- `docs/orcastrat-execution-spec.md` §15: Change 14, interview, completeness checks, question rules, write-back → M13
- `docs/orcastrat-execution-spec.md` §16: Change 15, batch pilot → M14
- `docs/orcastrat-execution-spec.md` §17: Change 16, instruction-file check → M09
- `docs/orcastrat-execution-spec.md` §18: Change 17, conventions excerpts → M14
- `docs/orcastrat-execution-spec.md` §19: Change 18, recurring findings suggest a rule or hook → M11
- `docs/orcastrat-execution-spec.md` §20: Change 19 items 1–4, 7–9, portable runtime foundation → M02
- `docs/orcastrat-execution-spec.md` §20: Change 19 item 5, hook invocation and path normalization → M08
- `docs/orcastrat-execution-spec.md` §20: Change 19 item 6, preflight toolchain check → M09
- `docs/orcastrat-execution-spec.md` §20: Change 19 item 10, README prerequisites → M15
- `docs/orcastrat-execution-spec.md` §21: Change 20, `status` delegation, no model pins, Opus check → M09
- `docs/orcastrat-execution-spec.md` §22: Change 21, agent prefix hygiene and allowlists → M04, M07, M09, M10, M12
- `docs/orcastrat-execution-spec.md` §23: Change 22, same-tier dispatch order → M07
- `docs/orcastrat-execution-spec.md` §23: Change 22, README "During a run" → M15
- `docs/orcastrat-execution-spec.md` §24: Change 23, README Prerequisites → M15
- `docs/orcastrat-execution-spec.md` §25: Change 24, rename to Orcastrat → M01
- `docs/orcastrat-execution-spec.md` §26: out of scope → out of scope (D38)
- `docs/orcastrat-execution-spec.md` §27: dropped or deferred → out of scope (D39)
- `docs/orcastrat-execution-spec.md` §28: README and CHANGELOG → M15
- `docs/orcastrat-execution-spec.md` §29: build order, serial build → M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14, M15
- `docs/orcastrat-execution-spec.md` §30: Validate-All passes, script tests pass → M15
- `docs/orcastrat-execution-spec.md` §30: CI green on three OSes, real run in a scratch repo → out of scope (D09)
- `docs/orcastrat-execution-spec.md` §31: repo conventions → M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14, M15
- `docs/orcastrat-execution-spec.md` §32: decisions made in the spec → M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14, M15

## Decisions

- D01: The plan runs on branch `orcastrat-execution`, created fresh from `main`. (source: user, Q1; spec §27)
- D02: Bats runs through the dev script `scripts/run-bats.sh` (bash), both locally and in CI. If `.tools/bats-core` is missing, it clones `https://github.com/bats-core/bats-core` at a pinned tag into that directory (`.tools/` is added to `.gitignore`), then runs `.tools/bats-core/bin/bats`: `-r tests/orcastrat` with no arguments, or the given arguments passed through (for example `bash scripts/run-bats.sh tests/orcastrat/verify.bats`). Final verify, every Milestone verify, and script-task Verify commands call `bash scripts/run-bats.sh …`. No npm or Node anywhere. shellcheck runs only in CI, using the copy preinstalled on `ubuntu-latest`. This replaces the npm install from the first answer to Q2. (source: user, Q2, Q31, Q32a)
- D03: Bats tests live at the repo root in `tests/orcastrat/*.bats`, outside the plugin, so they are not copied into users' plugin cache. Test fixtures go under `tests/orcastrat/fixtures/`. (source: user, Q3)
- D04: Shipped scripts keep the spec's extensionless names under `plugins/orcastrat/scripts/` (`scope-check`, `push-check`, `verify`, `integrate`, `recover`, `task-brief`, `run-report`, `run-state`) and are always invoked as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" ...`. The Stop hook script is `plugins/orcastrat/hooks/stop-guard`. (source: user, Q4)
- D05: Script signatures: `scope-check <dir> <base> <files...>`, `push-check <dir> <base>`, `verify <plan-dir> <dir> <command>` (the plan slug is the last path component of `<plan-dir>`; `<command>` is one argument passed to `bash -c`). `integrate <task-branch> <base>`, `recover <plan-dir>`, `task-brief <plan-dir> <task-id>` and `run-report <plan-dir>` are as in the spec. (source: user, Q5)
- D06: A script `run-state` (built in M05) manages run state. `run-state start <plan-dir>` writes `<git-dir>/orcastrat/active-run` (per-checkout `git rev-parse --git-dir`) as `key=value` lines `plan=<plan-dir>`, `started=<UTC epoch seconds>`, `heartbeat=<UTC epoch seconds>`, `blocks=0`, `block_heartbeat=`; `run-state beat` updates `heartbeat`; `run-state elapsed` prints whole minutes since `started`; `run-state end <PAUSE|STOP|COMPLETE> <reason>` deletes the marker. `start` and `end` also append one line each to `plans/<slug>/notes/run-log.md`, which `run-report` reads. When the Stop hook's loop guard releases, it replaces the marker with `<git-dir>/orcastrat/active-run.released`, holding one line with the reason. The hook's fast path tests `$CLAUDE_PROJECT_DIR/.git/orcastrat/active-run` directly when `.git` is a directory, and reads the `gitdir:` line of `.git` with `sed` when `.git` is a file (a worktree); it never runs git on that path. (source: user, Q6)
- D07: `run` appends one line per returned agent to `plans/<slug>/notes/run-log.md` (task or milestone, agent, tokens, duration, from the task notification), and `run-report` sums them in its usage section. (source: user, Q6b)
- D08: The README gets a "Windows notes" section covering: Defender exclusions for the repo, `.git/orcastrat/`, and package caches (`~/.m2`, `~/.gradle`, the npm cache, the NuGet cache); a caution that an exclusion turns off real-time scanning for that path, so only exclude repos and caches you trust; that each concurrent task runs its own build, so memory needed ≈ one build × `Max parallel`; and the existing worktree file-lock note. (source: user, Q7)
- D09: Final verify is `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`. The README's "tested with" line uses Claude Code 2.1.281 (from `claude --version` on 2026-09-23); Tim updates it after his §30 run. CI green on three OSes (needs a push, which runs never do), the §30 real run in a scratch repo, and the Change 21.3 allowlist confirmation are Tim's post-build steps, not tasks. (source: user, Q8)
- D10: There are no mascot images in the repo (`docs/images/` holds only `denoizinator-doof.webp`), so Change 24.7 needs no work. (source: user, Q9)
- D11: The no-`.ps1` / no-runtime-`pwsh` check (CI and `Validate-All.ps1`) scans only `plugins/orcastrat/`: it fails on any `.ps1` file there, and on `pwsh` or `powershell` (case-insensitive) inside `plugins/orcastrat/scripts/` and `plugins/orcastrat/hooks/`. Prose in skills, agents and the README is not scanned. (source: user, Q10)
- D12: Agent `tools` allowlists name the shell tool as `Bash` only, never `PowerShell`: bash is a hard requirement for `run` (Change 19), and scripts and Verify run through bash. This overrides "the platform shell tool" in Change 21.3. (source: user, Q11a)
- D13: Path and command limits within an allowlist ("write only its notes file", "read-only commands", "only the milestone file it details") are enforced by agent instructions only, with no tool path patterns. (source: user, Q11b)
- D14: Dispatch sizes for the CHANGELOG (Change 21.2) are measured on one task per tier from `plans/orchestratinator-robustness`, in characters: before = dispatch message + milestone file + `plan.md`; after = dispatch message + brief. M04 records the before sizes and M06 the after sizes in `plans/orcastrat-execution/notes/dispatch-sizes.md`; M15 copies them into the CHANGELOG. (source: user, Q12)
- D15: A batch pilot runs serially in the main checkout, so a `worker-mini` pilot uses `worker-mini-serial`. (source: user, Q13)
- D16: Both `plan` and `planner` write the Conventions block in every milestone they detail. (source: user, Q14)
- D17: The Worktree setup environment variable is renamed to `ORCASTRAT_MAIN`, and `run` also sets `ORCHESTRATINATOR_MAIN` to the same value, so setup commands in plans written before the rename keep working. (source: user, Q15a)
- D18: Task branches become `orcastrat/<plan-slug>/<task-id>`. (source: user, Q15b)
- D19: The root `README.md` is renamed too. `docs/orchestratinator-robustness-spec.md`, the other findings docs, and `plans/` stay untouched as history. (source: user, Q15c)
- D20: The two existing `CHANGELOG.md` lines beginning `orchestratinator:` stay as written. The rename goes under *Changed*, and new entries are prefixed `orcastrat:`. (source: user, Q15d)
- D21: The review rubric's canonical text lives in `plugins/orcastrat/reference/review-rubric.md` and is copied verbatim, between `<!-- rubric:start -->` and `<!-- rubric:end -->` markers, into `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator`. A bats test fails when any copy differs from the canonical text. (source: user, Q16)
- D22: CI adds a new workflow, `.github/workflows/orcastrat.yml`, triggered on `push` (all branches) and `pull_request`: the bats tests and the no-`.ps1` check on `ubuntu-latest`, `macos-latest` and `windows-latest` (Git Bash), through `bash scripts/run-bats.sh` (D02); `shellcheck` on `ubuntu-latest` only. `validate.yml` is unchanged. (source: user, Q17, Q31)
- D23: Change 1 removes only the soft-reset part of the stray-commit guard. The branch check and the `STRAY` stop reason stay: workers are still forbidden to switch branches. (source: user, Q18)
- D24: The `Batch` task field takes either `yes` (one multi-file task of same-kind edits, as today, with no pilot) or `<id>` (a group of separate same-template tasks sharing that id; the first in task order is the pilot, Change 15). Existing plans stay valid. (source: user, Q19)
- D25: `marketplace.json` gets `"renames": {"orchestratinator": "orcastrat"}` (CLAUDE.md's rename rule), and `claude plugin validate` must accept it. The manual migration steps stay as the fallback. If Claude Code applies the map to existing installs automatically, the README's "Upgrading from Orchestratinator" section says so. (source: user, Q20)
- D26: M01 updates CLAUDE.md's plugin name. M15 updates CLAUDE.md's description of the plugin (it gains hooks and bash scripts), adds the bats command to its Commands section, and describes the new CI workflow. (source: user, Q21)
- D27: The `isolation-changes` branch named in spec §27 does not exist, locally or on the remote. No work depends on it. (source: user, Q22)
- D28: Milestone structure: §29's 11 steps in order, with steps 5, 7, 8 and 10 each split into two consecutive milestones (M05/M06, M08/M09, M10/M11, M13/M14), giving 15 milestones. The allowlists of agents created in later milestones (`merger`, `validator`, `status-reader`, `decider`) are set when each agent is created. (source: user, Q23)
- D29: New plan.md header fields are optional, and a missing field takes its default: `Max run time: none`, `Max tasks: none`, `Max milestones: none`, `Auto-decide: off`, `Max auto-decisions: 5`, and `Instructions max lines` absent (no threshold). In-progress plans keep validating. The `Max parallel` default of 2 applies only to plans written after the change. (source: user, Q24)
- D30: `plan` and `run` check the session model by checking their own model identity from the system prompt. (source: user, Q25)
- D31: When a batch pilot passes only after escalation, `run` appends `Batch <id> re-tiered to <tier> after pilot <task id>` to `plan.md`'s Decisions with source `run (pilot <task id>)`, and adds `- Re-tiered: <old> → <new> (batch <id> pilot <task id>)` under each remaining task of the batch in the milestone file. The task's Tier field keeps its planned value. The `Re-tiered:` line is the task's starting rung, and the three-rung cap counts from the re-tiered tier, never past `specialist`. (source: user, Q26)
- D32: The Conventions block is a line `Conventions:` inside the milestone's Context, followed by one bullet per rule, `- "<short quote>" (<path>:<line>)`. With no instruction files, or no rules that apply, it is the single line `Conventions: none`. `task-brief` copies it as part of Context. (source: user, Q27)
- D33: Decider question IDs are `<task ID>-q<n>` for a worker's GAP and `<milestone ID>-q<n>` for a planner's GAP, where `n` counts from 1 per task or milestone across the plan (for example `M05-T03-q1`, `M07-q2`). (source: user, Q28)
- D34: The plugin has no runtime PowerShell today. No `.ps1`, `pwsh` or `powershell` appears under `plugins/orchestratinator/`; the only shell-related hit is the ` ```bash ` fence at `plugins/orchestratinator/README.md:9`. The plugin has no `hooks/` or `scripts/` directory. So Change 19.2 removes nothing, and the inventory records that. (source: scout report, grep of `plugins/orchestratinator/`)
- D35: The build runs serially, `Parallel: off`. (source: spec §29)
- D36: `Worktree setup: none`. The plugin is Markdown, JSON and bash with nothing to install, and the build is serial (D35). (source: spec §29; repo survey)
- D37: This build runs on the installed, pre-rename plugin (spec §25 Build note), so this plan's tiers carry the installed plugin's meanings: `worker-light` Haiku, `worker` Sonnet/medium, `worker-heavy` Sonnet/high, `specialist` Opus/high. Its commits carry `Orchestratinator-Task:`. Don't update the installed plugin during the run. (source: spec §25 Build note, §24 item 10)
- D38: Out of scope: rewriting CLAUDE.md or AGENTS.md for users, a standalone slimming tool, cache measurement and tuning beyond what the run report records, and any cost-based limit. (source: spec §26)
- D39: Dropped or deferred: isolation-spec experiments E1–E8, `disallowedTools` pattern rules, harness worktrees, `worktree.baseRef`, `.worktreeinclude`, the `ORCHESTRATINATOR_MAIN` removal, probes P1–P8, the SubagentStop Verify gate, the `claude -p` driver, permission-mode guidance, code intelligence in workers, and workflow-backed execution. (source: spec §27)
- D40: The toolchain check (Change 19.6) is built with the other preflight checks in M09, in preflight order. (source: spec §29 items 2 and 7)
- D41: The pinned bats-core tag is found with `git ls-remote --tags https://github.com/bats-core/bats-core` (git only, no web lookup), taking the highest release tag that isn't a pre-release. It is recorded with that URL in the M02 task's note. (source: user, Q32b)
- D42: Under `--yes`, `run` records the model notice by appending the line `model-notice <UTC> <session model>` to `plans/<slug>/notes/run-log.md` (M09), and `run-report` shows it (M11). (source: user, Q29)
- D43: `task-brief` prints the absolute path of the brief it wrote, and nothing else on success. Every path a script prints for an agent or a tool (brief, report, failure log, worktree, log paths) is printed in the form Claude Code's file tools accept: `cygpath -m <path>` (`C:/Users/...`) when `cygpath` is available, and the path unchanged otherwise. (source: user, Q30)
- D44: The D43 rule lives in one shared helper, `plugins/orcastrat/scripts/lib/common`, sourced by every script. Its function `print_path <path>` prints `cygpath -m <path>` when `cygpath` exists, and the path unchanged otherwise. One bats test, with a stub `cygpath` on `PATH`, covers the helper, and each script's tests assert that the paths it prints go through it. Scripts may use `$(...)` internally, including to source `lib/common`: Change 19.3's "no `$(...)`" rule covers only commands that skills and agents tell Claude to run. `hooks/stop-guard` does its fast exit (Change 8) before sourcing `lib/common`, so an idle session never pays to load it. (source: user, Q30, Q33)
- D45: The plan-reviewer's non-bash Verify check (Change 19.4) is advisory: its findings go in a `## Advisory` section of the plan-review report, after `## Issues`. They never count toward `ISSUES:` or change `STATUS`, and neither the planner nor `plan` fixes them; both fix only what `## Issues` lists. (source: spec §20 item 4, "flags a Verify that relies on non-bash syntax (advisory)"; spec §11, "Advisory findings are recorded in the review's notes file ... and never acted on automatically"; the `## Advisory` heading follows `plugins/orcastrat/agents/milestone-reviewer.md:68`)
- D46: M02's inventory marks the `git branch -r --contains <sha>` check in `run`'s stray-commit guard `replaced in M03 (push-check)`, and the cherry-pick integration in `run` section 3e item 6 `replaced in M07 (integrate)`. Both are single-line `git` calls, so M02 rewrites neither. (source: M03 Context, which defines `push-check` by `git branch -r --contains` and says `run` starts using `integrate` in M07; `notes/M02-survey.md` Unconfirmed items 1 and 2)
- D47: bats-core `v1.14.0`'s `bats --version` (and `-v`) prints exactly one line, `Bats 1.14.0`, and exits 0, so M02-T03's Verify matches that line with `grep -qx 'Bats 1.14.0'`. (source: `https://raw.githubusercontent.com/bats-core/bats-core/v1.14.0/libexec/bats-core/bats`, read 2026-09-23: `export BATS_VERSION='1.14.0'`; `version() { printf 'Bats %s\n' "$BATS_VERSION"; }`; the `-v | --version)` case calls `version` and then `exit 0`)
- D48: Every agent file, not only the reviewers, carries these invariant instructions (Change 21.2): search only inside the repository, or paths named in the brief or task, and never from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`), preferring the Glob and Grep tools over `find`; never start a background command, and never run a command that may not finish within the Bash time limit, but report the question instead; don't verify environment facts (installed tools, versions) that the task's own Verify or scripts establish (for example, `run-bats.sh` clones bats itself). No agent below the orchestrator gets the Agent (Task), Skill or Artifact tool, and the allowlists state this. Cause: the M02 plan-reviewer's `find / -iname bats` outlived the Bash time limit, was moved to the background, and kept scanning the drive after the agent finished. (source: user, after M02 plan review; spec §22 item 2 and item 3, §32 item 65)
- D49: After every agent returns, if its completion notice reports background work still running, `run` stops it with the Stop Task tool. If that fails, `run` appends a warning line to `plans/<slug>/notes/run-log.md` naming the agent and quoting the notice, and continues. `run` never kills processes by PID. `run-report` (M11) counts these warnings. (source: user, after M02 plan review; spec §4 "Leftover background work", §12, §32 item 66)

## Open questions

None.
