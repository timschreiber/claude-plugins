# M03 survey: Git bookkeeping scripts

Repo root: `C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins`.

Current state (post-M02): `plugins/orcastrat/scripts/` contains only `lib/common`. No `scope-check`, `push-check`, `verify`, `integrate`, or `recover` exist yet. `tests/orcastrat/` has `lib-common.bats`, `no-powershell.bats`, `test-helper.bats`, `test_helper.bash` — no `scope-check.bats`, `push-check.bats`, `verify.bats`, `integrate.bats`, or `recover.bats` yet.

## Shared infrastructure every script/task will use

- `plugins/orcastrat/scripts/lib/common` (full file):
  ```sh
  # shellcheck shell=bash
  # Shared helpers for the orcastrat scripts. Source it; never run it directly.
  # Bash 3.2 compatible.

  print_path() {
    if command -v cygpath >/dev/null 2>&1; then
      cygpath -m "$1"
    else
      printf '%s\n' "$1"
    fi
  }
  ```
  Every new script must `source` this (D44) and pipe every printed path through `print_path`.
- `tests/orcastrat/test_helper.bash` (`load test_helper` in each `.bats` file) provides:
  - `REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"` — absolute repo root.
  - `make_fixture_repo <dir>`: `git init --quiet`, `symbolic-ref HEAD refs/heads/main`, sets `user.name 'Orcastrat Test'`, `user.email 'orcastrat-test@example.invalid'`, `commit.gpgsign false`, commits `README.md`. Branch is always `main`.
  - `make_cygpath_stub <dir>`: writes an executable `<dir>/cygpath` that prints `cygpath-stub [<arg1>] [<arg2>] ...`.
- Existing test pattern for sourcing a script under test (from `tests/orcastrat/lib-common.bats:9`): `run env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "<path>"`. For the five new scripts (which are standalone executables, not meant to be sourced), the likely pattern is `run bash "$REPO_ROOT/plugins/orcastrat/scripts/<name>" <args>` — no existing script-invocation test exists yet to copy verbatim; this is new ground for M03.
- Runner: `bash scripts/run-bats.sh [args]` (repo root) — clones bats-core v1.14.0 into `.tools/bats-core` if missing, then runs `.tools/bats-core/bin/bats -r tests/orcastrat` (no args) or passes args through, e.g. `bash scripts/run-bats.sh tests/orcastrat/verify.bats`.
- Bash-3.2 constraint (M02 Context, `plans/orcastrat-execution/M02-portable-runtime.md:14`): "bash 3.2 compatible code plus `git` and `grep`, `sed`, `awk`, `tail`, `head`, `date`, `mkdir`, `rm`, `cat`. No associative arrays, no `mapfile`, no `${var,,}`. No `pwsh`, `powershell`, `jq`, Node or Python at runtime."

## Outline bullet: one task per script, test-first

### `scope-check <dir> <base> <files...>`

- Spec (§7, `docs/orcastrat-execution-spec.md:141`): "prints `OK`, or the out-of-scope paths." D05 adds the `<dir>` parameter to the spec's `<base> <files...>` signature.
- M03 Context line 15: "Checks `git diff --name-only <base>..HEAD` plus `git status --porcelain` in `<dir>`." Both command outputs need to be unioned and compared against `<files...>`; anything not in `<files...>` is "out of scope" and printed one per line; `OK` when the set is empty.
- Caller: `run/SKILL.md:176` (serial wave, item 4): "**Check scope.** Every path in `git status --porcelain` must be in the task's Files. Anything else → mark the task `blocked` with `- Blocked: SCOPE — <paths>` and go to **Stop**." — currently only checks `git status --porcelain`, not a diff range; the new script folds in `git diff --name-only <base>..HEAD` too (Outline says "passing the task's Files" — no explicit `<base>` value at that call site in current text, since serial-mode `run` doesn't currently track a per-task BASE the way parallel mode does; M03 planning must decide what `<base>` is passed in serial mode).
- Also called (per Outline bullet 3) from `run/SKILL.md:199` (parallel wave, item 3): "check scope with `git -C "<worktree>" status --porcelain` against the task's Files" — here `<dir>` is the worktree and `<base>` is `BASE` (defined at `run/SKILL.md:185`, `git rev-parse HEAD` on the plan branch, captured once per batch at the top of 3e).
- Windows-style escaped paths: Outline says tests "cover Windows-style escaped paths where a script takes paths" — `git status --porcelain` and `git diff --name-only` can quote paths containing special characters in C-style octal-escaped strings (with surrounding double quotes) unless `core.quotePath=false`; no existing helper for unescaping this exists in the repo yet — **Unconfirmed** whether M03 needs a workaround or whether the fixture/fixed test set simply avoids such filenames.

### `push-check <dir> <base>`

- Spec (§7, `docs/orcastrat-execution-spec.md:142`): "prints `OK`, or the commits found on a remote." D05 adds `<dir>`.
- M03 Context line 16: "prints the commits in `<base>..HEAD` that `git branch -r --contains` finds on a remote."
- Existing occurrence of the underlying check in `run/SKILL.md:166` (serial, item 2): "for each [commit], `git branch -r --contains <sha>` must print nothing; if any prints something, go to **Stop** with reason PUSHED." Also `run/SKILL.md:194` (parallel item 3, "the same stray-commit and branch check as in 3d").
- D46 confirms this `git branch -r --contains <sha>` occurrence (not a separate, unfound "push-check style" command) is the one M03's `push-check` replaces; M02-survey's Unconfirmed item on this point is resolved.
- Note: current `run/SKILL.md:166` combines the push check with a **stray-commit / branch-switch guard** (`git log --oneline <recorded HEAD>..HEAD` and `git branch --show-current`, STRAY reason) and a soft-reset (`git reset --soft <recorded HEAD>`) for the "no push found" case. D23: Change 1 removes only the soft-reset part later (M05); D18/M03 Context says `push-check` itself only needs to replace the "is any commit on a remote" check, i.e. `git branch -r --contains` — the branch-switch/STRAY check and soft-reset stay in `run`'s own logic for now (Outline bullet 3 says only "replace the push check inside the stray-commit guard", implying the guard's other parts remain inline in `run`).

### `verify <plan-dir> <dir> <command>`

- Spec (§7, `docs/orcastrat-execution-spec.md:143`): "runs the command with `bash -c` in `<dir>`, writing the full log under `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/logs/`, so logs never dirty the tree or trip the scope check; prints `exit=<n>` and, on failure, the last 40 lines. `run` reads only this output, never the log itself."
- M03 Context line 17: plan-slug = last path component of `<plan-dir>`.
- Current definition it replaces, `run/SKILL.md:34-38` ("Verify a command" in a directory D):
  ```
  cd "D" && <command> > "D/.orcastrat-verify.log" 2>&1; echo "exit=$?"
  ```
  "In the main checkout, write the log to `$(git rev-parse --git-dir)/orcastrat-verify.log` instead, so it isn't an untracked file. Nonzero exit is a failure: read only the log's last 40 lines. In a worktree, delete the log before committing."
- Outline bullet 2: "`run`: replace the 'Verify a command' definition and both verify-log paths with a call to `verify`, reading only its output." Both current log paths (`D/.orcastrat-verify.log` in a worktree, `$(git rev-parse --git-dir)/orcastrat-verify.log` in MAIN) are superseded by the single `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/logs/` location — this also removes the current worktree-only "delete the log before committing" step, since the new location is always inside `.git`, never in the tree.
- Every caller site of "Verify a command" in `run/SKILL.md` to be updated: `3d` item 5 (`run/SKILL.md:177-178`, serial "Verify yourself"), `3e` item 3 (`run/SKILL.md:199`, parallel per-task verify), `3e` item 7 (`run/SKILL.md:206`, re-verify after wave integration), `3f` item 1 (`run/SKILL.md:213`, Milestone verify), `4` item 1 (`run/SKILL.md:249`, Final verify).
- D43/D44: `verify` must print its log path through `print_path` (per the milestone Context example: "for example, the verify log path" — Unconfirmed whether the log path is printed on success too, or only ever internally referenced; spec text only says it prints `exit=<n>` and, on failure, the last 40 lines — **Unconfirmed**: does `verify` ever print the log path itself, or does `run` only need `exit=<n>`/tail? The Context's "for example, the verify log path" suggests the log path is one of the printed paths, but the spec's stated output format (`exit=<n>` plus optional tail) has no path line — plan-writing should confirm the exact output format including whether/where the path line appears).

### `integrate <task-branch> <base>`

- Spec (§7, `docs/orcastrat-execution-spec.md:144`): "runs the cherry-pick range; prints `OK`, or `CONFLICT` plus the conflicted files."
- Current logic it replaces, `run/SKILL.md:205` (3e item 6): "confirm `git log --oneline <BASE>..<task branch>` shows exactly one commit and that it carries the task's Orcastrat-Task trailer. If not, mark the task `blocked` with `- Blocked: MERGE — branch has <n> commits` and don't integrate it. Then integrate the committed tasks into the plan branch, in task ID order: `git cherry-pick <task branch>` in MAIN. If a cherry-pick conflicts, run `git cherry-pick --abort`, mark that task `blocked` with `- Blocked: MERGE — <files>` ... and skip integrating any later task of this wave."
- M03 Context confirms (line 18) `integrate` does the cherry-pick step; M03 Context line 23 and D46 both state: "`integrate` is built and tested here, but `run` starts using it in M07 with the parallel rebuild" — so **this task's Outline item is build-and-test only; `run/SKILL.md` is not edited to call `integrate` in M03** (the Outline's `run`-editing bullets, lines 29–31, list only verify, scope-check, and push-check/recover — `integrate` is absent from that list, consistent with the M07 deferral).
- Signature note: spec's range description is `<BASE>..<task branch>`; D05's parameter order is `integrate <task-branch> <base>` (task branch first).
- Conflict output must print "the conflicted files" — likely from `git diff --name-only --diff-filter=U` or `git status --porcelain` inside the cherry-pick-in-progress state, then `git cherry-pick --abort`.

### `recover <plan-dir>`

- Spec (§7, `docs/orcastrat-execution-spec.md:145`): "lists `todo` tasks whose trailer (`Orcastrat-Task:`, or the pre-rename `Orchestratinator-Task:`) is already in history, and tasks with worker commits (subject prefix `<task ID>:`) after the last trailer commit but no trailer of their own. Those are interrupted attempts: `run` treats them as failed attempts at their recorded tier and handles them per Change 1."
- M03 Context line 19 restates this as two lists, (a) and (b).
- List (a) replaces the current preflight check `run/SKILL.md:61` (2a item 6): `git log <branch> --format=%H -E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"`, run once per `todo` task to see if its trailer is already in the Branch's history.
- List (b) has no current equivalent in `run/SKILL.md` — it depends on the worker-commit-subject convention `<task ID>: <message>` (Change 1, spec §2, `docs/orcastrat-execution-spec.md`: "Every commit subject starts with the task ID: `M03-T02: <message>`."), which is not implemented until M05. Per M03 Context line 23: "`recover`'s interrupted-attempt list (b) is acted on by `run` from M05, once workers commit. Until then, `run` uses only list (a)." So `recover`'s own tests must still exercise list (b) fully (it's part of this task's Done when), even though no caller in `run` uses it yet.
- Trailer commit subject convention for the success case (once implemented, M05): `chore(plan): <task ID> done` with trailer `Orcastrat-Task: <task ID>` (spec §2). Failed-attempt commit subject: `chore(plan): <task ID> attempt <n> failed`, explicitly **no** trailer.
- Task ID format used throughout this plan: `<milestone ID>-T<NN>`, e.g. `M02-T01`, `M03-T02` (from milestone file task headers, e.g. `plans/orcastrat-execution/M02-portable-runtime.md:61` `### M02-T01: Record the pinned bats-core release tag`).
- Outline bullet 3: "`run`: replace ... preflight's interrupted-run recovery grep with `recover`" — this is `run/SKILL.md:61` (2a item 6), the only `run` call site to change for this script in M03.
- `<plan-dir>` here (unlike the other four scripts) has no separate `<dir>`/`<branch>` argument — `recover` must derive the plan's Branch from `plan.md` inside `<plan-dir>` itself, and derive `todo` tasks from the milestone files, to know which task IDs to check. No existing script reads `plan.md`/milestone files programmatically yet — this parsing logic is new to M03 (`task-brief`, similarly plan/milestone-parsing, is M06, not yet built to copy from).

## Outline bullet: `run` — verify call

Already detailed above under "`verify`". Concretely, the `run/SKILL.md:34-38` block and its "In the main checkout, write the log to ... instead" sentence are deleted; every one of the five caller sites listed above is rewritten to invoke `${CLAUDE_PLUGIN_ROOT}/scripts/verify` and parse only `exit=<n>` (and, on failure, the printed tail) from its output.

## Outline bullet: `run` — scope-check calls

`run/SKILL.md:176` (serial 3d item 4) and `run/SKILL.md:199` (parallel 3e item 3) are the two call sites, detailed above under "`scope-check`". Both currently reference "the task's Files" as the allowed-path set — this Field is defined in `reference/plan-format.md` (Files field, not shown in the grep excerpts above but referenced throughout `run/SKILL.md` as "the task's Files").

## Outline bullet: `run` — push-check and recover calls

- Push-check call site: `run/SKILL.md:166` (serial 3d item 2, "for each [commit], `git branch -r --contains <sha>` must print nothing"); `run/SKILL.md:194` references the same check reused in parallel mode ("the same stray-commit and branch check as in 3d").
- Recover call site: `run/SKILL.md:61` (preflight 2a item 6), detailed above.

## Outline bullet: `reference/plan-format.md` — mention the scripts

- Verify description, `reference/plan-format.md:228` (Verify field row): currently states the bash-c rule and the review-vs-command distinction, with **no mention of the `verify` script**. This is the row Outline says to update.
- Milestone verify / Final verify: `reference/plan-format.md:71` (header field table, Final verify row: "Command run after the last milestone, or `none`.") and `reference/plan-format.md:116` (milestone template line `- Milestone verify: <command> | none`) — same gap, no script mention.
- Recovery description, `reference/plan-format.md:230` (Commit field row): "`run` adds the trailer `Orcastrat-Task: <task ID>` to the commit, so progress can be recovered from git history. Recovery also matches the pre-rename `Orchestratinator-Task:` trailer." — no mention of the `recover` script by name; this is the row Outline says to update for "recovery."
- No other "verify" or "recover" mentions exist in `plugins/orcastrat/reference/plan-format.md` (full grep for `-i "verify|recover|trailer|Orcastrat-Task|Orchestratinator-Task"` returned only the lines cited above plus Fails-first/Blocked-reason lines that don't need script mentions).

## Conflicts

None found.

## Unconfirmed

1. `verify`'s exact printed-output format: whether the log path is ever printed (and if so, through `print_path`, on every run or only on failure), or whether `verify`'s stdout is strictly `exit=<n>` plus an optional 40-line tail with no path line at all. Spec §7 states only `exit=<n>` and the tail; the milestone Context's "prints each path through `print_path` ... for example, the verify log path" implies a path line exists somewhere in `verify`'s output. Needs settling in planning.
2. Whether Windows-style escaped/quoted paths from `git status --porcelain`/`git diff --name-only` (C-style octal quoting for special characters) need explicit unescaping logic in `scope-check`, or whether the Outline's "Windows-style escaped paths" test coverage refers only to backslash-vs-forward-slash path separators (which `print_path`/`cygpath -m` already normalizes) rather than git's own quoting of filenames.
3. What value serial-mode `run` (`run/SKILL.md:157-181`, section 3d) passes as `scope-check`'s `<base>` argument: 3d currently records `HEAD` before dispatch (line 165, "Record `git rev-parse HEAD` before dispatching") for the stray-commit check only, not explicitly as a scope-check "BASE" the way parallel mode's `BASE` (line 185) is defined; M03 planning needs to decide whether serial mode's recorded pre-dispatch HEAD is reused as `scope-check`'s `<base>`, or whether `scope-check` in serial mode is called with `<base>` = that same recorded HEAD by construction.
