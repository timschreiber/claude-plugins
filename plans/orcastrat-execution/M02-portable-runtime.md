# M02: Portable runtime foundation (Change 19)

- Status: in-progress
- Format: 2
- Goal: The portability rule is in place and enforced. The inventory of scripts and embedded commands is recorded. Every command that skills and agents tell Claude to run is a single-line call to a script or to `git`, with no `$(...)` and no multi-line bash (except the Change 6 steps M03 replaces). `plan` and `planner` write Verify commands that run from bash, and the plan-reviewer flags non-bash Verify syntax as advisory. A bats harness exists under `tests/orcastrat/` with a passing no-PowerShell test. `.github/workflows/orcastrat.yml` runs the checks on three OSes, and `Validate-All.ps1` has the same no-`.ps1` check.
- Depends on: M01
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §20 (Change 19) items 1–4 and 7–9, §1.6, §31; Decisions D02, D03, D11, D22, D34, D41, D43, D44, D45, D46, D47. Item 5 (hooks) is built in M08, item 6 (the toolchain check) in M09 (D40), and item 10 (README) in M15.

- Shipped runtime means bash 3.2 compatible code plus `git` and `grep`, `sed`, `awk`, `tail`, `head`, `date`, `mkdir`, `rm`, `cat`. No associative arrays, no `mapfile`, no `${var,,}`. No `pwsh`, `powershell`, `jq`, Node or Python at runtime.
- Dev tooling (`scripts/*.ps1`, and the new `scripts/run-bats.sh`) lives outside the plugin. Nothing the plugin ships may invoke it.
- D34: the plugin has no runtime PowerShell today, so Change 19.2 deletes nothing. The inventory records that.
- Paths such as `$(git rev-parse --git-dir)/…` in the spec describe what scripts resolve internally. In skill and agent text, describe them by intent instead ("the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>`").
- The `cd "<worktree>" && <command>` rule for workers in parallel waves stays; spec §6 item 2 keeps it. It is a single line with no command substitution.
- Commands that a Change 6 script replaces are left alone here: the "Verify a command" definition and its log paths, the scope checks, the push check and the recovery grep in `run` (M03), and the cherry-pick integration (M07, D46). The inventory marks each of them.
- Bats runs only through `bash scripts/run-bats.sh` (D02). The pinned tag is `v1.14.0` (`notes/M02-survey.md`, from `git ls-remote` on 2026-09-23); M02-T01 records it per D41. shellcheck runs only in CI. No npm or Node.
- `plugins/orcastrat/scripts/lib/common` holds `print_path` (D43, D44). Every later script sources it. Scripts may use `$(...)` internally.
- Every Verify command in this milestone runs from the repository root in bash.
- The run executing this plan is the installed, pre-rename plugin, so this plan's commits carry `Orchestratinator-Task:` (D37).

Waves: 5 (widths 3, 3, 3, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §20 item 1: inventory every script and embedded command under `plugins/orcastrat/`, classified runtime or not, recorded for the CHANGELOG → M02-T02
- `docs/orcastrat-execution-spec.md` §20 item 2: `plugins/orcastrat/` has no `.ps1` and no runtime `pwsh`/`powershell` reference (nothing to remove, D34) → M02-T02, M02-T04, M02-T07
- `docs/orcastrat-execution-spec.md` §20 item 3: commands skills and agents tell Claude to run are single-line script or `git` calls, with no `$(...)` and no multi-line bash, described by intent or in bash form → M02-T02, M02-T08
- `docs/orcastrat-execution-spec.md` §20 item 4: Verify commands run with `bash -c`; the planner writes them for bash; PowerShell projects invoke their tooling explicitly → M02-T09
- `docs/orcastrat-execution-spec.md` §20 item 4: the plan-reviewer flags a Verify that relies on non-bash syntax, as advisory (D45) → M02-T10
- `docs/orcastrat-execution-spec.md` §20 Rule: shipped code is bash 3.2 plus `git` and standard utilities; paths printed through `print_path` (D43, D44) → M02-T06
- `docs/orcastrat-execution-spec.md` §20 item 7: bats-core tests with fixture repos, asserting output and exit code; no test runs Claude Code → M02-T03, M02-T05, M02-T06, M02-T07
- `docs/orcastrat-execution-spec.md` §20 item 8: CI workflow on three OSes (Git Bash on Windows) on every push and pull request: shellcheck, bats, the no-`.ps1`/no-`pwsh` check → M02-T07, M02-T11
- `docs/orcastrat-execution-spec.md` §20 item 9: dev tooling stays PowerShell outside the plugin; `Validate-All.ps1` gains the same no-`.ps1` check → M02-T04
- `docs/orcastrat-execution-spec.md` §1.6: shipped runtime follows Change 19 → M02-T06, M02-T07
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only (bats-core, GitHub Actions, git) → M02-T03, M02-T11
- `docs/orcastrat-execution-spec.md` §29 item 2: the bats harness and CI matrix come before any later script → M02-T03, M02-T05, M02-T06, M02-T11
- `docs/orcastrat-execution-spec.md` §31: `Validate-All.ps1` passes; shipped runtime bash plus `git` only; dev tooling may stay PowerShell → M02-T04, M02-T06
- `docs/orcastrat-execution-spec.md` §32 items 35–38 and 40: bash-only shipped runtime, runtime PowerShell removed with the inventory, dev tooling PowerShell, Verify through `bash -c`, portability proven by a three-OS bats matrix → M02-T02, M02-T06, M02-T07, M02-T09, M02-T11
- `docs/orcastrat-execution-spec.md` preamble: the plan's portability goal (shipped runtime bash plus `git` only) → M02-T06, M02-T07
- D02: `scripts/run-bats.sh` clones bats-core at the pinned tag into `.tools/bats-core`, `.tools/` ignored, arguments passed through → M02-T03
- D03: bats tests in `tests/orcastrat/*.bats`, outside the plugin → M02-T05, M02-T06, M02-T07
- D11: the no-`.ps1` / no-`pwsh` check scans only `plugins/orcastrat/`, with `pwsh`/`powershell` only in `scripts/` and `hooks/` → M02-T04, M02-T07
- D22: `.github/workflows/orcastrat.yml` on push (all branches) and pull_request; bats on three OSes; shellcheck on ubuntu only; `validate.yml` unchanged → M02-T11
- D41: the pinned tag comes from `git ls-remote --tags`, highest non-pre-release, recorded in a task note → M02-T01, M02-T03
- D43, D44: `plugins/orcastrat/scripts/lib/common` with `print_path`, one bats test with a stub `cygpath` → M02-T05, M02-T06
- D46: inventory dispositions for the push check and the cherry-pick integration → M02-T02

## Review Focus

- A path containing spaces, such as `C:/Users/me/some dir/file.txt`, passed to `print_path` → handed to `cygpath -m` as one argument, and printed unchanged as one line when `cygpath` is absent (source: D43). Test: `print_path passes a path with spaces to cygpath as one argument` in M02-T06.
- A fixture repo created on a CI runner that has no global git identity → the commit still succeeds, using the fixture's repository-local identity (source: §20 items 7 and 8). Test: `make_fixture_repo commits without a global git identity` in M02-T05.
- A shipped script that says `PwSh` in mixed case → reported as a violation (source: D11, "case-insensitive"). Test: `mixed-case pwsh in scripts is a violation` in M02-T07.
- Prose in a skill that mentions `pwsh -NoProfile -File scripts/verify.ps1`, as M02-T09 adds to the plan format → not a violation (source: D11, "Prose in skills, agents and the README is not scanned"). Test: `pwsh in skill prose is not a violation` in M02-T07.

## Tasks

### M02-T01: Record the pinned bats-core release tag

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orcastrat-execution/notes/M02-T01.md`
- Verify: review
- Commit: `docs(plan): record the pinned bats-core tag`

**Objective**

`plans/orcastrat-execution/notes/M02-T01.md` records the highest bats-core release tag that isn't a pre-release, found with `git ls-remote`, with its URL.

**Read first**

- plan.md Decisions D02 and D41

**Steps**

1. Run `git ls-remote --tags https://github.com/bats-core/bats-core`.
2. From each line, take the ref name, drop its `refs/tags/` prefix and any trailing `^{}`, and remove duplicates.
3. Keep only the names that match the regular expression `^v[0-9]+\.[0-9]+\.[0-9]+$` exactly. This drops pre-release and suffixed tags such as `v1.5.0-docfix`.
4. Sort the kept names by major, then minor, then patch number, compared as numbers, highest first.
5. Write the note with a `## Command` section (the command from step 1 and today's UTC date), a `## Release tags` section (the kept names, highest first, one per line), and then these two lines as the last lines of the file:
   - `BATS-URL: https://github.com/bats-core/bats-core`
   - `BATS-TAG: <the highest kept name>`

**Done when**

- The note has the two sections and ends with the `BATS-URL:` and `BATS-TAG:` lines.
- `BATS-TAG:` names the highest tag of the form `v<major>.<minor>.<patch>` that `git ls-remote` lists.

### M02-T02: Inventory the plugin's scripts and embedded commands

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orcastrat-execution/notes/M02-T02.md`
- Verify: review
- Commit: `docs(plan): inventory the plugin's scripts and embedded commands`

**Objective**

`plans/orcastrat-execution/notes/M02-T02.md` lists every script and every embedded command under `plugins/orcastrat/` with its `path:line`, its classification, and what happens to it, for M02-T08 to act on and M15 to copy into the CHANGELOG.

**Read first**

- `docs/orcastrat-execution-spec.md` §20 items 1–3
- `plans/orcastrat-execution/notes/M02-survey.md`, section "Outline bullet: inventory of scripts and embedded commands" (the starting table)
- plan.md Decisions D34 and D46

**Steps**

1. Run `find plugins/orcastrat -type f ! -name '*.md' ! -name '*.json'`. Under `## Scripts`, write each path it prints, one per line, or `None.` if it prints nothing. Then run `ls scripts` and, under `## Dev tooling`, write one line per file it prints, as `` `scripts/<name>` — dev tooling, outside the plugin, never run by it (Change 19.9). ``
2. Run `find plugins/orcastrat -name '*.ps1'` and `grep -rniE 'pwsh|powershell' plugins/orcastrat`. Under `## PowerShell`, write each hit as `path:line`. If both commands print nothing, write this line instead: `None: no .ps1 file and no pwsh or powershell reference under plugins/orcastrat/, so Change 19.2 removes nothing (D34).`
3. Copy the table from the survey section named in Read first as your starting rows. For each row, open the cited file at the cited line and confirm the command is on that line; correct the line number if it is not. Write every path in full from the repository root (`plugins/orcastrat/skills/run/SKILL.md:32`, not `run/SKILL.md:32`). Split a row that cites a range or several lines into one row per line.
4. Run `grep -rnE 'git [a-z-]+ |\$\(|cd "|claude plugin' plugins/orcastrat`. For each hit that is a command a skill, agent or reference file tells Claude to run, or that the README tells the user to run, and that has no row yet, add a row. Skip hits that are prose about git rather than a command.
5. Write the table under `## Embedded commands`, with the columns `path:line`, `Command`, `Runtime or user`, `Uses $(...)`, `Multi-line`, `PowerShell`, `Disposition`. `Runtime or user` is `user` for rows in `plugins/orcastrat/README.md` and `runtime` for every other row. The three middle columns are `yes` or `no`.
6. Set each row's Disposition by the first rule that matches:
   1. The "Verify a command" definition in the Definitions section of `plugins/orcastrat/skills/run/SKILL.md` (its code line and its log-path sentence): `replaced in M03 (verify)`.
   2. A `git status --porcelain` or `git -C "<worktree>" status --porcelain` that `run` uses to check a task's changes against its Files: `replaced in M03 (scope-check)`.
   3. `git branch -r --contains <sha>` in the stray-commit guard: `replaced in M03 (push-check)` (D46).
   4. The trailer grep in `run`'s preflight recovery item (`git log <branch> --format=%H -E --grep=...`): `replaced in M03 (recover)`.
   5. `git log --oneline <BASE>..<task branch>`, `git cherry-pick <task branch>` or `git cherry-pick --abort` in `run` section 3e item 6: `replaced in M07 (integrate)` (D46).
   6. Any other row with `yes` in `Uses $(...)`, `Multi-line` or `PowerShell`: `rewrite in M02`.
   7. Every other row: `keep`.
7. Under `## Rewrite in M02`, list the `path:line` of every row whose Disposition is `rewrite in M02`, one per line, or `None.` if there are none. End the note with the line `REWRITE-COUNT: <number of rewrite in M02 rows>`.

**Done when**

- The note has the sections `## Scripts`, `## Dev tooling`, `## PowerShell`, `## Embedded commands` and `## Rewrite in M02`, and ends with a `REWRITE-COUNT:` line.
- Every table row has a full `path:line` that points at its command, and a Disposition from the seven rules.

### M02-T03: Add the bats runner script and ignore its tool cache

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: M02-T01
- Files: `scripts/run-bats.sh`, `.gitignore`
- Verify: `bash scripts/run-bats.sh --version | grep -qx 'Bats 1.14.0' && grep -qxF '.tools/' .gitignore && git check-ignore -q .tools/bats-core/bin/bats`
- Fails first: no (dev script with no tests of its own; Verify fails until the script exists and clones bats-core)
- Commit: `build(orcastrat): add scripts/run-bats.sh, pinned to bats-core v1.14.0`

**Objective**

`bash scripts/run-bats.sh` clones bats-core `v1.14.0` into the git-ignored `.tools/bats-core` when it is missing, then runs bats on `tests/orcastrat`, or with the arguments it was given.

**Read first**

- plan.md Decisions D02, D41 and D47 (D47 gives the exact `--version` output that Verify checks)
- `plans/orcastrat-execution/notes/M02-T01.md` (its `BATS-TAG:` line)

**Interfaces**

- Consumes: none
- Produces: `bash scripts/run-bats.sh [<bats arguments>...]`
- Produces: `.tools/bats-core/bin/bats`
- Produces: `BATS_TAG='v1.14.0'`

**Steps**

1. Read the `BATS-TAG:` line of `plans/orcastrat-execution/notes/M02-T01.md`. If it is not exactly `BATS-TAG: v1.14.0`, stop and report a GAP quoting that line.
2. Create `scripts/run-bats.sh` with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # Runs the orcastrat bats tests (D02). Dev tooling only: the plugin never runs it.
   # With no arguments, runs every test under tests/orcastrat. Any arguments are
   # passed to bats unchanged, for example: bash scripts/run-bats.sh tests/orcastrat/verify.bats
   set -euo pipefail

   BATS_URL='https://github.com/bats-core/bats-core'
   BATS_TAG='v1.14.0'

   repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
   bats_dir="$repo_root/.tools/bats-core"

   if [ ! -d "$bats_dir" ]; then
     git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$BATS_TAG" "$BATS_URL" "$bats_dir"
   fi

   cd "$repo_root"
   if [ "$#" -eq 0 ]; then
     exec "$bats_dir/bin/bats" -r tests/orcastrat
   fi
   exec "$bats_dir/bin/bats" "$@"
   ```

3. At the end of `.gitignore`, after the line `probes/.tools/`, append a blank line and then these two lines:

   ```text
   # bats-core, cloned by scripts/run-bats.sh (D02)
   .tools/
   ```

4. Run Verify. The first run clones bats-core; git may print a warning that the tag `is not a commit`, which is expected for an annotated tag.

**Done when**

- `bash scripts/run-bats.sh --version` prints `Bats 1.14.0` and exits 0 (D47).
- `.tools/` is ignored, and `git status --porcelain` shows only `scripts/run-bats.sh` and `.gitignore`.

### M02-T04: Add the orcastrat portability check to Validate-All.ps1

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `scripts/Validate-All.ps1`, `plugins/orcastrat/probe.ps1`
- Verify: `grep -qF "Write-Host '== orcastrat portability'" scripts/Validate-All.ps1 && test ! -e plugins/orcastrat/probe.ps1 && pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Fails first: no (PowerShell dev tooling with no Pester test; Verify fails until the step exists)
- Commit: `build(orcastrat): check plugins/orcastrat for PowerShell in Validate-All`

**Objective**

`scripts/Validate-All.ps1` has an `== orcastrat portability` step that fails the run on any `.ps1` file under `plugins/orcastrat/`, or any `pwsh` or `powershell` (in any case) in a file under `plugins/orcastrat/scripts/` or `plugins/orcastrat/hooks/`.

**Read first**

- plan.md Decision D11
- `docs/orcastrat-execution-spec.md` §20 item 9
- `scripts/Validate-All.ps1` lines 25–42 (the step pattern to copy)

**Interfaces**

- Consumes: `Write-Host '== shared asset drift'` (existing, `scripts/Validate-All.ps1:35`)
- Produces: `Write-Host '== orcastrat portability'`

**Steps**

1. In `scripts/Validate-All.ps1`, directly after line 37 (`if ($LASTEXITCODE -ne 0) { $failed = $true }`, the last line of the `== shared asset drift` step) and before the blank line and `if ($failed) { exit 1 }`, insert a blank line and then exactly this block:

   ```powershell
   Write-Host '== orcastrat portability'
   $orcastrat  = Join-Path $repoRoot 'plugins/orcastrat'
   $violations = @()
   $violations += @(Get-ChildItem -LiteralPath $orcastrat -Recurse -File |
       Where-Object { $_.Extension -ceq '.ps1' } |
       ForEach-Object { $_.FullName })
   foreach ($sub in 'scripts', 'hooks') {
       $dir = Join-Path $orcastrat $sub
       if (Test-Path -LiteralPath $dir -PathType Container) {
           $violations += @(Get-ChildItem -LiteralPath $dir -Recurse -File |
               Select-String -Pattern 'pwsh|powershell' |
               ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" })
       }
   }
   if ($violations.Count -gt 0) {
       $violations | ForEach-Object { Write-Host $_ }
       $failed = $true
   }
   ```

2. Run `pwsh -NoProfile -File ./scripts/Validate-All.ps1` and confirm it prints `== orcastrat portability` with nothing under it, and ends with `all checks passed`.
3. Create an empty file `plugins/orcastrat/probe.ps1`. Run `pwsh -NoProfile -File ./scripts/Validate-All.ps1; echo "exit=$?"` and confirm it prints the full path of `probe.ps1` under `== orcastrat portability` and `exit=1`.
4. Delete `plugins/orcastrat/probe.ps1`.
5. Run Verify.

**Done when**

- `Validate-All.ps1` passes on the repository as it is, and fails, printing the file's path, while a `.ps1` file exists under `plugins/orcastrat/`.
- `plugins/orcastrat/probe.ps1` does not exist.

### M02-T05: Add the shared bats test helper

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 3
- Depends on: M02-T03
- Files: `tests/orcastrat/test_helper.bash`, `tests/orcastrat/test-helper.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/test-helper.bats`
- Fails first: yes
- Commit: `test(orcastrat): add the bats test helper with fixture repos and a cygpath stub`

**Objective**

`tests/orcastrat/test_helper.bash` gives every bats file `REPO_ROOT`, `make_fixture_repo` and `make_cygpath_stub`, and `tests/orcastrat/test-helper.bats` tests them.

**Read first**

- `docs/orcastrat-execution-spec.md` §20 item 7
- plan.md Decisions D03 and D44

**Interfaces**

- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (M02-T03)
- Produces: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper`
- Produces: `REPO_ROOT`
- Produces: `make_fixture_repo <dir>`
- Produces: `make_cygpath_stub <dir>`

**Steps**

1. Create `tests/orcastrat/test-helper.bats` with exactly this content:

   ```bash
   setup() {
     load test_helper
   }

   @test "REPO_ROOT is the repository root" {
     [ -f "$REPO_ROOT/.claude-plugin/marketplace.json" ]
     [ -d "$REPO_ROOT/plugins/orcastrat" ]
   }

   @test "make_fixture_repo creates a clean repository on main with one commit" {
     make_fixture_repo "$BATS_TEST_TMPDIR/repo"
     run git -C "$BATS_TEST_TMPDIR/repo" rev-list --count HEAD
     [ "$status" -eq 0 ]
     [ "$output" = "1" ]
     run git -C "$BATS_TEST_TMPDIR/repo" symbolic-ref --short HEAD
     [ "$status" -eq 0 ]
     [ "$output" = "main" ]
     run git -C "$BATS_TEST_TMPDIR/repo" status --porcelain
     [ "$status" -eq 0 ]
     [ -z "$output" ]
   }

   @test "make_fixture_repo commits without a global git identity" {
     mkdir -p "$BATS_TEST_TMPDIR/home"
     HOME="$BATS_TEST_TMPDIR/home" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/home/.config" GIT_CONFIG_NOSYSTEM=1 make_fixture_repo "$BATS_TEST_TMPDIR/repo"
     run git -C "$BATS_TEST_TMPDIR/repo" log -1 --format=%ae
     [ "$status" -eq 0 ]
     [ "$output" = "orcastrat-test@example.invalid" ]
   }

   @test "make_cygpath_stub prints each argument in square brackets" {
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     run "$BATS_TEST_TMPDIR/stub-bin/cygpath" -m "/c/Users/me/some dir/file.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [/c/Users/me/some dir/file.txt]" ]
   }
   ```

2. Run Verify and confirm it fails (`test_helper.bash` doesn't exist yet).
3. Create `tests/orcastrat/test_helper.bash` with exactly this content:

   ```bash
   # shellcheck shell=bash
   # Shared helpers for the orcastrat bats tests. Load with: load test_helper

   # Absolute path of the repository root.
   REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

   # make_fixture_repo <dir>: creates a git repository at <dir> on branch main,
   # with a repository-local commit identity and one commit that adds README.md.
   make_fixture_repo() {
     local dir="$1"
     mkdir -p "$dir"
     git -C "$dir" init --quiet
     git -C "$dir" symbolic-ref HEAD refs/heads/main
     git -C "$dir" config user.name 'Orcastrat Test'
     git -C "$dir" config user.email 'orcastrat-test@example.invalid'
     git -C "$dir" config commit.gpgsign false
     printf 'fixture\n' > "$dir/README.md"
     git -C "$dir" add README.md
     git -C "$dir" commit --quiet -m 'Initial commit'
   }

   # make_cygpath_stub <dir>: writes an executable <dir>/cygpath that prints
   # "cygpath-stub" followed by each argument it received in square brackets,
   # on one line. Put <dir> first on PATH to use it.
   make_cygpath_stub() {
     local dir="$1"
     mkdir -p "$dir"
     cat > "$dir/cygpath" <<'STUB'
   #!/usr/bin/env bash
   out='cygpath-stub'
   for arg in "$@"; do
     out="$out [$arg]"
   done
   printf '%s\n' "$out"
   STUB
     chmod +x "$dir/cygpath"
   }
   ```

   The five lines from `#!/usr/bin/env bash` through `STUB` start in column 1 of the file, with no indentation, because they are the body of a heredoc.
4. Run Verify and confirm all four tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/test-helper.bats` reports 4 tests, all `ok`.

### M02-T06: Add lib/common with print_path

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 4
- Depends on: M02-T03, M02-T05
- Files: `plugins/orcastrat/scripts/lib/common`, `tests/orcastrat/lib-common.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/lib-common.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add scripts/lib/common with print_path`

**Objective**

`plugins/orcastrat/scripts/lib/common` defines `print_path <path>`, which prints `cygpath -m <path>` when `cygpath` is on `PATH` and the path unchanged otherwise, and `tests/orcastrat/lib-common.bats` covers both forms with a stub `cygpath`.

**Read first**

- plan.md Decisions D43 and D44
- `docs/orcastrat-execution-spec.md` §20 Rule (bash 3.2, standard utilities only)

**Interfaces**

- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (M02-T03)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `make_cygpath_stub <dir>` (M02-T05)
- Produces: `plugins/orcastrat/scripts/lib/common`
- Produces: `print_path <path>`

**Steps**

1. Create `tests/orcastrat/lib-common.bats` with exactly this content:

   ```bash
   setup() {
     load test_helper
     LIB_COMMON="$REPO_ROOT/plugins/orcastrat/scripts/lib/common"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     mkdir -p "$BATS_TEST_TMPDIR/empty-bin"
   }

   @test "print_path prints the cygpath -m form when cygpath is on PATH" {
     run env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/c/Users/me/file.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [/c/Users/me/file.txt]" ]
   }

   @test "print_path passes a path with spaces to cygpath as one argument" {
     run env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/c/Users/me/some dir/file.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [/c/Users/me/some dir/file.txt]" ]
   }

   @test "print_path prints the path unchanged when cygpath is not on PATH" {
     run env PATH="$BATS_TEST_TMPDIR/empty-bin" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/tmp/some dir/file.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "/tmp/some dir/file.txt" ]
   }
   ```

2. Run Verify and confirm it fails (`lib/common` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/lib/common` (no file extension) with exactly this content:

   ```bash
   # shellcheck shell=bash
   # Shared helpers for the orcastrat scripts. Source it; never run it directly.
   # Bash 3.2 compatible.

   # print_path <path>: prints <path> in the form Claude Code's file tools accept
   # (D43). When cygpath is on PATH (Git for Windows), prints `cygpath -m <path>`,
   # for example C:/Users/me/file.txt. Otherwise prints <path> unchanged.
   print_path() {
     if command -v cygpath >/dev/null 2>&1; then
       cygpath -m "$1"
     else
       printf '%s\n' "$1"
     fi
   }
   ```

4. Run Verify and confirm all three tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/lib-common.bats` reports 3 tests, all `ok`.
- `plugins/orcastrat/scripts/lib/common` contains no `pwsh` or `powershell`, in any case.

### M02-T07: Add the no-PowerShell bats test

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 5
- Depends on: M02-T03, M02-T05, M02-T06
- Files: `tests/orcastrat/no-powershell.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/no-powershell.bats`
- Fails first: yes
- Commit: `test(orcastrat): add the no-PowerShell portability check`

**Objective**

`tests/orcastrat/no-powershell.bats` implements D11: it fails on any `.ps1` file under `plugins/orcastrat/`, or any `pwsh` or `powershell` (in any case) in `plugins/orcastrat/scripts/` or `plugins/orcastrat/hooks/`, passes when those directories are missing, and proves the check catches planted violations.

**Read first**

- plan.md Decision D11
- `docs/orcastrat-execution-spec.md` §20 items 2 and 8

**Interfaces**

- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (M02-T03)
- Consumes: `REPO_ROOT` (M02-T05)
- Produces: `tests/orcastrat/no-powershell.bats`
- Produces: `portability_violations <plugin-dir>`

**Steps**

1. Create `tests/orcastrat/no-powershell.bats` with exactly this content:

   ```bash
   setup() {
     load test_helper
   }

   @test "plugins/orcastrat has no .ps1 file and no pwsh or powershell in scripts or hooks" {
     run portability_violations "$REPO_ROOT/plugins/orcastrat"
     [ "$status" -eq 0 ]
     [ -z "$output" ]
   }

   @test "a .ps1 file anywhere in the plugin is a violation" {
     mkdir -p "$BATS_TEST_TMPDIR/plugin/skills/run"
     printf 'Write-Host hi\n' > "$BATS_TEST_TMPDIR/plugin/skills/run/helper.ps1"
     run portability_violations "$BATS_TEST_TMPDIR/plugin"
     [ "$status" -eq 0 ]
     [[ "$output" == *"skills/run/helper.ps1"* ]]
   }

   @test "mixed-case pwsh in scripts is a violation" {
     mkdir -p "$BATS_TEST_TMPDIR/plugin/scripts"
     printf '#!/usr/bin/env bash\nPwSh -NoProfile -File x\n' > "$BATS_TEST_TMPDIR/plugin/scripts/tool"
     run portability_violations "$BATS_TEST_TMPDIR/plugin"
     [ "$status" -eq 0 ]
     [[ "$output" == *"scripts/tool:2:"* ]]
   }

   @test "powershell in hooks is a violation" {
     mkdir -p "$BATS_TEST_TMPDIR/plugin/hooks"
     printf '#!/usr/bin/env bash\nPowerShell -Command Get-Date\n' > "$BATS_TEST_TMPDIR/plugin/hooks/stop-guard"
     run portability_violations "$BATS_TEST_TMPDIR/plugin"
     [ "$status" -eq 0 ]
     [[ "$output" == *"hooks/stop-guard:2:"* ]]
   }

   @test "pwsh in skill prose is not a violation" {
     mkdir -p "$BATS_TEST_TMPDIR/plugin/skills/run"
     printf 'Call it explicitly: pwsh -NoProfile -File scripts/verify.ps1\n' > "$BATS_TEST_TMPDIR/plugin/skills/run/SKILL.md"
     run portability_violations "$BATS_TEST_TMPDIR/plugin"
     [ "$status" -eq 0 ]
     [ -z "$output" ]
   }

   @test "missing scripts and hooks directories are not violations" {
     mkdir -p "$BATS_TEST_TMPDIR/plugin"
     printf '# Plugin\n' > "$BATS_TEST_TMPDIR/plugin/README.md"
     run portability_violations "$BATS_TEST_TMPDIR/plugin"
     [ "$status" -eq 0 ]
     [ -z "$output" ]
   }
   ```

2. Run Verify and confirm it fails (`portability_violations` isn't defined yet).
3. In `tests/orcastrat/no-powershell.bats`, between the closing `}` of `setup()` and the first `@test`, insert a blank line and then exactly this function:

   ```bash
   # portability_violations <plugin-dir>: prints one line per D11 violation under
   # <plugin-dir>, and nothing when there are none. It lists every file named
   # *.ps1, then every line containing pwsh or powershell, in any case, in a file
   # under <plugin-dir>/scripts or <plugin-dir>/hooks. A missing scripts/ or
   # hooks/ directory is skipped.
   portability_violations() {
     local root="$1" d
     find "$root" -type f -name '*.ps1'
     for d in scripts hooks; do
       if [ -d "$root/$d" ]; then
         grep -rniE 'pwsh|powershell' "$root/$d" || true
       fi
     done
   }
   ```

4. Run Verify and confirm all six tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/no-powershell.bats` reports 6 tests, all `ok`.

### M02-T08: Describe WT_ROOT by intent in the run skill

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: M01-T04, M02-T02
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'prints, made absolute, plus ' plugins/orcastrat/skills/run/SKILL.md && ! grep -n '\$(' plugins/orcastrat/skills/run/SKILL.md | grep -v 'orcastrat-verify.log'`
- Fails first: no (skill text edit with no tests; the Verify greps fail until the edit is made)
- Commit: `refactor(orcastrat): describe WT_ROOT without command substitution`

**Objective**

The run skill's WT_ROOT definition describes the path by intent, with no `$(...)`, so the only `$(...)` left in the run skill is the "Verify a command" log path that M03 replaces.

**Read first**

- `plans/orcastrat-execution/notes/M02-T02.md`, section `## Rewrite in M02`
- `docs/orcastrat-execution-spec.md` §20 item 3
- `plugins/orcastrat/skills/run/SKILL.md` lines 30–41 (the Definitions section)

**Interfaces**

- Consumes: `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>` (M01-T04)
- Produces: WT_ROOT: the directory git rev-parse --git-common-dir prints, made absolute, plus /orcastrat/<plan-slug>

**Steps**

1. Read the `## Rewrite in M02` section of `plans/orcastrat-execution/notes/M02-T02.md`. If it lists anything other than the single line `plugins/orcastrat/skills/run/SKILL.md:32`, stop and report a GAP quoting that section.
2. In `plugins/orcastrat/skills/run/SKILL.md`, replace line 32, which reads:

   ```text
   - **WT_ROOT**: `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>`, made absolute. Task worktrees live under it, inside `.git`, so they never show up in the main checkout's status.
   ```

   with exactly:

   ```text
   - **WT_ROOT**: the directory `git rev-parse --git-common-dir` prints, made absolute, plus `/orcastrat/<plan-slug>`. Task worktrees live under it, inside `.git`, so they never show up in the main checkout's status.
   ```

3. Run Verify.

**Done when**

- Line 32 of the run skill has the new WT_ROOT text.
- The only line of the run skill containing `$(` is the "Verify a command" log-path sentence, which mentions `orcastrat-verify.log`.

### M02-T09: State that Verify commands run with bash -c

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`, `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/agents/planner.md`
- Verify: `grep -qF 'from the repo root on every platform, so it is written in bash syntax' plugins/orcastrat/reference/plan-format.md && grep -qF 'Milestone verify and Final verify follow the same rule' plugins/orcastrat/reference/plan-format.md && grep -qF 'Write every Verify command, Milestone verify, and Final verify in bash syntax' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'Write every Verify command in bash syntax' plugins/orcastrat/agents/planner.md && test "$(grep -lF 'pwsh -NoProfile -File scripts/verify.ps1' plugins/orcastrat/reference/plan-format.md plugins/orcastrat/skills/plan/SKILL.md plugins/orcastrat/agents/planner.md | wc -l)" -eq 3`
- Fails first: no (reference, skill and agent text with no tests; the Verify greps fail until the text is added)
- Commit: `docs(orcastrat): Verify commands run with bash -c on every platform`

**Objective**

The plan format, the `plan` skill and the `planner` agent say that Verify commands (and Milestone and Final verify) run with `bash -c` from the repository root, and that a PowerShell project calls its tooling explicitly.

**Read first**

- `docs/orcastrat-execution-spec.md` §20 item 4

**Interfaces**

- Consumes: none
- Produces: none

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, line 228 (the Verify row of the task field table), insert this text after `(docs, investigate tasks, config with no test).` and before the closing ` |`, with one space before it:

   ```text
   A command runs with `bash -c` from the repo root on every platform, so it is written in bash syntax. A project whose tooling is PowerShell calls it explicitly, for example `pwsh -NoProfile -File scripts/verify.ps1`. Milestone verify and Final verify follow the same rule.
   ```

2. In `plugins/orcastrat/skills/plan/SKILL.md`, directly after line 100 (the bullet that starts `- Write down every value:`), insert this bullet as its own line:

   ```text
   - Write every Verify command, Milestone verify, and Final verify in bash syntax: each runs with `bash -c` from the repository root on every platform. A project whose tooling is PowerShell calls it explicitly, for example `pwsh -NoProfile -File scripts/verify.ps1`.
   ```

3. In `plugins/orcastrat/agents/planner.md`, directly after line 47 (the paragraph that starts `Write a task list in which`), insert a blank line and then this paragraph:

   ```text
   Write every Verify command in bash syntax: it runs with `bash -c` from the repository root on every platform. A project whose tooling is PowerShell calls it explicitly, for example `pwsh -NoProfile -File scripts/verify.ps1`.
   ```

4. Run Verify.

**Done when**

- Each of the three files contains its new text exactly once, and nothing else in them changed.

### M02-T10: Add the advisory non-bash Verify check to the plan-reviewer

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: none
- Files: `plugins/orcastrat/agents/plan-reviewer.md`, `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `grep -qF '11. **Non-bash Verify (advisory).**' plugins/orcastrat/agents/plan-reviewer.md && grep -qx '## Advisory' plugins/orcastrat/agents/plan-reviewer.md && grep -qF 'advisory findings never change STATUS or the count' plugins/orcastrat/agents/plan-reviewer.md && ! grep -qF 'It has exactly one section' plugins/orcastrat/agents/plan-reviewer.md && grep -qF 'fix every issue under its' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'heading are never fixed automatically' plugins/orcastrat/skills/plan/SKILL.md`
- Fails first: no (agent and skill text with no tests; the Verify greps fail until the text is changed)
- Commit: `feat(orcastrat): plan-reviewer flags non-bash Verify commands as advisory`

**Objective**

The plan-reviewer reports a Verify that relies on non-bash syntax under a new `## Advisory` section that never changes its STATUS or count (D45), and `plan` fixes only what `## Issues` lists.

**Read first**

- `docs/orcastrat-execution-spec.md` §20 item 4
- plan.md Decision D45
- `plugins/orcastrat/agents/plan-reviewer.md` lines 35–73 (Check and Report)
- `plugins/orcastrat/skills/plan/SKILL.md`, the paragraph that starts `Each reviewer writes its issues to its Output file` (plan-review handling)

**Interfaces**

- Consumes: `## Issues` (existing, `plugins/orcastrat/agents/plan-reviewer.md:59`)
- Produces: `## Advisory`
- Produces: `11. **Non-bash Verify (advisory).**`

**Steps**

1. In `plugins/orcastrat/agents/plan-reviewer.md`, directly after line 48 (check `10. **Read first.**`), insert this line:

   ```text
   11. **Non-bash Verify (advisory).** Every Verify command, and the milestone's Milestone verify, runs with `bash -c` from the repository root. A command that relies on syntax bash doesn't accept, without calling its interpreter explicitly (for example `pwsh -NoProfile -File scripts/verify.ps1`), is an advisory finding: PowerShell cmdlets such as `Get-ChildItem` or `Select-String`, `$env:NAME`, the `-and`, `-or` and `-not` operators, a backtick line continuation, or cmd.exe syntax such as `%NAME%` or `NUL`. Report it under `## Advisory`, never under `## Issues`.
   ```

2. In the same file, replace the Report section's opening lines, from the line that starts `Write the report to the Output path.` through the line that starts `With no issues, the section says`, with exactly this text (the outer four-backtick fence is not part of it; the inner three-backtick fence is):

   ````text
   Write the report to the Output path. It is the only file you may create or change. It has exactly two sections, in this order, each a numbered list with one finding per item: `## Issues` for what checks 1 to 10 find, and `## Advisory` for what check 11 finds.

   ```
   ## Issues

   1. <task or milestone ID> — <which check> — <problem, quoting the text involved>

   ## Advisory

   1. <task or milestone ID> — non-bash Verify — <problem, quoting the command>
   ```

   A section with nothing in it says `None.` instead.
   ````

3. In the same file, replace the last line of the Report section, which reads:

   ```text
   `APPROVED` means the section says `None.` and the count is 0; any issue at all makes it `ISSUES`.
   ```

   with exactly:

   ```text
   `APPROVED` means `## Issues` says `None.` and the count is 0; any issue at all makes it `ISSUES`. The count covers `## Issues` only: advisory findings never change STATUS or the count, and nobody fixes them automatically.
   ```

4. In `plugins/orcastrat/skills/plan/SKILL.md`, in the paragraph that starts `Each reviewer writes its issues to its Output file`, replace this text:

   ```text
   fix every issue it lists yourself, once, under the same rules you wrote the milestone by in steps 6 to 9.
   ```

   with exactly:

   ```text
   fix every issue under its `## Issues` heading yourself, once, under the same rules you wrote the milestone by in steps 6 to 9. Findings under its `## Advisory` heading are never fixed automatically.
   ```

5. Run Verify.

**Done when**

- `plan-reviewer.md` has check 11, a two-section report template (`## Issues`, then `## Advisory`), and says advisory findings never change STATUS or the count.
- `plan/SKILL.md` fixes only the `## Issues` findings of a plan review.

### M02-T11: Add the three-OS orcastrat CI workflow

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 3
- Depends on: M02-T03
- Files: `.github/workflows/orcastrat.yml`
- Verify: `grep -qF "branches: ['**']" .github/workflows/orcastrat.yml && grep -qF 'os: [ubuntu-latest, macos-latest, windows-latest]' .github/workflows/orcastrat.yml && grep -qF 'run: bash scripts/run-bats.sh' .github/workflows/orcastrat.yml && grep -qF '! -name hooks.json' .github/workflows/orcastrat.yml && git diff --quiet HEAD -- .github/workflows/validate.yml` + review
- Fails first: no (CI configuration that only GitHub Actions runs; the Verify greps fail until the file exists)
- Commit: `ci(orcastrat): run bats on three OSes and shellcheck shipped scripts`

**Objective**

`.github/workflows/orcastrat.yml` runs `bash scripts/run-bats.sh` (which includes the no-PowerShell check) on `ubuntu-latest`, `macos-latest` and `windows-latest` on every push and pull request, and shellchecks the shipped scripts on `ubuntu-latest`, succeeding when there are none.

**Read first**

- plan.md Decisions D02 and D22
- `docs/orcastrat-execution-spec.md` §20 item 8
- `.github/workflows/validate.yml` (the existing workflow's style; leave it unchanged)

**Interfaces**

- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (M02-T03)
- Produces: `.github/workflows/orcastrat.yml`, with jobs `bats` and `shellcheck`

**Steps**

1. Create `.github/workflows/orcastrat.yml` with exactly this content:

   ```yaml
   name: orcastrat

   on:
     push:
       branches: ['**']
     pull_request:

   jobs:
     bats:
       name: bats (${{ matrix.os }})
       runs-on: ${{ matrix.os }}
       strategy:
         fail-fast: false
         matrix:
           os: [ubuntu-latest, macos-latest, windows-latest]
       defaults:
         run:
           shell: bash
       steps:
         - uses: actions/checkout@v4

         - name: Bats tests, including the no-PowerShell check
           run: bash scripts/run-bats.sh

     shellcheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: shellcheck shipped scripts
           run: |
             dirs=''
             for d in plugins/orcastrat/scripts plugins/orcastrat/hooks; do
               if [ -d "$d" ]; then dirs="$dirs $d"; fi
             done
             if [ -z "$dirs" ]; then
               echo 'No shipped scripts yet.'
               exit 0
             fi
             find $dirs -type f ! -name hooks.json -exec shellcheck --shell=bash --external-sources {} +
   ```

2. Run Verify.

**Done when**

- The workflow file matches Step 1 exactly, and `.github/workflows/validate.yml` is unchanged.
