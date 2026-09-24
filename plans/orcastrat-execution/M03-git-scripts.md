# M03: Git bookkeeping scripts (Change 6)

- Status: in-progress
- Format: 2
- Goal: `plugins/orcastrat/scripts/` has `scope-check`, `push-check`, `verify`, `integrate` and `recover`, each with bats tests. Each prints the short fixed-format result the spec gives. `run` uses `scope-check`, `push-check`, `verify` and `recover` for today's scope check, push check, Verify runs and interrupted-run recovery, in place of reasoning through the git steps itself.
- Depends on: M02
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §7 (Change 6) for these five scripts, §2 (the scope and push checks they serve), §20 (Change 19) rules and item 7 (tests), §25 item 4 (both trailers); Decisions D04, D05, D18, D23, D50–D65.

- Script contracts are fixed by Decisions: `verify` output, log naming and stdin (D54); exit status and errors for all five scripts (D55); `push-check` lines (D56); `recover` rules and output (D57); `integrate` empty range and non-conflict failures (D58), conflicts (D51); Windows-path and space tests (D59); `scope-check` path collection (D52) and printed paths (D53); the base passed to `scope-check` and `push-check` (D50).
- D60: `scope-check` stays strict. Where M03 wires `scope-check` into `run`, `run` first commits its own plan-file edits (`- Process:`, `- Escalated:`, notes) in a `chore(plan)` bookkeeping commit, then records the base for the next dispatch. D64 gives the exact order and commit subject.
- `run` calls every script as one line and treats an exit status of 2 as **Stop** with reason SETUP (D63). It passes a Verify command to `verify` as one single-quoted argument (D65).
- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)

- Signatures (D05):
  - `scope-check <dir> <base> <files...>`: prints `OK`, or the out-of-scope paths, one per line. Checks `git diff --name-only <base>..HEAD` plus `git status --porcelain` in `<dir>`.
  - `push-check <dir> <base>`: prints `OK`, or the commits in `<base>..HEAD` that `git branch -r --contains` finds on a remote.
  - `verify <plan-dir> <dir> <command>`: runs `<command>` with `bash -c` in `<dir>`. Writes the full log under `<git-common-dir>/orcastrat/<plan-slug>/logs/`, where the slug is the last path component of `<plan-dir>`. Prints `exit=<n>`, then `log=<path>`, and on failure the log's last 40 lines (D54).
  - `integrate <task-branch> <base>`: cherry-picks `<base>..<task-branch>` onto the current branch. Prints `OK`, or `CONFLICT` plus the conflicted files.
  - `recover <plan-dir>`: lists (a) `todo` tasks whose trailer, `Orcastrat-Task:` or `Orchestratinator-Task:`, is already in history, and (b) tasks with worker commits (subject prefix `<task ID>:`) after the last trailer commit but no trailer of their own.
- Every script sources `lib/common` (M02) and prints each path through `print_path` (D43, D44), for example the verify log path. Tests assert this with the stub `cygpath` that `make_cygpath_stub` in `tests/orcastrat/test_helper.bash` writes. Script Verify commands run `bash scripts/run-bats.sh tests/orcastrat/<script>.bats` (D02).
- Scripts are extensionless, start with `#!/usr/bin/env bash`, and are invoked as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" …` (D04). Bash 3.2 only (M02 Context). They get no executable bit, since they always run through `bash`.
- Tests live in `tests/orcastrat/<script>.bats`. They build fixture repos with `tests/orcastrat/test_helper.bash` (M02), cover Windows-style escaped paths where a script takes paths, and assert output, exit code and files written. No test runs Claude Code.
- Every script and test file a Step gives is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- The tests keep stderr apart with `run --separate-stderr`, which needs bats 1.5 or later, so each test file starts with `bats_require_minimum_version 1.5.0`. They put the stub `cygpath` first on `PATH`, so every printed path has the form `cygpath-stub [-m] [<path>]` on every OS, and they build fixture repos in directories whose names contain a space. On this Windows machine, git prints `LF will be replaced by CRLF` warnings while the tests build fixtures; those warnings are expected.
- The bats files run slowly on Windows. Give a Verify command a Bash timeout of 600000 ms.
- `integrate` is built and tested here, but `run` starts using it in M07 with the parallel rebuild. `recover`'s interrupted-attempt list (b) is acted on by `run` from M05, once workers commit. Until then, `run` uses only list (a).
- D23: `run` keeps its branch check and the `STRAY` stop reason.
- The run executing this plan is the installed, pre-rename plugin, so this plan's commits carry `Orchestratinator-Task:` (D37). Don't run the scripts built here against this plan's own branch as part of a task.

Waves: 5 (widths 1, 5, 2, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §7: `scope-check` prints `OK` or the out-of-scope paths (D05, D52, D53, D55) → M03-T02
- `docs/orcastrat-execution-spec.md` §7: `push-check` prints `OK` or the commits found on a remote (D05, D55, D56) → M03-T03
- `docs/orcastrat-execution-spec.md` §7: `verify` runs the command with `bash -c` in `<dir>`, logs under the git common dir so logs never dirty the tree, and prints `exit=<n>` and, on failure, the last 40 lines (D05, D54, D55) → M03-T04
- `docs/orcastrat-execution-spec.md` §7: `integrate` runs the cherry-pick range and prints `OK`, or `CONFLICT` plus the conflicted files (D51, D55, D58) → M03-T05
- `docs/orcastrat-execution-spec.md` §7: `recover` lists `todo` tasks whose trailer is in history, and tasks with worker commits after the last trailer commit (D55, D57) → M03-T06
- `docs/orcastrat-execution-spec.md` §7: `run` calls the scripts through `${CLAUDE_PLUGIN_ROOT}/scripts/` instead of reasoning through the git steps, and reads only `verify`'s output, never the log → M03-T07, M03-T08, M03-T09
- `docs/orcastrat-execution-spec.md` §7: each script gets bash tests → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §2: the scope check covers `git diff --name-only BASE..HEAD` plus `git status --porcelain` against the task's Files, from the base recorded before dispatch (D50, D60, D64) → M03-T02, M03-T08, M03-T09
- `docs/orcastrat-execution-spec.md` §2: the push check confirms no commit in `BASE..HEAD` is on a remote, else **Stop** with `PUSHED` → M03-T03, M03-T08, M03-T09
- `docs/orcastrat-execution-spec.md` §20 Rule: scripts use bash 3.2, `git` and standard utilities only, and print paths through `print_path` (D43, D44, D53) → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §20 item 3: commands `run` tells Claude to run are single-line script or `git` calls, with no `$(...)` → M03-T07, M03-T08, M03-T09
- `docs/orcastrat-execution-spec.md` §20 item 4: Verify commands run with `bash -c` through `verify` (D65) → M03-T04, M03-T07, M03-T10
- `docs/orcastrat-execution-spec.md` §20 item 7: bats tests with fixture repos and Windows-style paths, asserting output, exit code and files written; no test runs Claude Code (D59) → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §25 item 4: `recover` accepts both `Orcastrat-Task:` and `Orchestratinator-Task:` → M03-T06, M03-T09, M03-T10
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only (git, bats-core) → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §1.6: the shipped runtime follows Change 19 → M03-T01, M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §29 item 3: Change 6's git scripts are built third, after the rename and the harness → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §31: shipped runtime is bash plus `git` only; `Validate-All.ps1` passes → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06
- `docs/orcastrat-execution-spec.md` §32 items 8, 41, 52, 53 and 62: bookkeeping in bash scripts, bash rather than POSIX `sh`, Verify logs inside `.git`, worker commits without a trailer are interrupted attempts, both trailers accepted → M03-T02, M03-T03, M03-T04, M03-T05, M03-T06, M03-T09
- `docs/orcastrat-execution-spec.md` preamble: fewer Opus tokens spent on bookkeeping → M03-T07, M03-T08, M03-T09
- D23: `run` keeps its branch check and the `STRAY` stop reason → M03-T08, M03-T09
- D60, D64: `run` commits its own plan-file edits before recording the next base, and writes `- Process:` lines only after the scope check → M03-T08, M03-T09
- D61: `.gitattributes` forces `eol=lf` on the bash files, and files already committed are renormalized → M03-T01
- D63: a script that exits 2 stops the run with reason SETUP → M03-T07

## Review Focus

- A Verify command containing both single and double quotes, as `run` passes it → `bash -c` receives it as one argument and runs it exactly as written (source: D05, D65). Test: `verify runs a command containing single and double quotes as one argument` in M03-T04.
- `<dir>` is a parallel task's linked worktree while the main checkout has its own untracked file → only the worktree's changes are compared with the Files (source: D50). Test: `scope-check checks a linked worktree against its own HEAD` in M03-T02.
- `<dir>` is a linked worktree whose task branch has a pushed commit → the commit is reported from the worktree's HEAD, and the main checkout's HEAD reports `OK` (source: D50, D56). Test: `push-check checks the HEAD of a linked worktree` in M03-T03.
- A worker deletes a tracked file that isn't in its Files → the deleted path is out of scope (source: spec §2, "`git status --porcelain` must list only the task's Files"). Test: `scope-check lists a deleted tracked file` in M03-T02.
- A trailer commit or a worker commit exists only on another branch → ignored, since only commits reachable from the plan's Branch count (source: D57). Test: `recover ignores trailers and worker commits on other branches` in M03-T06.

## Tasks

### M03-T01: Force LF line endings for bash files

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `.gitattributes`, `scripts/run-bats.sh`, `tests/orcastrat/lib-common.bats`, `tests/orcastrat/no-powershell.bats`, `tests/orcastrat/test-helper.bats`, `tests/orcastrat/test_helper.bash`, `plugins/orcastrat/scripts/lib/common`
- Verify: `test "$(git check-attr eol -- scripts/run-bats.sh probes/x.sh docs/x.bats docs/x.bash plugins/orcastrat/scripts/verify plugins/orcastrat/scripts/lib/common plugins/orcastrat/hooks/stop-guard tests/orcastrat/fixtures/a.txt | grep -c ': eol: lf$')" -eq 8 && git check-attr eol -- README.md | grep -q ': eol: unspecified$' && ! git ls-files --eol -- '*.sh' '*.bats' '*.bash' plugins/orcastrat/scripts tests/orcastrat | grep -v '^i/lf'`
- Fails first: no (git configuration with no test; Verify fails until .gitattributes exists)
- Commit: `build(orcastrat): keep LF line endings in bash files with .gitattributes`

**Objective**

A repository-root `.gitattributes` gives every bash file `eol=lf` (D61), and every bash file already committed is stored with LF.

**Read first**

- plan.md Decision D61

**Interfaces**

- Consumes: none
- Produces: `.gitattributes` with `eol=lf` for `*.sh`, `*.bats`, `*.bash`, `plugins/orcastrat/scripts/**`, `plugins/orcastrat/hooks/**`, `tests/orcastrat/**` and `scripts/run-bats.sh`

**Steps**

1. Create `.gitattributes` at the repository root with exactly this content:

   ```text
   # Bash files keep LF line endings on every platform, whatever core.autocrlf
   # says: bash can't run a script checked out with CRLF (D61).
   *.sh eol=lf
   *.bats eol=lf
   *.bash eol=lf
   plugins/orcastrat/scripts/** eol=lf
   plugins/orcastrat/hooks/** eol=lf
   tests/orcastrat/** eol=lf
   scripts/run-bats.sh eol=lf
   ```

2. Run `git add --renormalize -- '*.sh' '*.bats' '*.bash' plugins/orcastrat/scripts tests/orcastrat`. Don't name `plugins/orcastrat/hooks`: it doesn't exist yet, and git rejects a pathspec that matches no file.
3. Run `git status --porcelain`. It must print `?? .gitattributes`, and any other line it prints must name one of the six other files in Files (a file the renormalize converted to LF). If it names any other path, stop and report BLOCKED with the lines it printed.
4. Run Verify.

**Done when**

- `git check-attr eol` reports `lf` for a path under each of the seven patterns, and `unspecified` for `README.md`.
- `git ls-files --eol` shows `i/lf` for every tracked bash file.

### M03-T02: Add the scope-check script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M03-T01
- Files: `plugins/orcastrat/scripts/scope-check`, `tests/orcastrat/scope-check.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/scope-check.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the scope-check script`

**Objective**

`plugins/orcastrat/scripts/scope-check <dir> <base> <files...>` prints `OK`, or each path changed since `<base>` that isn't in `<files...>`, and `tests/orcastrat/scope-check.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `scope-check` bullet, and §2, the "Scope check" bullet
- plan.md Decisions D52, D53, D55 and D59
- `plugins/orcastrat/scripts/lib/common` (`print_path`)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/scope-check`
- Produces: `scope-check <dir> <base> <files...>`
- Produces: `scope-check stdout: OK, or each out-of-scope path once, one per line, through print_path`
- Produces: `scope-check exit status: 0 after its result; 2 with one stderr line error: <message>`

**Steps**

1. Create `tests/orcastrat/scope-check.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/scope-check"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     BASE="$(git -C "$REPO" rev-parse HEAD)"
   }

   # run_script <args...>: runs scope-check with the stub cygpath first on PATH,
   # keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # write_file <path> <content>: writes <content> to <path> inside the fixture repo.
   write_file() {
     mkdir -p "$(dirname "$REPO/$1")"
     printf '%s\n' "$2" > "$REPO/$1"
   }

   # commit_file <path> <content>: writes <path> and commits it.
   commit_file() {
     write_file "$1" "$2"
     git -C "$REPO" add -- "$1"
     git -C "$REPO" commit --quiet -m "add $1"
   }

   @test "scope-check prints OK when every changed path is in the files" {
     commit_file "src/a.txt" "a"
     write_file "src/b.txt" "b"
     run_script "$REPO" "$BASE" "src/a.txt" "src/b.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     [ -z "$stderr" ]
   }

   @test "scope-check prints committed and uncommitted paths outside the files through print_path" {
     commit_file "src/a.txt" "a"
     commit_file "extra.txt" "x"
     write_file "notes/x.md" "n"
     run_script "$REPO" "$BASE" "src/a.txt"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "cygpath-stub [-m] [extra.txt]" ]
     [ "${lines[1]}" = "cygpath-stub [-m] [notes/x.md]" ]
   }

   @test "scope-check lists a modified tracked file" {
     write_file "README.md" "changed"
     run_script "$REPO" "$BASE" "src/a.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [README.md]" ]
   }

   @test "scope-check lists both paths of a staged rename" {
     mkdir -p "$REPO/docs"
     git -C "$REPO" mv README.md docs/README.md
     run_script "$REPO" "$BASE" "docs/README.md"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [README.md]" ]
   }

   @test "scope-check matches names with spaces and non-ASCII characters exactly" {
     write_file "src/a b.txt" "a"
     write_file "café.txt" "c"
     run_script "$REPO" "$BASE" "src/a b.txt" "café.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "scope-check prints names with spaces and non-ASCII characters unquoted" {
     write_file "src/a b.txt" "a"
     write_file "café.txt" "c"
     run_script "$REPO" "$BASE" "other.txt"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "cygpath-stub [-m] [café.txt]" ]
     [ "${lines[1]}" = "cygpath-stub [-m] [src/a b.txt]" ]
   }

   @test "scope-check lists an untracked file in a new directory by its full path" {
     write_file "newdir/sub/file.txt" "f"
     run_script "$REPO" "$BASE" "newdir/sub/file.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     run_script "$REPO" "$BASE" "other.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [newdir/sub/file.txt]" ]
   }

   @test "scope-check prints a path that is both committed and modified once" {
     commit_file "extra.txt" "x"
     write_file "extra.txt" "y"
     run_script "$REPO" "$BASE" "src/a.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [extra.txt]" ]
   }

   @test "scope-check accepts <dir> in both drive-letter forms" {
     command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
     commit_file "extra.txt" "x"
     win_m="$(cygpath -m "$REPO")"
     win_w="$(cygpath -w "$REPO")"
     run_script "$win_m" "$BASE" "src/a.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [extra.txt]" ]
     run_script "$win_w" "$BASE" "extra.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "scope-check lists a deleted tracked file" {
     rm "$REPO/README.md"
     run_script "$REPO" "$BASE" "src/a.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [README.md]" ]
   }

   @test "scope-check checks a linked worktree against its own HEAD" {
     git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
     printf 'w\n' > "$BATS_TEST_TMPDIR/task tree/in-tree.txt"
     printf 'm\n' > "$REPO/main-only.txt"
     run_script "$BATS_TEST_TMPDIR/task tree" "$BASE" "other.txt"
     [ "$status" -eq 0 ]
     [ "$output" = "cygpath-stub [-m] [in-tree.txt]" ]
   }

   @test "scope-check exits 2 with fewer than three arguments" {
     run_script "$REPO" "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: scope-check <dir> <base> <files...>" ]
   }

   @test "scope-check exits 2 when <dir> is not a directory" {
     run_script "$BATS_TEST_TMPDIR/missing" "$BASE" "a.txt"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not a directory: "* ]]
   }

   @test "scope-check exits 2 when <dir> is outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     run_script "$BATS_TEST_TMPDIR/plain dir" "$BASE" "a.txt"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: "* ]]
   }

   @test "scope-check exits 2 when <base> is not a commit" {
     run_script "$REPO" "no-such-commit" "a.txt"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: not a commit: no-such-commit" ]
   }
   ```

2. Run Verify and confirm it fails (`scope-check` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/scope-check` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # scope-check <dir> <base> <files...>
   #
   # Prints every path changed in <dir> since <base> that is not one of <files...>,
   # once each, one per line, through print_path; or OK when there is none.
   # The changed paths are those of `git diff --name-only <base>..HEAD` plus every
   # path `git status --porcelain` shows, both paths of a rename or copy included.
   # Both are read in their -z forms, so names with spaces or non-ASCII characters
   # are compared exactly, and untracked files are listed one by one (D52).
   # Exits 0 after printing its result. On a usage error, prints one
   # `error: <message>` line on stderr, nothing on stdout, and exits 2 (D55).
   # Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   if [ "$#" -lt 3 ]; then
     fail 'usage: scope-check <dir> <base> <files...>'
   fi
   dir=$1
   base=$2
   shift 2

   [ -d "$dir" ] || fail "not a directory: $(print_path "$dir")"
   [ "$(git -C "$dir" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$dir")"
   git -C "$dir" rev-parse --verify --quiet "$base^{commit}" >/dev/null ||
     fail "not a commit: $base"

   changed=()

   # add_changed <path>: appends <path> to changed unless it is already there.
   add_changed() {
     local p
     for p in "${changed[@]}"; do
       if [ "$p" = "$1" ]; then
         return 0
       fi
     done
     changed[${#changed[@]}]=$1
   }

   while IFS= read -r -d '' path; do
     add_changed "$path"
   done < <(git -C "$dir" diff --no-color --name-only --no-renames -z "$base..HEAD" 2>/dev/null)

   # Each status entry is "XY <path>". A rename or copy (R or C in X or Y) is
   # followed by one more entry holding the original path.
   orig_next=0
   while IFS= read -r -d '' entry; do
     if [ "$orig_next" = 1 ]; then
       add_changed "$entry"
       orig_next=0
       continue
     fi
     add_changed "${entry:3}"
     case ${entry:0:2} in
       R* | C* | ?R | ?C) orig_next=1 ;;
     esac
   done < <(git -C "$dir" status --porcelain -z --untracked-files=all 2>/dev/null)

   found=0
   for path in "${changed[@]}"; do
     in_scope=0
     for file in "$@"; do
       if [ "$path" = "$file" ]; then
         in_scope=1
         break
       fi
     done
     if [ "$in_scope" = 0 ]; then
       print_path "$path"
       found=1
     fi
   done

   if [ "$found" = 0 ]; then
     printf 'OK\n'
   fi
   exit 0
   ```

4. Run Verify and confirm all 15 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/scope-check.bats` reports 15 tests and no failure.
- `plugins/orcastrat/scripts/scope-check` contains no `pwsh` or `powershell`, in any case.

### M03-T03: Add the push-check script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M03-T01
- Files: `plugins/orcastrat/scripts/push-check`, `tests/orcastrat/push-check.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/push-check.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the push-check script`

**Objective**

`plugins/orcastrat/scripts/push-check <dir> <base>` prints `OK`, or each commit in `<base>..HEAD` that is on a remote-tracking branch, and `tests/orcastrat/push-check.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `push-check` bullet, and §2, the "Push check" bullet
- plan.md Decisions D50, D55, D56 and D59
- `plugins/orcastrat/scripts/lib/common` (`print_path`)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/push-check`
- Produces: `push-check <dir> <base>`
- Produces: `push-check stdout: OK, or one <full sha> <subject> line per commit on a remote, oldest first`
- Produces: `push-check exit status: 0 after its result; 2 with one stderr line error: <message>`

**Steps**

1. Create `tests/orcastrat/push-check.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/push-check"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     BASE="$(git -C "$REPO" rev-parse HEAD)"
   }

   # run_script <args...>: runs push-check with the stub cygpath first on PATH,
   # keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # commit_change <subject>: commits one new file named after the subject.
   commit_change() {
     printf '%s\n' "$1" > "$REPO/$1.txt"
     git -C "$REPO" add -- "$1.txt"
     git -C "$REPO" commit --quiet -m "$1"
   }

   @test "push-check prints OK when no commit is on a remote" {
     commit_change "first change"
     commit_change "second change"
     run_script "$REPO" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     [ -z "$stderr" ]
   }

   @test "push-check prints OK when <base> is HEAD" {
     git -C "$REPO" update-ref refs/remotes/origin/main "$BASE"
     run_script "$REPO" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "push-check prints each pushed commit, oldest first, as full sha and subject" {
     commit_change "first change"
     first="$(git -C "$REPO" rev-parse HEAD)"
     commit_change "second change"
     second="$(git -C "$REPO" rev-parse HEAD)"
     commit_change "third change"
     git -C "$REPO" update-ref refs/remotes/origin/main "$second"
     run_script "$REPO" "$BASE"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "$first first change" ]
     [ "${lines[1]}" = "$second second change" ]
   }

   @test "push-check ignores commits at or before <base>" {
     commit_change "first change"
     git -C "$REPO" update-ref refs/remotes/origin/main HEAD
     base2="$(git -C "$REPO" rev-parse HEAD)"
     commit_change "second change"
     run_script "$REPO" "$base2"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "push-check accepts <dir> in both drive-letter forms" {
     command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
     commit_change "first change"
     first="$(git -C "$REPO" rev-parse HEAD)"
     git -C "$REPO" update-ref refs/remotes/origin/main "$first"
     win_m="$(cygpath -m "$REPO")"
     win_w="$(cygpath -w "$REPO")"
     run_script "$win_m" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "$first first change" ]
     run_script "$win_w" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "$first first change" ]
   }

   @test "push-check checks the HEAD of a linked worktree" {
     git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
     printf 'w\n' > "$BATS_TEST_TMPDIR/task tree/w.txt"
     git -C "$BATS_TEST_TMPDIR/task tree" add w.txt
     git -C "$BATS_TEST_TMPDIR/task tree" commit --quiet -m "worktree change"
     sha="$(git -C "$BATS_TEST_TMPDIR/task tree" rev-parse HEAD)"
     git -C "$REPO" update-ref refs/remotes/origin/task "$sha"
     run_script "$BATS_TEST_TMPDIR/task tree" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "$sha worktree change" ]
     run_script "$REPO" "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "push-check exits 2 with the wrong number of arguments" {
     run_script "$REPO"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: push-check <dir> <base>" ]
   }

   @test "push-check exits 2 when <dir> is not a directory" {
     run_script "$BATS_TEST_TMPDIR/missing" "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not a directory: "* ]]
   }

   @test "push-check exits 2 when <dir> is outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     run_script "$BATS_TEST_TMPDIR/plain dir" "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: "* ]]
   }

   @test "push-check exits 2 when <base> is not a commit" {
     run_script "$REPO" "no-such-commit"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: not a commit: no-such-commit" ]
   }
   ```

2. Run Verify and confirm it fails (`push-check` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/push-check` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # push-check <dir> <base>
   #
   # Prints each commit in <base>..HEAD of <dir> that `git branch -r --contains`
   # finds on a remote-tracking branch, oldest first, as "<full sha> <subject>";
   # or OK when there is none (D56).
   # Exits 0 after printing its result. On a usage error, prints one
   # `error: <message>` line on stderr, nothing on stdout, and exits 2 (D55).
   # Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   if [ "$#" -ne 2 ]; then
     fail 'usage: push-check <dir> <base>'
   fi
   dir=$1
   base=$2

   [ -d "$dir" ] || fail "not a directory: $(print_path "$dir")"
   [ "$(git -C "$dir" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$dir")"
   git -C "$dir" rev-parse --verify --quiet "$base^{commit}" >/dev/null ||
     fail "not a commit: $base"

   found=0
   while IFS= read -r line; do
     sha=${line%% *}
     if [ -n "$(git -C "$dir" branch -r --contains "$sha")" ]; then
       printf '%s\n' "$line"
       found=1
     fi
   done < <(git -C "$dir" log --reverse --format='%H %s' "$base..HEAD" 2>/dev/null)

   if [ "$found" = 0 ]; then
     printf 'OK\n'
   fi
   exit 0
   ```

4. Run Verify and confirm all 10 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/push-check.bats` reports 10 tests and no failure.
- `plugins/orcastrat/scripts/push-check` contains no `pwsh` or `powershell`, in any case.

### M03-T04: Add the verify script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M03-T01
- Files: `plugins/orcastrat/scripts/verify`, `tests/orcastrat/verify.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/verify.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the verify script`

**Objective**

`plugins/orcastrat/scripts/verify <plan-dir> <dir> <command>` runs the command with `bash -c` in `<dir>`, logs its output inside `.git`, and prints `exit=<n>`, `log=<path>` and, on failure, the log's last 40 lines, and `tests/orcastrat/verify.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `verify` bullet
- plan.md Decisions D05, D54, D55, D59 and D65
- `plugins/orcastrat/scripts/lib/common` (`print_path`)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/verify`
- Produces: `verify <plan-dir> <dir> <command>`
- Produces: `verify stdout: exit=<n>, then log=<log path> through print_path, then the log's last 40 lines when n isn't 0`
- Produces: `verify log: <git-common-dir>/orcastrat/<plan-slug>/logs/<UTC YYYYMMDDTHHMMSSZ>-<pid>.log`
- Produces: `verify exit status: 0 after its result; 2 with one stderr line error: <message>`

**Steps**

1. Create `tests/orcastrat/verify.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/verify"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     PLAN="$REPO/plans/my plan"
     mkdir -p "$PLAN"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
   }

   # run_script <args...>: runs verify with the stub cygpath first on PATH,
   # keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # log_path_of <log line>: prints the path the stub cygpath received in a
   # "log=cygpath-stub [-m] [<path>]" line.
   log_path_of() {
     local p="${1#log=cygpath-stub \[-m\] \[}"
     printf '%s\n' "${p%\]}"
   }

   # log_count <slug>: prints how many .log files the fixture repo holds for <slug>.
   log_count() {
     find "$REPO/.git/orcastrat/$1/logs" -type f -name '*.log' | wc -l | tr -d ' '
   }

   @test "verify runs the command in <dir> and prints exit=0 and the log path through print_path" {
     run_script "$PLAN" "$REPO" 'printf "ran in %s\n" "$(basename "$PWD")"'
     [ "$status" -eq 0 ]
     [ -z "$stderr" ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "exit=0" ]
     [[ "${lines[1]}" == "log=cygpath-stub [-m] ["*"/.git/orcastrat/my plan/logs/"*".log]" ]]
     log="$(log_path_of "${lines[1]}")"
     [[ "$(basename "$log")" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+\.log$ ]]
     grep -qx "ran in fixture repo" "$log"
   }

   @test "verify on failure prints exit=<n>, the log path and the log's last 40 lines" {
     run_script "$PLAN" "$REPO" 'i=1; while [ $i -le 50 ]; do echo "line $i"; i=$((i + 1)); done; exit 3'
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 42 ]
     [ "${lines[0]}" = "exit=3" ]
     [[ "${lines[1]}" == "log=cygpath-stub [-m] ["*".log]" ]]
     [ "${lines[2]}" = "line 11" ]
     [ "${lines[41]}" = "line 50" ]
   }

   @test "verify writes stdout and stderr to the log and gives the command an empty stdin" {
     run --separate-stderr bash -c 'printf "typed\n" | env PATH="$1:$PATH" bash "$2" "$3" "$4" "$5"' _ \
       "$BATS_TEST_TMPDIR/stub-bin" "$SCRIPT" "$PLAN" "$REPO" \
       'echo to-stdout; echo to-stderr >&2; if read -r line; then echo "stdin:$line"; else echo stdin-empty; fi'
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     log="$(log_path_of "${lines[1]}")"
     grep -qx "to-stdout" "$log"
     grep -qx "to-stderr" "$log"
     grep -qx "stdin-empty" "$log"
   }

   @test "verify writes a new log on every call and keeps the old ones" {
     run_script "$PLAN" "$REPO" 'true'
     [ "$status" -eq 0 ]
     run_script "$PLAN" "$REPO" 'false'
     [ "$status" -eq 0 ]
     [ "${lines[0]}" = "exit=1" ]
     [ "$(log_count "my plan")" = "2" ]
   }

   @test "verify leaves the working tree clean" {
     run_script "$PLAN" "$REPO" 'echo hello'
     [ "$status" -eq 0 ]
     run git -C "$REPO" status --porcelain
     [ -z "$output" ]
   }

   @test "verify writes a worktree's logs under the main repository's git common dir" {
     git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
     run_script "$PLAN" "$BATS_TEST_TMPDIR/task tree" 'echo in-worktree'
     [ "$status" -eq 0 ]
     [ "${lines[0]}" = "exit=0" ]
     [ "$(log_count "my plan")" = "1" ]
     run git -C "$BATS_TEST_TMPDIR/task tree" status --porcelain
     [ -z "$output" ]
   }

   @test "verify takes the slug from the last component of <plan-dir>, ignoring a trailing slash" {
     mkdir -p "$REPO/plans/demo"
     run_script "$REPO/plans/demo/" "$REPO" 'true'
     [ "$status" -eq 0 ]
     [ "$(log_count demo)" = "1" ]
   }

   @test "verify accepts <plan-dir> and <dir> in both drive-letter forms" {
     command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
     mkdir -p "$REPO/plans/demo"
     run_script "$(cygpath -m "$REPO/plans/demo")" "$(cygpath -m "$REPO")" 'true'
     [ "$status" -eq 0 ]
     [ "${lines[0]}" = "exit=0" ]
     run_script "$(cygpath -w "$REPO/plans/demo")" "$(cygpath -w "$REPO")" 'true'
     [ "$status" -eq 0 ]
     [ "${lines[0]}" = "exit=0" ]
     [ "$(log_count demo)" = "2" ]
   }

   @test "verify runs a command containing single and double quotes as one argument" {
     run_script "$PLAN" "$REPO" "printf '%s\n' \"it's quoted\" 'and \"this\" too'"
     [ "$status" -eq 0 ]
     [ "${lines[0]}" = "exit=0" ]
     log="$(log_path_of "${lines[1]}")"
     grep -qxF "it's quoted" "$log"
     grep -qxF 'and "this" too' "$log"
   }

   @test "verify exits 2 with the wrong number of arguments" {
     run_script "$PLAN" "$REPO"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: verify <plan-dir> <dir> <command>" ]
   }

   @test "verify exits 2 when <plan-dir> is not a directory" {
     run_script "$BATS_TEST_TMPDIR/missing" "$REPO" 'true'
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not a directory: "* ]]
   }

   @test "verify exits 2 when <dir> is not a directory" {
     run_script "$PLAN" "$BATS_TEST_TMPDIR/missing" 'true'
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not a directory: "* ]]
   }

   @test "verify exits 2 when <dir> is outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     run_script "$PLAN" "$BATS_TEST_TMPDIR/plain dir" 'true'
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: "* ]]
   }
   ```

2. Run Verify and confirm it fails (`verify` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/verify` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # verify <plan-dir> <dir> <command>
   #
   # Runs <command> with `bash -c` in <dir>, stdin from /dev/null, stdout and
   # stderr both to a new log file, <UTC YYYYMMDDTHHMMSSZ>-<pid>.log, under
   # <git-common-dir>/orcastrat/<plan-slug>/logs/, where <plan-slug> is the last
   # path component of <plan-dir>. Logs live inside .git, so they never dirty the
   # tree; this script never deletes them (D54).
   # Prints `exit=<n>`, then `log=<log path>` through print_path, then, when <n>
   # isn't 0, the log's last 40 lines.
   # Exits 0 after printing its result, whatever <command> returned. On a usage
   # error, prints one `error: <message>` line on stderr, nothing on stdout, and
   # exits 2 (D55). Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   if [ "$#" -ne 3 ]; then
     fail 'usage: verify <plan-dir> <dir> <command>'
   fi
   plan_dir=$1
   dir=$2
   cmd=$3

   [ -d "$plan_dir" ] || fail "not a directory: $(print_path "$plan_dir")"
   [ -d "$dir" ] || fail "not a directory: $(print_path "$dir")"
   [ "$(git -C "$dir" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$dir")"

   # The slug is the last component of <plan-dir>. Either separator may be used,
   # and trailing separators are ignored.
   slug=$(printf '%s\n' "$plan_dir" | sed -e 's#\\#/#g' -e 's#/*$##' -e 's#.*/##')

   common=$(git -C "$dir" rev-parse --git-common-dir)
   common_abs=$(cd "$dir" && cd "$common" && pwd) ||
     fail "cannot resolve the git common dir of: $(print_path "$dir")"
   log_dir="$common_abs/orcastrat/$slug/logs"
   mkdir -p "$log_dir" || fail "cannot create the log directory: $(print_path "$log_dir")"
   log="$log_dir/$(date -u +%Y%m%dT%H%M%SZ)-$$.log"

   (cd "$dir" && bash -c "$cmd") </dev/null >"$log" 2>&1
   n=$?

   printf 'exit=%s\n' "$n"
   printf 'log=%s\n' "$(print_path "$log")"
   if [ "$n" -ne 0 ]; then
     tail -n 40 "$log"
   fi
   exit 0
   ```

4. Run Verify and confirm all 13 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/verify.bats` reports 13 tests and no failure.
- `plugins/orcastrat/scripts/verify` contains no `pwsh` or `powershell`, in any case.

### M03-T05: Add the integrate script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M03-T01
- Files: `plugins/orcastrat/scripts/integrate`, `tests/orcastrat/integrate.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/integrate.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the integrate script`

**Objective**

`plugins/orcastrat/scripts/integrate <task-branch> <base>` cherry-picks `<base>..<task-branch>` onto the current branch and prints `OK`, or `CONFLICT` plus the conflicted files, and `tests/orcastrat/integrate.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `integrate` bullet, and §6 item 5
- plan.md Decisions D51, D53, D55 and D58
- `plugins/orcastrat/scripts/lib/common` (`print_path`)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/integrate`
- Produces: `integrate <task-branch> <base>`
- Produces: `integrate stdout: OK, or CONFLICT then one conflicted file per line through print_path, with the cherry-pick left in progress`
- Produces: `integrate exit status: 0 after its result; 2 with one stderr line error: <message>, after aborting a cherry-pick in progress`

**Steps**

1. Create `tests/orcastrat/integrate.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/integrate"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     BASE="$(git -C "$REPO" rev-parse HEAD)"
     git -C "$REPO" branch task
     cd "$REPO"
   }

   # run_script <args...>: runs integrate in the current directory with the stub
   # cygpath first on PATH, keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # commit_on <branch> <path> <content> <message>: checks out <branch>, writes
   # <content> to <path>, commits it with <message>, and checks out main again.
   commit_on() {
     git -C "$REPO" checkout --quiet "$1"
     printf '%s\n' "$3" > "$REPO/$2"
     git -C "$REPO" add -- "$2"
     git -C "$REPO" commit --quiet -m "$4"
     git -C "$REPO" checkout --quiet main
   }

   @test "integrate cherry-picks every commit of the range onto the current branch and prints OK" {
     commit_on task "a.txt" "a" "M01-T01: add a"
     commit_on task "b.txt" "b" "$(printf 'M01-T01: add b\n\nOrcastrat-Task: M01-T01')"
     commit_on main "c.txt" "c" "main moves on"
     run_script task "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     [ -z "$stderr" ]
     run git -C "$REPO" log --format=%s -3
     [ "${lines[0]}" = "M01-T01: add b" ]
     [ "${lines[1]}" = "M01-T01: add a" ]
     [ "${lines[2]}" = "main moves on" ]
     run git -C "$REPO" log -1 --format=%b
     [ "$output" = "Orcastrat-Task: M01-T01" ]
   }

   @test "integrate prints OK and changes nothing for an empty range" {
     head_before="$(git -C "$REPO" rev-parse HEAD)"
     run_script task "$BASE"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
   }

   @test "integrate leaves a conflicting cherry-pick in progress and prints CONFLICT and the conflicted files" {
     commit_on task "shared file.txt" "task version" "M01-T01: task edit"
     commit_on main "shared file.txt" "main version" "main edit"
     run_script task "$BASE"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "CONFLICT" ]
     [ "${lines[1]}" = "cygpath-stub [-m] [shared file.txt]" ]
     git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
   }

   @test "integrate aborts and exits 2 when a commit becomes empty" {
     commit_on task "same.txt" "same" "M01-T01: add same"
     commit_on main "same.txt" "same" "main adds the same file"
     head_before="$(git -C "$REPO" rev-parse HEAD)"
     run_script task "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: cherry-pick of "*" failed; nothing was applied" ]]
     [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
     ! git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
     [ ! -d "$REPO/.git/sequencer" ]
   }

   @test "integrate aborts and exits 2 when local changes are in the way" {
     commit_on task "a.txt" "a" "M01-T01: add a"
     commit_on task "README.md" "task readme" "M01-T01: edit readme"
     printf 'local edit\n' > "$REPO/README.md"
     head_before="$(git -C "$REPO" rev-parse HEAD)"
     run_script task "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: cherry-pick of "*" failed; nothing was applied" ]]
     [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
     [ "$(cat "$REPO/README.md")" = "local edit" ]
     ! git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
     [ ! -d "$REPO/.git/sequencer" ]
   }

   @test "integrate exits 2 with the wrong number of arguments" {
     run_script task
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: integrate <task-branch> <base>" ]
   }

   @test "integrate exits 2 when <task-branch> is not a commit" {
     run_script no-such-branch "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: not a commit: no-such-branch" ]
   }

   @test "integrate exits 2 when <base> is not a commit" {
     run_script task no-such-commit
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: not a commit: no-such-commit" ]
   }

   @test "integrate exits 2 outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     cd "$BATS_TEST_TMPDIR/plain dir"
     run_script task "$BASE"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: "* ]]
   }
   ```

2. Run Verify and confirm it fails (`integrate` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/integrate` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # integrate <task-branch> <base>
   #
   # Cherry-picks <base>..<task-branch> onto the current branch of the repository
   # in the current directory. Prints OK when every commit applied, or when the
   # range is empty (then nothing changes, D58). On a conflict, leaves the
   # cherry-pick in progress and prints CONFLICT, then each conflicted file, one
   # per line, through print_path (D51, D53).
   # Exits 0 after printing its result. Any other cherry-pick failure (a commit
   # that is or becomes empty, local changes in the way) aborts the cherry-pick
   # when one is in progress, and is an error (D58). On an error, prints one
   # `error: <message>` line on stderr, nothing on stdout, and exits 2 (D55).
   # Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   if [ "$#" -ne 2 ]; then
     fail 'usage: integrate <task-branch> <base>'
   fi
   branch=$1
   base=$2

   [ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$PWD")"
   git rev-parse --verify --quiet "$branch^{commit}" >/dev/null ||
     fail "not a commit: $branch"
   git rev-parse --verify --quiet "$base^{commit}" >/dev/null ||
     fail "not a commit: $base"

   if [ "$(git rev-list --count "$base..$branch")" = 0 ]; then
     printf 'OK\n'
     exit 0
   fi

   if git cherry-pick "$base..$branch" >/dev/null 2>&1; then
     printf 'OK\n'
     exit 0
   fi

   conflict=0
   while IFS= read -r -d '' path; do
     if [ "$conflict" = 0 ]; then
       printf 'CONFLICT\n'
       conflict=1
     fi
     print_path "$path"
   done < <(git diff --name-only --diff-filter=U -z 2>/dev/null)
   if [ "$conflict" = 1 ]; then
     exit 0
   fi

   if git rev-parse --verify --quiet CHERRY_PICK_HEAD >/dev/null ||
     [ -d "$(git rev-parse --git-path sequencer)" ]; then
     git cherry-pick --abort >/dev/null 2>&1
   fi
   fail "cherry-pick of $base..$branch failed; nothing was applied"
   ```

4. Run Verify and confirm all 9 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/integrate.bats` reports 9 tests, all `ok`.
- `plugins/orcastrat/scripts/integrate` contains no `pwsh` or `powershell`, in any case.

### M03-T06: Add the recover script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M03-T01
- Files: `plugins/orcastrat/scripts/recover`, `tests/orcastrat/recover.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/recover.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the recover script`

**Objective**

`plugins/orcastrat/scripts/recover <plan-dir>` prints `done <task ID>` or `interrupted <task ID>` for each affected `todo` task of the plan, or `OK`, accepting both trailers, and `tests/orcastrat/recover.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `recover` bullet, and §25 item 4
- plan.md Decisions D55, D57 and D59
- `plugins/orcastrat/scripts/lib/common` (`print_path`)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/recover`
- Produces: `recover <plan-dir>`
- Produces: `recover stdout: OK, or one line per affected todo task in table order then task order, done <task ID> or interrupted <task ID>`
- Produces: `recover exit status: 0 after its result; 2 with one stderr line error: <message>`

**Steps**

1. Create `tests/orcastrat/recover.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/recover"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     git -C "$REPO" checkout --quiet -b demo-branch
     PLAN="$REPO/plans/demo plan"
     mkdir -p "$PLAN"
     write_plan demo-branch
     write_milestones
   }

   # run_script <args...>: runs recover with the stub cygpath first on PATH,
   # keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # write_plan <branch>: writes plan.md with `- Branch: <branch>` and a
   # Milestones table naming M01-first.md, then M02-second.md.
   write_plan() {
     printf '%s\n' \
       '# Plan: Demo' \
       '' \
       "- Branch: $1" \
       '- Status: in-progress' \
       '' \
       '## Milestones' \
       '' \
       '| ID | Title | Status | File |' \
       '|---|---|---|---|' \
       '| M01 | First | done | M01-first.md |' \
       '| M02 | Second | in-progress | M02-second.md |' \
       '' \
       '## Decisions' \
       '' \
       '- D01: Nothing yet.' > "$PLAN/plan.md"
   }

   # write_milestones: writes M01-first.md (M01-T01 done, M01-T02 todo) and
   # M02-second.md (M02-T01 todo, M02-T02 todo, M02-T03 done). M02-T01's Steps
   # hold a fenced block with a task heading and a todo status in column 1.
   write_milestones() {
     printf '%s\n' \
       '# M01: First' \
       '' \
       '- Status: done' \
       '' \
       '## Tasks' \
       '' \
       '### M01-T01: Do one' \
       '' \
       '- Kind: change' \
       '- Status: done' \
       '' \
       '### M01-T02: Do two' \
       '' \
       '- Kind: change' \
       '- Status: todo' > "$PLAN/M01-first.md"
     printf '%s\n' \
       '# M02: Second' \
       '' \
       '- Status: in-progress' \
       '' \
       '## Tasks' \
       '' \
       '### M02-T01: Do three' \
       '' \
       '- Status: todo' \
       '' \
       '**Steps**' \
       '' \
       '1. Write this example:' \
       '' \
       '````markdown' \
       '```' \
       '### M09-T09: Not a task' \
       '' \
       '- Status: todo' \
       '```' \
       '````' \
       '' \
       '### M02-T02: Do four' \
       '' \
       '- Status: todo' \
       '' \
       '### M02-T03: Do five' \
       '' \
       '- Status: done' > "$PLAN/M02-second.md"
   }

   # add_commit <subject> [<body>]: adds an empty commit to demo-branch.
   add_commit() {
     if [ "$#" -eq 2 ]; then
       git -C "$REPO" commit --quiet --allow-empty -m "$1" -m "$2"
     else
       git -C "$REPO" commit --quiet --allow-empty -m "$1"
     fi
   }

   # to_crlf <file>: rewrites <file> with CRLF line endings.
   to_crlf() {
     awk '{ printf "%s\r\n", $0 }' "$1" > "$1.crlf"
     mv "$1.crlf" "$1"
   }

   @test "recover prints OK when the plan's branch does not exist" {
     write_plan no-such-branch
     add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
     [ -z "$stderr" ]
   }

   @test "recover prints OK when no todo task has a trailer or a worker commit" {
     add_commit "feat: unrelated work"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "recover prints done for a todo task with an Orcastrat-Task trailer" {
     add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "done M01-T02" ]
   }

   @test "recover prints done for a todo task with an Orchestratinator-Task trailer" {
     add_commit "feat: four" "Orchestratinator-Task: M02-T02"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "done M02-T02" ]
   }

   @test "recover ignores a trailer for a task that is not todo" {
     add_commit "feat: one" "Orcastrat-Task: M01-T01"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "recover matches only a whole trailer line" {
     add_commit "feat: other" "$(printf 'Orcastrat-Task: M02-T021\nRefs Orcastrat-Task: M02-T02')"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "recover prints interrupted only for worker commits after the newest trailer commit" {
     add_commit "M01-T02: old attempt"
     add_commit "chore(plan): M01-T01 done" "Orcastrat-Task: M01-T01"
     add_commit "M02-T01: partial work"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "interrupted M02-T01" ]
   }

   @test "recover counts every commit when no commit has a trailer" {
     add_commit "M01-T02: work"
     add_commit "M02-T02: work"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 2 ]
     [ "${lines[0]}" = "interrupted M01-T02" ]
     [ "${lines[1]}" = "interrupted M02-T02" ]
   }

   @test "recover prints done, not interrupted, when a task has both" {
     add_commit "chore(plan): M02-T01 done" "Orcastrat-Task: M02-T01"
     add_commit "M02-T01: more work"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "done M02-T01" ]
   }

   @test "recover prints tasks in table order, then task order" {
     add_commit "feat: four" "Orcastrat-Task: M02-T02"
     add_commit "feat: three" "Orchestratinator-Task: M02-T01"
     add_commit "feat: two" "Orcastrat-Task: M01-T02"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "${#lines[@]}" -eq 3 ]
     [ "${lines[0]}" = "done M01-T02" ]
     [ "${lines[1]}" = "done M02-T01" ]
     [ "${lines[2]}" = "done M02-T02" ]
   }

   @test "recover skips task headings and statuses inside fenced code blocks" {
     add_commit "feat: not a task" "Orcastrat-Task: M09-T09"
     add_commit "feat: three" "Orcastrat-Task: M02-T01"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "done M02-T01" ]
   }

   @test "recover reads plan files with CRLF line endings" {
     to_crlf "$PLAN/plan.md"
     to_crlf "$PLAN/M01-first.md"
     to_crlf "$PLAN/M02-second.md"
     add_commit "feat: four" "Orcastrat-Task: M02-T02"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "done M02-T02" ]
   }

   @test "recover accepts <plan-dir> in both drive-letter forms" {
     command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
     add_commit "feat: two" "Orcastrat-Task: M01-T02"
     run_script "$(cygpath -m "$PLAN")"
     [ "$status" -eq 0 ]
     [ "$output" = "done M01-T02" ]
     run_script "$(cygpath -w "$PLAN")"
     [ "$status" -eq 0 ]
     [ "$output" = "done M01-T02" ]
   }

   @test "recover ignores trailers and worker commits on other branches" {
     git -C "$REPO" checkout --quiet -b other main
     add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
     add_commit "M02-T02: work elsewhere"
     git -C "$REPO" checkout --quiet demo-branch
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     [ "$output" = "OK" ]
   }

   @test "recover exits 2 with the wrong number of arguments" {
     run_script
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: recover <plan-dir>" ]
   }

   @test "recover exits 2 when <plan-dir> is not a directory" {
     run_script "$BATS_TEST_TMPDIR/missing"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not a directory: "* ]]
   }

   @test "recover exits 2 when <plan-dir> is outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     run_script "$BATS_TEST_TMPDIR/plain dir"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: "* ]]
   }
   ```

2. Run Verify and confirm it fails (`recover` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/recover` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # recover <plan-dir>
   #
   # Finds `todo` tasks whose work is already in the plan branch's history (D57).
   # Reads `- Branch:` from <plan-dir>/plan.md and the milestone files named in
   # its Milestones table, and runs git as `git -C "<plan-dir>"`. For each
   # `- Status: todo` task, in table order then task order, prints at most one line:
   #   done <task ID>         a commit reachable from the branch has the message
   #                          line `Orcastrat-Task: <task ID>` or
   #                          `Orchestratinator-Task: <task ID>`;
   #   interrupted <task ID>  otherwise, a commit newer than the branch's newest
   #                          commit carrying either trailer (every commit on the
   #                          branch, when none has one) has a subject starting
   #                          `<task ID>:`.
   # Prints OK when it prints no task line, including when the branch doesn't
   # exist. Task headings and statuses inside fenced code blocks are ignored, and
   # CRLF line endings are accepted.
   # Exits 0 after printing its result. On a usage error, prints one
   # `error: <message>` line on stderr, nothing on stdout, and exits 2 (D55).
   # Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   if [ "$#" -ne 1 ]; then
     fail 'usage: recover <plan-dir>'
   fi
   plan_dir=$1

   [ -d "$plan_dir" ] || fail "not a directory: $(print_path "$plan_dir")"
   [ "$(git -C "$plan_dir" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$plan_dir")"

   # Prints the milestone file named in each row of plan.md's Milestones table.
   # shellcheck disable=SC2016
   milestones_awk='
   { sub(/\r$/, "") }
   /^## / { in_table = ($0 == "## Milestones"); next }
   in_table && /^\|/ {
     n = split($0, cell, "|")
     file = cell[n]
     gsub(/^[ \t]+|[ \t]+$/, "", file)
     if (file == "") {
       file = cell[n - 1]
       gsub(/^[ \t]+|[ \t]+$/, "", file)
     }
     if (file ~ /\.md$/) print file
   }'

   # Prints the ID of each task whose first `- Status:` line says `todo`, skipping
   # fenced code blocks. A fence closes on a line of at least as many of the same
   # character as opened it, with nothing else on the line.
   # shellcheck disable=SC2016
   todo_awk='
   function fence_of(s,   c, n) {
     c = substr(s, 1, 1)
     if (c != "`" && c != "~") return ""
     n = 0
     while (substr(s, n + 1, 1) == c) n++
     if (n < 3) return ""
     return substr(s, 1, n)
   }
   {
     sub(/\r$/, "")
     t = $0
     sub(/^[ \t]*/, "", t)
     f = fence_of(t)
     if (fence_open != "") {
       rest = substr(t, length(f) + 1)
       sub(/[ \t]*$/, "", rest)
       if (f != "" && substr(f, 1, 1) == substr(fence_open, 1, 1) && length(f) >= length(fence_open) && rest == "") fence_open = ""
       next
     }
     if (f != "") { fence_open = f; next }
     if ($0 ~ /^#+ /) {
       id = ""
       if ($0 ~ /^### M[0-9]+-T[0-9]+:/) {
         id = substr($0, 5)
         sub(/:.*/, "", id)
         status_seen = 0
       }
       next
     }
     if (id != "" && !status_seen && $0 ~ /^- Status:/) {
       status_seen = 1
       st = $0
       sub(/^- Status:[ \t]*/, "", st)
       sub(/[ \t]*$/, "", st)
       if (st == "todo") print id
     }
   }'

   branch=$(sed -n 's/^- Branch:[[:space:]]*//p' "$plan_dir/plan.md" 2>/dev/null | head -n 1 | tr -d '\r' | sed 's/[[:space:]]*$//')
   ref="refs/heads/$branch"
   if [ -z "$branch" ] || ! git -C "$plan_dir" rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
     printf 'OK\n'
     exit 0
   fi

   trailer_re='^(Orcastrat|Orchestratinator)-Task: '
   messages=$(git -C "$plan_dir" log "$ref" -E --grep="$trailer_re" --format=%B 2>/dev/null)
   newest=$(git -C "$plan_dir" log -1 "$ref" -E --grep="$trailer_re" --format=%H 2>/dev/null)
   if [ -n "$newest" ]; then
     subjects=$(git -C "$plan_dir" log "$newest..$ref" --format=%s 2>/dev/null)
   else
     subjects=$(git -C "$plan_dir" log "$ref" --format=%s 2>/dev/null)
   fi

   printed=0
   while IFS= read -r file; do
     [ -n "$file" ] || continue
     while IFS= read -r id; do
       [ -n "$id" ] || continue
       if printf '%s\n' "$messages" | grep -qxF -e "Orcastrat-Task: $id" -e "Orchestratinator-Task: $id"; then
         printf 'done %s\n' "$id"
         printed=1
       elif printf '%s\n' "$subjects" | grep -q "^$id:"; then
         printf 'interrupted %s\n' "$id"
         printed=1
       fi
     done < <(awk "$todo_awk" "$plan_dir/$file" 2>/dev/null)
   done < <(awk "$milestones_awk" "$plan_dir/plan.md" 2>/dev/null)

   if [ "$printed" = 0 ]; then
     printf 'OK\n'
   fi
   exit 0
   ```

4. Run Verify and confirm all 17 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/recover.bats` reports 17 tests and no failure.
- `plugins/orcastrat/scripts/recover` contains no `pwsh` or `powershell`, in any case.

### M03-T07: Run Verify commands through the verify script

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M03-T04
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `! grep -qF 'orcastrat-verify.log' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify" "<plan dir>" "D"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'go to **Stop** with reason SETUP, quoting that line' plugins/orcastrat/skills/run/SKILL.md && test "$(grep -cE 'MAIN( again)? \(see Definitions\)' plugins/orcastrat/skills/run/SKILL.md)" -eq 5`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `refactor(orcastrat): run Verify commands through the verify script`

**Objective**

The run skill defines how it calls the bookkeeping scripts, defines "Verify a command" as a call to `verify` whose output is all it reads, and every Verify, Milestone verify and Final verify run uses that definition.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `verify` bullet and the paragraph after the list
- plan.md Decisions D54, D55, D63 and D65
- `plugins/orcastrat/skills/run/SKILL.md` lines 29–41 (Definitions)

**Interfaces**

- Consumes: `verify <plan-dir> <dir> <command>` (M03-T04)
- Consumes: `verify stdout: exit=<n>, then log=<log path> through print_path, then the log's last 40 lines when n isn't 0` (M03-T04)
- Consumes: `verify exit status: 0 after its result; 2 with one stderr line error: <message>` (M03-T04)
- Produces: `**Scripts**` definition in `plugins/orcastrat/skills/run/SKILL.md`
- Produces: `**Verify a command** in a directory D: bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify" "<plan dir>" "D" '<command>'`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace these five lines of the Definitions section:

   ````text
   - **Verify a command** in a directory D:
     ```
     cd "D" && <command> > "D/.orcastrat-verify.log" 2>&1; echo "exit=$?"
     ```
     In the main checkout, write the log to `$(git rev-parse --git-dir)/orcastrat-verify.log` instead, so it isn't an untracked file. Nonzero exit is a failure: read only the log's last 40 lines. In a worktree, delete the log before committing.
   ````

   with exactly these two lines:

   ```text
   - **Scripts**: the bookkeeping scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/`. Call each as one line, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" <arguments>`, with every path argument in double quotes, and read only what it prints. A script that exits 2 prints one line starting `error:` on stderr and nothing on stdout: go to **Stop** with reason SETUP, quoting that line.
   - **Verify a command** in a directory D: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify" "<plan dir>" "D" '<command>'`, passing the command as one single-quoted argument, with each `'` inside it written as `'\''`. Line 1 of its output is `exit=<n>`, line 2 is `log=<log path>`, and when n isn't 0 the log's last 40 lines follow. A nonzero n is a failure. Never read the log file itself. The script writes the log under the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>/logs/`, so it never shows up in a checkout's status and needs no cleanup.
   ```

2. In section 3d, item 5, replace `   - A command → run it; failure → **Retry**.` with `   - A command → Verify it in MAIN (see Definitions); failure → **Retry**.`
3. In section 3e, item 7, replace `run each integrated task's Verify command again in MAIN, deduplicated.` with `Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated.`
4. In section 3f, item 1, replace `1. Run the Milestone verify command in MAIN, if any.` with `1. Verify the Milestone verify command in MAIN (see Definitions), if any.`, and in item 5 of the same section replace `Run the Milestone verify command in MAIN again, if any,` with `Verify the Milestone verify command in MAIN again (see Definitions), if any,`.
5. In section 4, item 1, replace `1. Run Final verify in MAIN, if any.` with `1. Verify the Final verify command in MAIN (see Definitions), if any.`
6. In the **Retry** section's appended lines, replace `  <last 40 lines of the verify log, if a command failed>` with `  <the lines verify printed after its log= line, if a command failed>`.
7. Run Verify.

**Done when**

- The Definitions section has the `**Scripts**` and `**Verify a command**` entries from Step 1, and no `orcastrat-verify.log` or `$(` is left anywhere in the run skill.
- The five Verify, Milestone verify and Final verify sites say `(see Definitions)`, and nothing else in the file changed.

### M03-T08: Use scope-check and push-check in serial waves

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M03-T02, M03-T03, M03-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'scripts/push-check" "<MAIN>" <recorded HEAD>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/scope-check" "<MAIN>" <recorded HEAD>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'chore(plan): <task ID> attempt 1 failed' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'line you remembered in item 2, then commit the task in MAIN' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'branch -r --contains' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Every path in' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `refactor(orcastrat): use scope-check and push-check in serial waves`

**Objective**

In serial waves, `run` checks pushes with `push-check` and scope with `scope-check` against the HEAD it recorded before dispatch, writes its `- Process:` line only after the scope check, and commits its `- Escalated:` line before dispatching a retry (D50, D60, D64).

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the "Scope check" and "Push check" bullets
- plan.md Decisions D23, D50, D60 and D64
- `plugins/orcastrat/skills/run/SKILL.md` section 3d (items 1–6) and the **Retry** section

**Interfaces**

- Consumes: `scope-check <dir> <base> <files...>` (M03-T02)
- Consumes: `scope-check stdout: OK, or each out-of-scope path once, one per line, through print_path` (M03-T02)
- Consumes: `push-check <dir> <base>` (M03-T03)
- Consumes: `push-check stdout: OK, or one <full sha> <subject> line per commit on a remote, oldest first` (M03-T03)
- Consumes: `**Scripts**` definition in `plugins/orcastrat/skills/run/SKILL.md` (M03-T07)
- Produces: `chore(plan): <task ID> attempt 1 failed`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3d, replace item 2, the line that starts `2. **Check for stray commits and branch changes.**`, with exactly these four lines:

   ```text
   2. **Check for branch changes, pushes and stray commits**, in MAIN, against the HEAD you recorded in item 1:
      - Run `git branch --show-current`. If it doesn't print the plan's Branch, go to **Stop** with reason STRAY.
      - Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<MAIN>" <recorded HEAD>`. It prints `OK`, or one line per commit since the recorded HEAD that is on a remote, as `<sha> <subject>`. Anything but `OK` → go to **Stop** with reason PUSHED, listing those lines.
      - Run `git log --oneline <recorded HEAD>..HEAD`. If it prints any commit, run `git reset --soft <recorded HEAD>` and remember to add `- Process: worker committed on its own; reset and recommitted` under the task. Don't write that line yet: the scope check in item 4 would flag the milestone file. Add it when you set the task's Status in item 6, or together with the `- Escalated:` or `- Blocked:` line if the task retries or blocks instead.
   ```

2. In section 3d, replace item 4, which reads:

   ```text
   4. **Check scope.** Every path in `git status --porcelain` must be in the task's Files. Anything else → mark the task `blocked` with `- Blocked: SCOPE — <paths>` and go to **Stop**.
   ```

   with exactly this line:

   ```text
   4. **Check scope.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<MAIN>" <recorded HEAD> "<path>" ...`, passing each path in the task's Files as its own double-quoted argument. It prints `OK`, or each changed path that isn't in the task's Files, one per line; it checks both commits since the recorded HEAD and uncommitted changes. Anything but `OK` → mark the task `blocked` with `- Blocked: SCOPE — <the printed paths, comma-separated>` and go to **Stop**.
   ```

3. In section 3d, item 6, replace this text:

   ```text
   Set the task's Status to `done`, then commit the task in MAIN.
   ```

   with exactly:

   ```text
   Set the task's Status to `done`, add any `- Process:` line you remembered in item 2, then commit the task in MAIN.
   ```

4. In the **Retry** section, replace this text:

   ```text
   under the task, leaving its Tier field unchanged, and dispatch again to the next tier with these lines appended:
   ```

   with exactly:

   ```text
   under the task, leaving its Tier field unchanged, plus any `- Process:` line you remembered for this attempt. Commit those lines in MAIN before dispatching again, so the next scope check never sees them: `git add "<milestone file path>"`, then `git commit -m "chore(plan): <task ID> attempt 1 failed"`, with no `Orcastrat-Task:` trailer. Then dispatch again to the next tier with these lines appended:
   ```

5. Run Verify.

**Done when**

- Section 3d item 2 keeps the branch check and STRAY, calls `push-check`, and defers the `- Process:` line; item 4 calls `scope-check`; item 6 adds the deferred line.
- The **Retry** section commits the `- Escalated:` line as `chore(plan): <task ID> attempt 1 failed` before dispatching again.
- Nothing else in the file changed.

### M03-T09: Use the scripts in parallel waves and preflight recovery

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M03-T02, M03-T03, M03-T06, M03-T07, M03-T08
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'scripts/recover" "<plan dir>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/push-check" "<worktree>" <BASE>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/scope-check" "<worktree>" <BASE>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'remembered for it in item 3, and commit' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF -- '--grep="^(Orcastrat' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '" status --porcelain' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `refactor(orcastrat): use scope-check, push-check and recover in parallel waves and preflight`

**Objective**

In parallel waves, `run` checks each task's worktree with `push-check` and `scope-check` against the wave's BASE and writes `- Process:` lines only when it records the task; its preflight finds recovered tasks with `recover`.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `recover` bullet, and §2, the "Scope check" and "Push check" bullets
- plan.md Decisions D50, D57, D60 and D64
- `plugins/orcastrat/skills/run/SKILL.md` section 2a item 6, section 3d item 2, and section 3e items 3 and 8

**Interfaces**

- Consumes: `recover <plan-dir>` (M03-T06)
- Consumes: `recover stdout: OK, or one line per affected todo task in table order then task order, done <task ID> or interrupted <task ID>` (M03-T06)
- Consumes: `scope-check <dir> <base> <files...>` (M03-T02)
- Consumes: `push-check <dir> <base>` (M03-T03)
- Consumes: `**Scripts**` definition in `plugins/orcastrat/skills/run/SKILL.md` (M03-T07)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 2a, replace item 6, the line that starts `6. **Interrupted-run recovery.**`, with exactly this line:

   ```text
   6. **Interrupted-run recovery.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/recover" "<plan dir>"`. It prints `OK`, or one line per affected `todo` task. A `done <task ID>` line means the task's trailer, `Orcastrat-Task:` or the pre-rename `Orchestratinator-Task:`, is already in the Branch's history: the task was integrated before an interruption, but its status wasn't recorded. Note those tasks; you'll mark them `done` in 2c. Take no action on `interrupted <task ID>` lines.
   ```

2. In section 3e, item 3, replace the bullet that reads:

   ```text
      - First, in that worktree, apply the same stray-commit and branch check as in 3d, using BASE as the recorded HEAD and the task branch as the expected branch.
   ```

   with exactly this line:

   ```text
      - First, apply the checks of 3d item 2 to that worktree, with BASE as the recorded HEAD: `git -C "<worktree>" branch --show-current` must print the task branch (otherwise **Stop** with reason STRAY); run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<worktree>" <BASE>` (anything but `OK` → **Stop** with reason PUSHED); and if `git -C "<worktree>" log --oneline <BASE>..HEAD` prints any commit, run `git -C "<worktree>" reset --soft <BASE>` and remember the `- Process:` line. Add that line when you record the task in item 8, or together with its `- Escalated:` or `- Blocked:` line.
   ```

3. In section 3e, item 3, in the bullet that starts ``- Any other `DONE` →``, replace this text:

   ```text
   check scope with `git -C "<worktree>" status --porcelain` against the task's Files; anything else → record a SCOPE block and leave the worktree. Otherwise verify in the worktree (command, `review`, or both; the reviewer also gets the `Worktree:` line).
   ```

   with exactly:

   ```text
   check scope with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<worktree>" <BASE> "<path>" ...`, passing each path in the task's Files as its own double-quoted argument; anything but `OK` → record a SCOPE block with the printed paths and leave the worktree. Otherwise verify in the worktree as in 3d item 5, with the worktree as the directory (command, `review`, or both; the reviewer also gets the `Worktree:` line).
   ```

4. In section 3e, item 8, replace this text:

   ```text
   8. **Record.** Set each integrated task to `done`, and commit:
   ```

   with exactly:

   ```text
   8. **Record.** Set each integrated task to `done`, add any `- Process:` line you remembered for it in item 3, and commit:
   ```

5. Run Verify.

**Done when**

- Section 2a item 6 calls `recover` and acts only on its `done` lines.
- Section 3e item 3 calls `push-check` and `scope-check` with the worktree and BASE, and item 8 adds the deferred `- Process:` lines.
- Nothing else in the file changed.

### M03-T10: Mention the verify and recover scripts in the plan format

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M03-T04, M03-T06
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `grep -qF 'script, which writes the full output to a log inside' plugins/orcastrat/reference/plan-format.md && grep -qF 'finds these commits with its' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no tests; the Verify greps fail until the text is added)
- Commit: `docs(orcastrat): mention the verify and recover scripts in the plan format`

**Objective**

The plan format's Verify row says `run` runs every Verify, Milestone verify and Final verify command through `verify`, and its Commit row says `run` finds recovered tasks with `recover`.

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `verify` and `recover` bullets
- `plugins/orcastrat/reference/plan-format.md` lines 228–230 (the Verify, Fails first and Commit rows of the task field table)

**Interfaces**

- Consumes: `verify stdout: exit=<n>, then log=<log path> through print_path, then the log's last 40 lines when n isn't 0` (M03-T04)
- Consumes: `recover <plan-dir>` (M03-T06)
- Produces: none

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, the Verify row of the task field table (line 228), insert this text after `Milestone verify and Final verify follow the same rule.` and before the closing ` |`, with one space before it:

   ```text
   `run` runs each of these commands through its `verify` script, which writes the full output to a log inside `.git` and prints only `exit=<n>`, the log's path, and, on failure, the log's last 40 lines.
   ```

2. In the same file, the Commit row (line 230), insert the text below after the row's last sentence, ``Recovery also matches the pre-rename `Orchestratinator-Task:` trailer.``, and before the closing ` |`, with one space before it:

   ```text
   `run` finds these commits with its `recover` script when a run starts.
   ```

3. Run Verify.

**Done when**

- The Verify and Commit rows end with the new sentences, each row is still one table line, and nothing else in the file changed.
