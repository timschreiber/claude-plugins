# M02 survey: Portable runtime foundation

Repo root: `C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins`. Current plugin tree (post-M01 rename) is Markdown/JSON only:

```
plugins/orcastrat/.claude-plugin/plugin.json
plugins/orcastrat/README.md
plugins/orcastrat/agents/{milestone-reviewer,plan-reviewer,planner,reviewer,scout-heavy,scout,specialist,worker-heavy,worker-light,worker}.md
plugins/orcastrat/reference/plan-format.md
plugins/orcastrat/skills/{plan,run,status}/SKILL.md
```

No `scripts/`, `hooks/`, or `lib/` directories exist yet under `plugins/orcastrat/` — everything in the Outline's script/test/CI bullets is new.

## Outline bullet: bats-core tag investigate

`git ls-remote --tags https://github.com/bats-core/bats-core` run 2026-09-23. Highest non-pre-release tag: **`v1.14.0`** (commit `7868b95ea08b22bc76f2585e51cf4b7b3ff124ef`, annotated-tag peel `eb7f42f8d608ac693d7a4b67474f6714ea68cfc5`). `v1.5.0-docfix` is the only pre-release-looking tag in the list and is correctly excluded. Full descending tail of tags: v1.14.0, v1.13.0, v1.9.0, v1.8.2, v1.8.1, v1.8.0, v1.7.0, v1.6.1, v1.6.0, v1.5.0(-docfix), v1.4.1, v1.4.0, v1.3.0, v1.2.1, v1.2.0. URL to record per D41: `https://github.com/bats-core/bats-core`.

Local dev environment (informational, for the toolchain-check acceptance numbers in the spec, not this milestone's code): `bash --version` → `GNU bash, version 5.2.37(1)-release (x86_64-pc-msys)`; `git --version` → `git version 2.53.0.windows.3`. Both exceed the spec's floors (bash 3.2, git 2.17).

## Outline bullet: `scripts/run-bats.sh`, `.gitignore`

- `scripts/run-bats.sh` does not exist. Existing repo-root scripts are all PowerShell: `scripts/Validate-All.ps1`, `scripts/Sync-Shared.ps1`, `scripts/New-Plugin.ps1` (`plugins\Sync-Shared.ps1` is not real — actual listing is `scripts/New-Plugin.ps1`, `scripts/Sync-Shared.ps1`, `scripts/Validate-All.ps1`).
- `.gitignore` (repo root, 12 lines) has no `.tools/` entry. Existing entries include `.dnz/`, `*.user`, `.vs/`, `.idea/`, `node_modules/`, `.dnz-hookprobe/`, `probes/evidence/*.tmp`, `build-out.txt`, `.claude/settings.*.bak`, `probes/hook-behavior/hook-coverage.json`, `probes/updated-input/rewrite-results.json`, `probes/.tools/`. Note `probes/.tools/` already exists as a precedent pattern for a tool-cache ignore entry, but there is no root-level `.tools/` yet.
- D02's script contract: clone `https://github.com/bats-core/bats-core` at the pinned tag into `.tools/bats-core` if missing, then run `.tools/bats-core/bin/bats -r tests/orcastrat` with no args, or pass through given args.

## Outline bullet: `plugins/orcastrat/scripts/lib/common`, `tests/orcastrat/lib-common.bats`

- Neither `plugins/orcastrat/scripts/` nor `tests/orcastrat/` exists yet — both are new.
- D44 spec: `print_path <path>` prints `cygpath -m <path>` when `cygpath` exists on PATH, else the path unchanged. D43: every script-printed path (brief, report, failure log, worktree, log paths) must go through this.
- The bats test must stub `cygpath` on `PATH` (per Outline) to assert both forms — no existing bats infrastructure or stub pattern exists in this repo to copy; this is fully new.
- Existing Pester tests (`tests/CommandSegmentation.Tests.ps1`, `tests/Invoke-QuietDotnet*.Tests.ps1`) are PowerShell/Pester, not a pattern applicable to bats.

## Outline bullet: inventory of scripts and embedded commands

No `.ps1`, `pwsh`, or `powershell` (case-insensitive) hit anywhere under `plugins/orcastrat/` — confirms D34 still holds after the M01 rename (previously verified under `plugins/orchestratinator/`).

Only one fenced ```` ```bash ```` block exists under the plugin tree: `plugins/orcastrat/README.md:11-14` (install commands `claude plugin marketplace add …` / `claude plugin install …`) — these are user-facing install commands, not runtime commands the plugin executes; no `$(...)`, single lines, dev/user-facing.

`$(...)` command substitution hits, both in `plugins/orcastrat/skills/run/SKILL.md`:

- `run/SKILL.md:32` — **WT_ROOT** definition: `` **WT_ROOT**: `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>`, made absolute. `` Runtime, not replaced in M03 (WT_ROOT is a run-level definition used for worktree paths in Change 5/parallel waves, not one of the Change 6 bookkeeping scripts listed in spec §7). **Needs M02 rewrite** to an intent description, matching the pattern already used at `run/SKILL.md:62` ("the directory `git rev-parse --git-dir` prints"). The Context's own example phrasing — "the directory `git rev-parse --git-dir` prints, plus `/orcastrat/<plan-slug>`" — is (modulo `--git-dir` vs `--git-common-dir`) essentially this exact line.
- `run/SKILL.md:38` — inside the **Verify a command** definition (lines 34–38): "In the main checkout, write the log to `$(git rev-parse --git-dir)/orcastrat-verify.log` instead...". This whole definition block (`run/SKILL.md:34-38`) is explicitly named in the milestone's Context as one of the items **replaced in M03** ("the 'Verify a command' definition and its log paths"; Change 6's `verify` script, spec §7 line 142, subsumes it, writing logs under `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/logs/`). No M02 edit needed beyond recording it in the inventory as `replaced in M03`.

No other `$(...)` occurrences found anywhere else under `plugins/orcastrat/` (grep for `\$\(` matched only `run/SKILL.md`).

No multi-line bash blocks (fenced code containing an actual multi-command shell sequence, as opposed to a report/dispatch-message template) exist anywhere in the plugin. The only fenced-code blocks besides the README install snippet and the run/SKILL.md "Verify a command"/dispatch-message templates are STATUS/REASON/... report formats in the six worker-family agents (`worker.md`, `worker-heavy.md`, `worker-light.md`, `specialist.md`) and `reviewer.md`, `milestone-reviewer.md`, `plan-reviewer.md`, `planner.md`, `scout.md`, `scout-heavy.md` — these are reply-shape templates, not commands.

Full inventory of every embedded git/shell command line found (all single-line, all fine as-is — no `$(...)`, no multi-line, no pwsh):

| path:line | Command | Runtime/dev | Notes |
|---|---|---|---|
| `run/SKILL.md:31` | `git rev-parse --show-toplevel` (defines MAIN) | runtime | fine as-is |
| `run/SKILL.md:32` | `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>` (WT_ROOT) | runtime | **needs M02 rewrite to intent description** |
| `run/SKILL.md:34-38` | "Verify a command" definition, incl. `$(git rev-parse --git-dir)/orcastrat-verify.log` | runtime | **replaced in M03** (Change 6 `verify` script) |
| `run/SKILL.md:39-40` | `git -C "D" add -A`; `git -C "D" commit -m "<msg>" -m "Orcastrat-Task: <task ID>"` | runtime | fine as-is |
| `run/SKILL.md:56` | `git status --porcelain` | runtime | fine |
| `run/SKILL.md:61` | `git log <branch> --format=%H -E --grep="^(Orcastrat\|Orchestratinator)-Task: <task ID>$"` | runtime | fine; **replaced in M03**? Not explicitly named among the four M03-called-out items (scope checks, push check, verify, recovery grep in `run`) — actually this IS "the recovery grep in `run`" the Context calls out. **replaced in M03** |
| `run/SKILL.md:62` | intent description of `git rev-parse --git-dir` / `--git-common-dir`, plus `git worktree prune` | runtime | already correct style; model for the WT_ROOT fix |
| `run/SKILL.md:85` | `git switch -c <branch>` | runtime | fine |
| `run/SKILL.md:106` | `git status --porcelain`; `git add -A`; `git commit -m "chore(plan): survey <ID>"` | runtime | fine |
| `run/SKILL.md:127` | `git checkout -- "<milestone file path>"` | runtime | fine |
| `run/SKILL.md:131-132` | `git status --porcelain`; `git add -A`; `git commit -m "chore(plan): detail <ID>"` | runtime | fine |
| `run/SKILL.md:137` | `chore(plan): start <ID>` commit | runtime | fine |
| `run/SKILL.md:165` | `git rev-parse HEAD` | runtime | fine |
| `run/SKILL.md:166` | `git log --oneline <recorded HEAD>..HEAD`; `git branch --show-current`; `git branch -r --contains <sha>`; `git reset --soft <recorded HEAD>` | runtime | fine, all single-line |
| `run/SKILL.md:176` | `git status --porcelain` (scope check) | runtime | this is **"the scope checks"** called out as replaced in M03 (Change 6 `scope-check` script) |
| `run/SKILL.md:185` | `git rev-parse HEAD` (BASE) | runtime | fine |
| `run/SKILL.md:187` | `git worktree add -b <task branch> "<WT_ROOT>/<task ID>" <BASE>`; `cd "<worktree>" && ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>` | runtime | single-line `cd &&` form is explicitly allowed by Context; depends on WT_ROOT fix above |
| `run/SKILL.md:194` | stray-commit/branch check reused in worktree | runtime | fine (same primitives as :166) |
| `run/SKILL.md:199` | `git -C "<worktree>" status --porcelain` (scope check) | runtime | **scope check, replaced in M03** |
| `run/SKILL.md:200` | `git status --porcelain` in MAIN (guard) | runtime | fine |
| `run/SKILL.md:205` | `git log --oneline <BASE>..<task branch>`; `git cherry-pick <task branch>`; `git cherry-pick --abort` | runtime | fine; **`integrate` replaces the cherry-pick step in M03** per Change 6, though this Outline bullet only names scope/push/verify/recover explicitly — flagged as **Unconfirmed** whether M02's inventory should mark this `replaced in M03` too |
| `run/SKILL.md:207` | `chore(plan): <milestone ID> wave <n> done (<task IDs>)` commit | runtime | fine |
| `run/SKILL.md:208` | `git worktree remove "<worktree>"`; `git branch -D <task branch>` | runtime | fine |
| `run/SKILL.md:213` | Milestone verify command (user-supplied, run in MAIN) | runtime | this is the seam **Change 19.4** governs — no bash-c wrapper stated yet, see below |
| `run/SKILL.md:214` | `git log --format=%H --grep="^chore(plan): start <ID>$"` | runtime | fine |
| `run/SKILL.md:221,239` | `git status --porcelain`; `git add -A`; `git commit -m "chore(plan): review <ID>" / "re-review <ID>"` | runtime | fine |
| `run/SKILL.md:230` | `git status --porcelain`; `git add -A`; `git commit -m "chore(plan): fix tasks <ID>"` | runtime | fine |
| `run/SKILL.md:249-250` | Final verify command; `chore(plan): complete plan` commit | runtime | same Verify seam as :213 |
| `run/SKILL.md:257` | `git reset --hard HEAD`; `git clean -fd` (serial retry discard) | runtime | fine |
| `run/SKILL.md:276` | `chore(plan): pause at <where>` commit | runtime | fine |
| `run/SKILL.md:283` | `git add <plan dir>`; `git commit -m "chore(plan): blocked at <where>"` | runtime | fine |
| `milestone-reviewer.md:36` | `git diff <Base>..HEAD` | runtime | fine |
| `milestone-reviewer.md:53` | `git log --format=%H -E --grep="^(Orcastrat\|Orchestratinator)-Task: <task ID>$"`; `git show <sha>` | runtime | fine |
| `reviewer.md:20` | `git status --porcelain`; `git diff` | runtime | fine |
| `README.md:11-14` | ```` ```bash ```` install snippet (`claude plugin marketplace add …`, `claude plugin install …`) | dev/user-facing | not a runtime command the plugin executes |
| `README.md:23-25,65` | uninstall/update/install commands, `git worktree remove <path>` | dev/user-facing | fine |
| `status/SKILL.md:13` | `git status --porcelain`, `git log --oneline -5`, `git worktree list` | runtime | fine, and explicitly the only 3 git commands `status` is allowed to run |

No `pwsh`/`powershell`/`.ps1` anywhere in the above — D34 holds.

## Outline bullet: rewrite non-replaced runtime commands

Only one concrete rewrite target found: **`run/SKILL.md:32`** (WT_ROOT), as detailed above. Everything else embedded in skills/agents is either already a single-line `git`/script call with no `$(...)`, or is one of the four items the Context names as `replaced in M03` (Verify-a-command definition + its log path at `run/SKILL.md:34-38`; the scope checks at `run/SKILL.md:176` and `:199`; the recovery grep at `run/SKILL.md:61`; push-check has no current occurrence in `run/SKILL.md` — **Unconfirmed**, see below).

**Unconfirmed / flag for plan-writing:**
- No literal "push-check" style command (checking whether a branch was pushed to a remote) currently appears standalone in `run/SKILL.md` outside the `git branch -r --contains <sha>` check at line 166/194, which is the stray-commit "was this pushed" check, not a `push-check <base>` equivalent per spec §7. Confirm during M03 planning whether this line counts as "the push check" the milestone context refers to, or whether push-check covers different logic.
- Whether the cherry-pick/integrate block (`run/SKILL.md:205`) should be marked `replaced in M03` in the inventory: the Outline text names only "the scope checks, the push check, the recovery grep in `run`" plus the Verify-a-command definition as M03-replaced; it does not explicitly list `integrate`. But spec §7 clearly assigns cherry-pick range logic to the `integrate` script. Recommend the M02 task record both readings and let the plan/planner resolve which items the inventory should tag.

## Outline bullet: Verify commands run with `bash -c` (plan-format.md, `plan` skill, `planner` agent, `plan-reviewer` advisory check)

- `reference/plan-format.md:228` (Verify field row) currently reads: "A command must be runnable from the repo root, targeted, quiet, and must fail when the task isn't done." — **no mention of `bash -c` or of PowerShell projects invoking their own tooling explicitly.** Needs the addition per spec §20 item 4.
- `reference/plan-format.md` header field row for **Final verify** (line 71: "Command run after the last milestone, or `none`.") and the milestone file's **Milestone verify** field (not shown as a separate table row; appears in the milestone template at line 116 and is described only inline) — same gap, no bash-c statement.
- `plugins/orcastrat/skills/plan/SKILL.md` — no mention of "bash -c" or Verify's execution shell anywhere in the file (confirmed by full read, sections 1–11). Needs the statement added, likely in section 6 ("Write the tasks as prompts") where Verify commands are discussed, or by cross-reference to plan-format.md.
- `plugins/orcastrat/agents/planner.md` — likewise no mention of bash or shell for Verify (confirmed by full read). Same fix needed, likely in its "Write the tasks as prompts" section (parallel to plan/SKILL.md's).
- `plugins/orcastrat/agents/plan-reviewer.md` **Check** item 6 ("Verify", line 44): "Every Verify command runs from the repository root, is targeted at what its task changes, is quiet, and would fail if the task were not done." No advisory check for non-bash syntax exists. Needs a new advisory-level check added here (spec: "The plan-reviewer flags a Verify that relies on non-bash syntax (advisory)."). The existing Check section already distinguishes required (blocking) vs implicitly advisory items are not distinguished elsewhere in that agent — **Unconfirmed**: plan-reviewer's report format (`## Issues`) has no existing blocking/advisory split (unlike milestone-reviewer's `## Blocking`/`## Advisory`); how "advisory" is represented in plan-reviewer's flat numbered Issues list is not defined anywhere in the current plan format or agent — this is a design point the M02 planner/tasks will need to settle (e.g., a distinguishing prefix on the issue line, or a note that this particular check never blocks `ISSUES` status).
- `run/SKILL.md`'s **Verify a command** definition itself (lines 34-38, replaced in M03) does describe running the command directly (not through an explicit `bash -c`), consistent with spec's "Verify commands run with bash -c (through verify)" being delegated to the M03 `verify` script — no bash-c wrapper text needs to land in run/SKILL.md in M02.

## Outline bullet: `tests/orcastrat/test_helper.bash`, `tests/orcastrat/no-powershell.bats`

- Neither file nor `tests/orcastrat/` directory exists. Fully new.
- D03: bats tests live at `tests/orcastrat/*.bats` (repo root, outside the plugin); fixtures under `tests/orcastrat/fixtures/`.
- D11 exact scan rule to implement: fail on any `.ps1` file under `plugins/orcastrat/`; fail on `pwsh` or `powershell` (case-insensitive) inside `plugins/orcastrat/scripts/` and `plugins/orcastrat/hooks/`; prose in skills/agents/README is not scanned. Test "passes when those directories don't exist yet" (grep/find over a non-existent directory must not error and must report zero violations — confirm the chosen implementation, e.g. `grep -r` vs `find … -exec grep`, handles a missing directory gracefully, since `plugins/orcastrat/scripts/` and `plugins/orcastrat/hooks/` do not exist as of this survey).
- No existing bash test-fixture-repo helper exists anywhere in the repo to copy from; `tests/CommandSegmentation.Tests.ps1`'s `BeforeAll` (Pester) is not a transferable pattern for bats' `setup`/`teardown`.

## Outline bullet: `.github/workflows/orcastrat.yml`

- Existing `.github/workflows/validate.yml` (only workflow in the repo) triggers on `push: branches: [main]` and `pull_request`, runs on `ubuntu-latest` only, installs Claude Code via `npm install -g @anthropic-ai/claude-code`, runs `claude plugin validate .`, loops `plugins/*/` with `claude plugin validate "$d"`, and runs `./scripts/Sync-Shared.ps1 -Check` under `shell: pwsh`. Per D22/Outline, `validate.yml` is unchanged; the new `orcastrat.yml` is a separate file.
- New workflow needs: trigger on `push` for **all branches** (not just `main`, unlike `validate.yml`) plus `pull_request`; a matrix job over `ubuntu-latest`, `macos-latest`, `windows-latest` running `bash scripts/run-bats.sh` (Windows via Git Bash, i.e. `shell: bash` in Actions selects Git Bash automatically on `windows-latest`) plus the D11 no-`.ps1`/no-pwsh check; a separate `shellcheck` job on `ubuntu-latest` only, checking every file under `plugins/orcastrat/scripts/` and `plugins/orcastrat/hooks/` except `hooks.json`, succeeding when there are none yet (both dirs currently don't exist).

## Outline bullet: `scripts/Validate-All.ps1` D11 step

- Current `Validate-All.ps1` (repo root `scripts/`) has three steps in order: `== marketplace` (`claude plugin validate $repoRoot`), one `== $($_.Name)` step per plugin directory (`claude plugin validate $_.FullName`), and `== shared asset drift` (`Sync-Shared.ps1 -Check`), each setting `$failed = $true` on nonzero `$LASTEXITCODE`, then exiting 1 if `$failed` else printing `all checks passed` and exiting 0.
- Outline requires a new `== orcastrat portability` step, matching this existing per-step pattern (`Write-Host '== <label>'`, run the check, set `$failed = $true` on violation), implementing the same D11 rule as the bats `no-powershell.bats` test (no `.ps1` under `plugins/orcastrat/`; no `pwsh`/`powershell` case-insensitive under `plugins/orcastrat/scripts/` or `plugins/orcastrat/hooks/`).
- `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'` are already set at the top of the script; new step should follow the same idiom as the existing three (no early-return short-circuiting, accumulate into `$failed`).

## Conflicts

None found.

## Unconfirmed

- Whether `run/SKILL.md:205`'s cherry-pick/`git cherry-pick --abort` logic should be tagged `replaced in M03` in the M02 inventory (spec §7 assigns it to the `integrate` script, but the milestone's Context text names only "the scope checks, the push check, the recovery grep in run" plus the Verify-a-command definition).
- Whether `run/SKILL.md:166`/`:194`'s `git branch -r --contains <sha>` stray-commit/pushed check is "the push check" the Context refers to as replaced in M03, or whether spec's `push-check <base>` script (checking the plan branch itself against a remote, spec §7 line 141) is a distinct check with no current textual occurrence in `run/SKILL.md`.
- How plan-reviewer's new advisory "non-bash Verify" check should be represented in its flat `## Issues` numbered-list report format (which has no existing blocking/advisory distinction, unlike milestone-reviewer's separate `## Blocking`/`## Advisory` sections) without causing an advisory-only finding to flip its `STATUS` to `ISSUES`.
