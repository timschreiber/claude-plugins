# M08: Stop hook (Change 8)

- Status: in-progress
- Format: 2
- Goal: The plugin ships a `Stop` hook, `hooks/hooks.json` plus the bash script `hooks/stop-guard`, with bats tests. While this checkout has an active-run marker, the hook blocks Claude from ending its turn, with the spec's reason text. It exits immediately when there is no marker, releases after 3 blocks without a heartbeat change, and fails open on any error. `run` keeps the marker's heartbeat fresh, removes stale markers in preflight, and refuses a second active run in the same checkout.
- Depends on: M07
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §9 (Change 8), §20 item 5 (hooks), §25a item 4 (the reason names `next`), §1.6; Decisions D03, D04, D06, D43, D44, D62, D138–D146.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)
- The hook script is `plugins/orcastrat/hooks/stop-guard` (D04), registered in `plugins/orcastrat/hooks/hooks.json` (D138). Its tests are `tests/orcastrat/stop-guard.bats` (D03), in the style of `tests/orcastrat/run-state.bats`.
- The marker is `<git-dir>/orcastrat/active-run`, with the `key=value` lines `plan=`, `started=`, `heartbeat=`, `blocks=` and `block_heartbeat=` (D06), and from M08-T01 on a sixth line `session=<session-id>` (D144).
- `stop-guard`, in this order:
  1. Fast path (D06, D144, D145, D146): find the marker from `$CLAUDE_PROJECT_DIR` with bash builtins and file tests only, plus `sed` to read a `.git` file. With no marker, exit 0 before reading stdin, sourcing `lib/common` or running any other command.
  2. Read stdin with `cat`. Take only `session_id`, with `sed`, never `jq` and never another field. Block only when it equals the marker's `session=` (D144).
  3. Loop guard: D139. Release: the marker is replaced by `active-run.released` holding one line (D06).
  4. Block with D138's one line; allow by exiting 0 with nothing on stdout. Fail open: D140. The script never exits nonzero and never runs git.
  5. The plan path in the reason goes through `print_path` (D43, D44).
- `run`: the preflight active-run check (D141), the marker started with the session ID (D144), the heartbeat (D143), and a Pause or Stop that ends only this run's marker (D142). The toolchain, instruction-file and model checks (M09) come before the marker is written; M09 places them.
- README notes on one run per checkout are written in M15 (spec §28).
- Shipped bash is 3.2-compatible (spec §20): no associative arrays, `mapfile`, `${var,,}` or other bash-4 features, and only bash, `git` and standard utilities.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting a line.** "Directly below the line L, insert X" means: put X on its own line right after L, with no empty line between them.
- Skill text contains no `$(`: every command it tells Claude to run is one line (spec §20 item 3).
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's `run` skill, hooks and scripts changes nothing in that run. No task in this milestone runs `run`, installs the plugin or starts Claude Code, and no test runs Claude Code (spec §20 item 7).

Waves: 5 (widths 2, 2, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §9 Marker: the marker holds the ID of the session that owns the run, `session=<id>`, written by `run-state start <plan-dir> <session-id>` from `run`'s command with `${CLAUDE_SESSION_ID}` (D144) → M08-T01, M08-T04
- `docs/orcastrat-execution-spec.md` §9 Marker: `run` deletes the marker at every Pause, Stop and completion, and never a marker it didn't write (D142) → M08-T04
- `docs/orcastrat-execution-spec.md` §9 Heartbeat: `run` updates the heartbeat on every dispatch, every returned agent and every commit (D143) → M08-T04
- `docs/orcastrat-execution-spec.md` §9 Hook: the plugin ships a `Stop` hook, `hooks/hooks.json` plus a bash script invoked as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>"` with the path quoted (D138) → M08-T03, M08-T07
- `docs/orcastrat-execution-spec.md` §9 Hook: the script locates the marker from `$CLAUDE_PROJECT_DIR`, per checkout, including a linked worktree's `.git` file (D06, D144, D145) → M08-T03, M08-T06
- `docs/orcastrat-execution-spec.md` §9 Hook items 1–3: no marker does nothing; only stdin's `session_id` is read, and only the owning session is blocked; the block reason text → M08-T03
- `docs/orcastrat-execution-spec.md` §9 Compaction: the block reason's `next` instruction is the recovery path → M08-T03
- `docs/orcastrat-execution-spec.md` §9 Loop guard: count consecutive blocks in the marker, reset on a heartbeat advance, allow the stop after 3, delete the marker and leave a note saying why (D139) → M08-T05
- `docs/orcastrat-execution-spec.md` §9 Fast exit when idle: marker check with `$CLAUDE_PROJECT_DIR` and a file test first, before reading stdin or running git → M08-T03, M08-T06
- `docs/orcastrat-execution-spec.md` §9 Fails open: any error, unreadable marker or unparseable input allows the stop and leaves the block count unchanged (D140) → M08-T03, M08-T05, M08-T06
- `docs/orcastrat-execution-spec.md` §9 Preflight: a marker whose heartbeat is more than an hour old is removed, with a one-line mention (D141) → M08-T02
- `docs/orcastrat-execution-spec.md` §9 Limit: one active run per checkout; preflight stops on a fresher marker and says so; other worktrees are independent → M08-T02
- `docs/orcastrat-execution-spec.md` §9 Acceptance: script tests for the fast exit, the owning session blocked, a different session, empty or non-JSON stdin and a marker without `session=` allowed, the loop guard and fail-open behavior → M08-T03, M08-T05, M08-T06
- `docs/orcastrat-execution-spec.md` §7: the Stop hook script, with bats tests → M08-T03
- `docs/orcastrat-execution-spec.md` §20 item 5: hooks invoked as `bash "${CLAUDE_PLUGIN_ROOT}/…"` with the path quoted; Windows paths normalized (D144, D146); fail open → M08-T03, M08-T06, M08-T07
- `docs/orcastrat-execution-spec.md` §25a item 4: the Stop hook's reason points at `next` → M08-T03
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only (the `ralph-loop` Stop hook, documented plugin hooks) → M08-T03, M08-T07
- `docs/orcastrat-execution-spec.md` §1.6: the hook is bash 3.2 with standard utilities only, JSON read with `sed` → M08-T03, M08-T05, M08-T06
- `docs/orcastrat-execution-spec.md` preamble: an unattended run keeps going instead of ending its turn mid-run → M08-T03, M08-T04, M08-T05
- `docs/orcastrat-execution-spec.md` §29 items 7 and 10a: Change 8 and the Stop hook's reason are built in this step → M08-T03, M08-T07
- `docs/orcastrat-execution-spec.md` §31: the hook script has a kebab-case name, the hooks JSON is valid, and `claude plugin validate` passes → M08-T07
- `docs/orcastrat-execution-spec.md` §32 items 12 and 54: a Stop hook scoped by a per-checkout marker with a heartbeat, one active run per checkout, releasing after 3 blocks, failing open → M08-T01, M08-T02, M08-T03, M08-T04, M08-T05

## Review Focus

- Stop hook input with `"stop_hook_active":true` from the owning session → blocked like any other stop by that session; the loop guard, not that field, ends a loop (source: spec §9 Hook item 2, "using no other field"; D144). Test: `stop_hook_active true doesn't change the decision` in M08-T03.
- A marker whose lines are in another order, with `session=` first → read by key, and the owning session is blocked with the right plan (source: D06, `key=value` lines). Test: `marker lines are read by key, in any order` in M08-T03.
- The owning session's next stop after the loop guard released it → allowed with nothing on stdout, and no marker is written again (source: spec §9 Loop guard, "allows the stop, deletes the marker ... A run that's truly stuck ends instead of spinning"). Test: `the stop after a release is allowed and recreates no marker` in M08-T05.

## Tasks

### M08-T01: run-state start records the session that owns the run

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M05-T01
- Files: `plugins/orcastrat/scripts/run-state`, `tests/orcastrat/run-state.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-state.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-state start records the session that owns the run`

**Objective**

`run-state start <plan-dir> <session-id>` takes a second argument and writes it as the marker's sixth line, `session=<session-id>` (D144).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Marker** bullet
- plan.md Decisions D89 and D144
- `plugins/orcastrat/scripts/run-state` (whole file, 109 lines)
- `tests/orcastrat/run-state.bats` (whole file)

**Interfaces**

- Consumes: `run-state start <plan-dir>` (M05-T01)
- Consumes: `<git-dir>/orcastrat/active-run with the lines plan=<plan-dir>, started=<epoch>, heartbeat=<epoch>, blocks=0, block_heartbeat=` (M05-T01)
- Produces: `<session-id>, the second argument of run-state start, stored as the sixth marker line session=<session-id>`
- Produces: `error: usage: run-state start <plan-dir> <session-id>`

**Steps**

1. In `tests/orcastrat/run-state.bats`, replace all 10 occurrences of `run_script start "plans/my plan"` with `run_script start "plans/my plan" S-1`. Then add the argument ` S-1` at the end of each of these four lines: `run_script start "$win_m"`, `run_script start "$win_w"`, `run_script start "plans/missing"` and `run_script start "$BATS_TEST_TMPDIR/plain dir"`. In `write_marker`, add a sixth line `session=S-1` after `block_heartbeat=%s` in its `printf` format, and say so in its comment.
2. Still in `run-state.bats`, change these tests:
   - Rename `start writes the marker with plan, started, heartbeat, blocks and block_heartbeat` to `start writes the marker with plan, started, heartbeat, blocks, block_heartbeat and session`; change its `line_count` check from `5` to `6`, and add a check that line 6 of `$MARKER` is `session=S-1`.
   - In `start overwrites an existing marker` and `beat updates only the heartbeat`, change the `line_count` check from `5` to `6`. In `beat updates only the heartbeat`, add a check that line 6 of `$MARKER` is `session=S-1`.
   - In `run-state exits 2 with no arguments`, expect stderr `error: usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>`.
   - In `run-state exits 2 when a subcommand has the wrong number of arguments`, expect stderr `error: usage: run-state start <plan-dir> <session-id>` for `run_script start`. Directly after that check, add `run_script start "plans/my plan"` (one argument), expecting status 2, empty `$output`, the same stderr, and no file at `$MARKER`.
3. Add a test `start writes the session ID it is given`: `run_script start "plans/my plan" 0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a`; expect status 0, empty `$output` and `$stderr`, line 6 of `$MARKER` equal to `session=0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a`, and `line_count "$LOG"` equal to `1`.
4. Run Verify and confirm it fails.
5. In `plugins/orcastrat/scripts/run-state`, change the header comment: line 2 becomes `# run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>`; the marker description lists `session=` after `block_heartbeat=`, as the ID of the session that owns the run (D144); the `start` entry reads `start <plan-dir> <session-id>` and says it writes `session=<session-id>` as given. Change the `usage` variable to `usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>`, and the `start)` argument check to `[ "$#" -eq 2 ] || fail 'usage: run-state start <plan-dir> <session-id>'`.
6. In the `start)` branch of the second `case`, set `session_id=$2` next to `plan_dir=$1`, and write the marker with the format `'plan=%s\nstarted=%s\nheartbeat=%s\nblocks=0\nblock_heartbeat=\nsession=%s\n'` and the arguments `"$plan_dir" "$now" "$now" "$session_id"`. Change nothing else.
7. Run Verify and confirm all 20 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-state.bats` reports 20 tests and no failure.
- `run-state start` requires exactly two arguments and writes `session=<session-id>` as the marker's sixth line; `beat`, `elapsed` and `end` behave as before.

### M08-T02: run's preflight removes a stale marker and refuses a second active run

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M06-T03
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF '1. **Active run.** Read the `marker:` line of **next**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'rm -f "<the directory it printed>/orcastrat/active-run"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Removed a stale run marker left by a crashed session.' plugins/orcastrat/skills/run/SKILL.md && grep -qF '2. **Working tree is clean.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '8. **Pre-rename leftovers.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '(2a item 2)' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'If 2a item 2 accepted' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'from 2a item 7:' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '2a item 1' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '2a item 6' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'the one write in these checks' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run's preflight removes stale run markers and refuses a second active run`

**Objective**

`run`'s section 2a starts with an **Active run** check that removes a stale marker with a one-line mention (D141) and stops when another run is active in this checkout (spec §9 Limit), and the other checks and every reference to them are renumbered.

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Preflight** and **Limit** bullets
- plan.md Decisions D113 and D141
- `plugins/orcastrat/skills/run/SKILL.md` section `### 2a. Checks`, the `### 2b. Ask for approval` bullet list, and section `### 2c. Prepare` items 2 and 3

**Interfaces**

- Consumes: `next stdout lines 7-9: recover: <recover lines joined by "; ">, worktrees: <count>, marker: none, marker: active <n>m or marker: stale` (M06-T03)
- Produces: `1. **Active run.**` item in section 2a of `plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `### 2a. Checks`, replace `These only read. Stop and report to the user if any fails.` with `These only read, except where an item says it writes. Stop and report to the user if any fails.`
2. Renumber the seven items of 2a, changing only each item's leading number: `1. **Working tree is clean.**` becomes `2.`, `2. **Plan status.**` becomes `3.`, `3. **Open blocks.**` becomes `4.`, `4. **Leftover worktrees.**` becomes `5.`, `5. **Branch.**` becomes `6.`, `6. **Interrupted-run recovery.**` becomes `7.`, and `7. **Pre-rename leftovers.**` becomes `8.`.
3. Directly above the line that starts `2. **Working tree is clean.**`, insert these lines:

   ```text
   1. **Active run.** Read the `marker:` line of **next**, this checkout's active-run marker. A run writes it in 2c item 6 and removes it at its **Pause**, **Stop** or completion.
      - `marker: none`: go on.
      - `marker: stale`: its heartbeat is more than an hour old, or unreadable, so a crashed session left it. Remove it, which is a write: run `git rev-parse --git-dir`, then `rm -f "<the directory it printed>/orcastrat/active-run"`. Don't use the `run-state` script for this: it would add an `end` line to the crashed run's run log. Tell the user in one line: `Removed a stale run marker left by a crashed session.` Then go on.
      - `marker: active <n>m`: another run is active in this checkout, and its last heartbeat was <n> minutes ago. Only one run may be active per checkout. Stop here, before anything changes, and tell the user in one line that another Orcastrat run is active in this checkout, naming its marker, `<the directory git rev-parse --git-dir prints>/orcastrat/active-run`, and saying that a later run removes it once its heartbeat is more than an hour old. Runs in other worktrees of this repository have their own markers and never stop this one.
   ```

4. In item 8 (`**Pre-rename leftovers.**`), replace `(the one write in these checks)` with `(the other write in these checks, besides item 1's)`.
5. Update the three references to the renumbered items: in section 2b, replace `A detailed but uncommitted milestone (2a item 1)` with `A detailed but uncommitted milestone (2a item 2)`; in section 2c item 2, replace `If 2a item 1 accepted` with `If 2a item 2 accepted`; in section 2c item 3, replace `from 2a item 6:` with `from 2a item 7:`.
6. Run Verify.

**Done when**

- Section 2a has eight items, the new **Active run** check first, and the old items 1–7 as items 2–8 with unchanged text apart from item 8's parenthesis.
- Sections 2b and 2c name the renumbered items, and no text says `2a item 1` or `2a item 6`.
- Nothing else in the file changed.

### M08-T03: Add the stop-guard hook script

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M02-T05, M02-T06, M05-T01, M08-T01
- Files: `plugins/orcastrat/hooks/stop-guard`, `tests/orcastrat/stop-guard.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the stop-guard hook script`

**Objective**

`plugins/orcastrat/hooks/stop-guard` exits 0 at once when this checkout has no active-run marker, and otherwise blocks the stop of the session that owns the run with the spec's reason, allowing every other case (D138, D140, D144).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Hook**, **Compaction**, **Fast exit when idle** and **Fails open** bullets
- plan.md Decisions D06, D138, D140, D144 and D146
- `plugins/orcastrat/scripts/run-state` lines 1–30 (header comment, sourcing `lib/common`)
- `tests/orcastrat/run-state.bats` lines 1–33 (setup and helpers to copy)
- `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (M02-T05)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `make_fixture_repo <dir>` (M02-T05)
- Consumes: `make_cygpath_stub <dir>` (M02-T05)
- Consumes: `plugins/orcastrat/scripts/lib/common` (M02-T06)
- Consumes: `print_path <path>` (M02-T06)
- Consumes: `<git-dir>/orcastrat/active-run with the lines plan=<plan-dir>, started=<epoch>, heartbeat=<epoch>, blocks=0, block_heartbeat=` (M05-T01)
- Consumes: `<session-id>, the second argument of run-state start, stored as the sixth marker line session=<session-id>` (M08-T01)
- Produces: `plugins/orcastrat/hooks/stop-guard`
- Produces: `stop-guard stdout: {"decision":"block","reason":"<reason>"} on one line to block, nothing to allow; exit status always 0`
- Produces: `stop-guard shell variables dir, git_dir, marker, plan, heartbeat, blocks, block_heartbeat, session, has_session`
- Produces: `stop-guard.bats variables SCRIPT, REPO, PROJECT, MARKER, OWNER, OTHER`
- Produces: `stop-guard.bats helpers write_marker <plan> <heartbeat> <blocks> <block_heartbeat> [<session>], hook_input <session id>, block_json <plan as printed>, run_hook <stdin text>, make_call_stubs <dir> <log>`

**Steps**

1. Create `tests/orcastrat/stop-guard.bats`, starting with `bats_require_minimum_version 1.5.0`, with a `setup()` that runs `load test_helper` and sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/hooks/stop-guard"`, `REPO="$BATS_TEST_TMPDIR/fixture repo"` (then `make_fixture_repo "$REPO"`), `PROJECT="$REPO"`, `MARKER="$REPO/.git/orcastrat/active-run"`, `OWNER=0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a` and `OTHER=9d3e1a2b-5c4f-4e6d-8a7b-1c2d3e4f5a6b`. Add these helpers, each with a one-line comment:
   - `write_marker <plan> <heartbeat> <blocks> <block_heartbeat> [<session>]`: creates the directory of `$MARKER` and writes to `$MARKER`, verbatim with `printf '%s'`-style arguments, the lines `plan=<plan>`, `started=1000`, `heartbeat=<heartbeat>`, `blocks=<blocks>`, `block_heartbeat=<block_heartbeat>`, and `session=<session>` only when a fifth argument is given.
   - `hook_input <session id>`: prints exactly this line, with `<id>` replaced by its argument (each `\\` is two backslash characters in the output):

     ```text
     {"session_id":"<id>","transcript_path":"C:\\Users\\me\\.claude\\projects\\demo\\t.jsonl","cwd":"C:\\Users\\me\\fixture repo","hook_event_name":"Stop","stop_hook_active":false}
     ```

   - `block_json <plan as printed>`: prints exactly this line, with both `<p>` replaced by its argument:

     ```text
     {"decision":"block","reason":"An Orcastrat run is in progress for <p>. Run the next script for <p> and continue the run from the step it names. If you meant to pause or stop, follow run's Pause or Stop section, which removes the marker."}
     ```

   - `run_hook <stdin text>`: `run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" bash "$SCRIPT" <<< "$1"`.
   - `make_call_stubs <dir> <log>`: creates `<dir>` and writes two executables, `<dir>/cat` and `<dir>/git`, each of which appends its own name (`cat` or `git`) as one line to `<log>` and exits 0, reading nothing and printing nothing.
2. Add these tests. "Allowed" means status 0, empty `$output` and empty `$stderr`; "blocked" means status 0, `$output` equal to `$(block_json "plans/my plan")`, and empty `$stderr`; "unchanged" means `$(cat "$MARKER")` equals its value saved just before the run.
   - `no marker: exits 0 at once without reading stdin or running git`: `make_call_stubs "$BATS_TEST_TMPDIR/call-bin" "$BATS_TEST_TMPDIR/calls"`; run `run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" PATH="$BATS_TEST_TMPDIR/call-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"`: allowed, and `$BATS_TEST_TMPDIR/calls` doesn't exist. Then `write_marker "plans/my plan" 5000 0 '' "$OWNER"` and the same run again: status 0, empty `$output`, and `$BATS_TEST_TMPDIR/calls` has the line `cat` and no line `git`.
   - `no CLAUDE_PROJECT_DIR, or an empty one, is allowed`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `run --separate-stderr env -u CLAUDE_PROJECT_DIR bash "$SCRIPT" <<< "$(hook_input "$OWNER")"` is allowed; `run --separate-stderr env CLAUDE_PROJECT_DIR= bash "$SCRIPT" <<< "$(hook_input "$OWNER")"` is allowed.
   - `the owning session is blocked with the reason naming the plan and next`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is blocked.
   - `pretty-printed input with the session_id on its own line is read`: same marker; `run_hook` with the four lines `{`, `  "session_id": "<OWNER's value>",`, `  "hook_event_name": "Stop"`, `}` is blocked.
   - `stop_hook_active true doesn't change the decision`: same marker; `run_hook` with `hook_input "$OWNER"`'s line, `"stop_hook_active":false` replaced by `"stop_hook_active":true`, is blocked.
   - `a different session in the same checkout is allowed and the marker is unchanged`: same marker; `run_hook "$(hook_input "$OTHER")"` is allowed, unchanged.
   - `empty stdin is allowed and the marker is unchanged`: same marker; `run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" bash "$SCRIPT" < /dev/null` is allowed, unchanged.
   - `stdin that is not JSON is allowed and the marker is unchanged`: same marker; `run_hook` with each of `session_id=<OWNER's value>`, `"session_id":"<OWNER's value>"` and `not json` is allowed, unchanged.
   - `JSON without a session_id is allowed`: same marker; `run_hook '{"hook_event_name":"Stop","stop_hook_active":false}'` is allowed.
   - `a marker without a session line is allowed`: `write_marker "plans/my plan" 5000 0 ''` (no fifth argument); `run_hook "$(hook_input "$OWNER")"` is allowed, unchanged.
   - `a marker with an empty plan is allowed`: `write_marker '' 5000 0 '' "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is allowed, unchanged.
   - `an unreadable marker is allowed`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `chmod 000 "$MARKER"`; if `[ -r "$MARKER" ]` still succeeds, `chmod 644 "$MARKER"` and `skip "the marker stays readable here"`; `run_hook "$(hook_input "$OWNER")"`; `chmod 644 "$MARKER"`; then status 0 and empty `$output`.
   - `marker lines are read by key, in any order`: create the directory of `$MARKER` and write it with the lines `session=<OWNER's value>`, `block_heartbeat=`, `blocks=0`, `heartbeat=5000`, `started=1000`, `plan=plans/my plan`, in that order; `run_hook "$(hook_input "$OWNER")"` is blocked.
   - `the plan path in the reason goes through print_path and is escaped for JSON`: `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`; `write_marker 'plans\my "q" plan' 5000 0 '' "$OWNER"`; `run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"`; expect status 0 and `$output` equal to exactly this line:

     ```text
     {"decision":"block","reason":"An Orcastrat run is in progress for cygpath-stub [-m] [plans\\my \"q\" plan]. Run the next script for cygpath-stub [-m] [plans\\my \"q\" plan] and continue the run from the step it names. If you meant to pause or stop, follow run's Pause or Stop section, which removes the marker."}
     ```

3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/hooks/stop-guard` with the first line `#!/usr/bin/env bash` and a header comment saying: it is Orcastrat's Stop hook (spec §9, Change 8), run as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard"` whenever Claude tries to end its turn; it finds this checkout's active-run marker from `$CLAUDE_PROJECT_DIR` with file tests only and exits 0 at once when there is none, before reading stdin (D06); it reads only `session_id` from stdin and blocks only the session named in the marker's `session=` line (D144); it blocks by printing `{"decision":"block","reason":"<reason>"}` and exiting 0, and allows by exiting 0 with nothing on stdout (D138); it never runs git, and any error allows the stop (D140); bash 3.2 compatible. Use no `set -e` or `set -u`. Then the fast path, using only bash builtins: `dir=${CLAUDE_PROJECT_DIR:-}`; `exit 0` when `dir` is empty; when `[ -d "$dir/.git" ]`, set `git_dir="$dir/.git"`, otherwise `exit 0`; set `marker="$git_dir/orcastrat/active-run"`; `[ -f "$marker" ] || exit 0`.
5. Below the fast path: a `# shellcheck source=/dev/null` line, then `. "$(dirname "${BASH_SOURCE[0]}")/../scripts/lib/common" 2>/dev/null || exit 0`. Read stdin with `input=$(cat)`. Strip its leading whitespace with `${input#"${input%%[![:space:]]*}"}`, and `exit 0` unless the result starts with `{`. Set `session_id` to the output of `printf '%s\n' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'`, keep only its first line with `session_id=${session_id%%$'\n'*}`, and `exit 0` when it is empty.
6. Then read the marker: `[ -r "$marker" ] || exit 0`; set `plan`, `heartbeat`, `blocks`, `block_heartbeat` and `session` to empty and `has_session=0`; read the marker with `while IFS= read -r line || [ -n "$line" ]; do ... done 2>/dev/null < "$marker" || exit 0`, where the body strips one trailing carriage return with `line=${line%$'\r'}` and, with a `case` on `$line`, sets `plan`, `heartbeat`, `blocks`, `block_heartbeat` or `session` from the `plan=`, `heartbeat=`, `blocks=`, `block_heartbeat=` or `session=` line (setting `has_session=1` for `session=`). Then `exit 0` unless `has_session` is `1`, `session` equals `session_id`, and `plan` isn't empty. Set `shown=$(print_path "$plan") || exit 0`, and `exit 0` when `shown` is empty. Build the reason `An Orcastrat run is in progress for <shown>. Run the next script for <shown> and continue the run from the step it names. If you meant to pause or stop, follow run's Pause or Stop section, which removes the marker.`, escape it for JSON with `escaped=$(printf '%s' "$reason" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g') || exit 0`, print it with `printf '{"decision":"block","reason":"%s"}\n' "$escaped"`, and end the script with `exit 0`.
7. Run Verify and confirm all 14 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats` reports 14 tests and no failure (the unreadable-marker test may be skipped where `chmod 000` leaves the file readable).
- With no marker, `stop-guard` runs no command before exiting 0; it never runs git and never exits nonzero.

### M08-T04: run starts the marker with its session, keeps the heartbeat, and ends only its own marker

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M05-T01, M08-T01, M08-T02
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'scripts/run-state" start "<plan dir>" "${CLAUDE_SESSION_ID}"' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'start "<plan dir>"`. It writes' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Keep the heartbeat.** From 2c item 6' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/run-state" beat` just before each agent dispatch' plugins/orcastrat/skills/run/SKILL.md && grep -F 'If 2c item 6 has written this run' plugins/orcastrat/skills/run/SKILL.md | grep -c . | grep -qx 2 && ! grep -qF '1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run starts the marker with its session, keeps the heartbeat, and ends only its own marker`

**Objective**

`run` writes the marker with this session's ID (D144), runs `run-state beat` around every dispatch, return and commit (D143), and its Pause and Stop end the marker only once 2c item 6 has written it (D142).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Marker** and **Heartbeat** bullets
- plan.md Decisions D142, D143 and D144
- `plugins/orcastrat/skills/run/SKILL.md` section `## Operating rules for long runs`, section `### 2c. Prepare` item 6, and sections `## Pause` and `## Stop`

**Interfaces**

- Consumes: `<session-id>, the second argument of run-state start, stored as the sixth marker line session=<session-id>` (M08-T01)
- Consumes: `run-state beat` (M05-T01)
- Consumes: `run-state end <PAUSE|STOP|COMPLETE> <reason>` (M05-T01)
- Produces: `- **Keep the heartbeat.**` operating rule in `plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 2c, replace the whole line of item 6, which starts ``6. **Run state.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>"`.``, with this line:

   ```text
   6. **Run state.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>" "${CLAUDE_SESSION_ID}"`. Claude Code writes this session's ID into that command before you read this skill, so run it as you see it. It writes this checkout's active-run marker, holding this session's ID, and appends a `start` line to `<plan dir>/notes/run-log.md`. From now until a **Pause**, a **Stop** or completion, the plugin's Stop hook sends this session back to work whenever it tries to end its turn, telling you to run **next** and continue from the step it names. Keep the heartbeat from here on (see Operating rules).
   ```

2. In section `## Operating rules for long runs`, directly below the line that starts `- **After every agent returns**`, insert this line:

   ```text
   - **Keep the heartbeat.** From 2c item 6 until a **Pause**, a **Stop** or completion, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" beat` just before each agent dispatch or SendMessage resume (once before the one message that dispatches or resumes a parallel batch), just after each agent returns (once when a parallel batch has returned), and just after each commit you make. It updates the heartbeat in this checkout's active-run marker. The Stop hook lets this session end its turn after three blocked stops in a row with no new heartbeat, and a later preflight removes a marker whose heartbeat is more than an hour old, so a run that keeps its heartbeat is never taken for a stuck or crashed one.
   ```

3. In section `## Pause`, replace the whole line of item 1, which starts ``1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end PAUSE <reason>`.``, with this line:

   ```text
   1. If 2c item 6 has written this run's marker, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end PAUSE <reason>`. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. A Pause before 2c item 6 (the `detail` gate in 2c item 2) skips this step and leaves any marker alone: it isn't this run's.
   ```

4. In section `## Stop`, replace the whole line of item 1, which starts ``1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end STOP <reason>`,``, with this line:

   ```text
   1. If 2c item 6 has written this run's marker, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end STOP <reason>`, with the reason you report in item 3. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. A Stop before 2c item 6 (a failed preflight check, or a Stop in 2c items 1 to 5) skips this step and leaves any marker alone: it isn't this run's.
   ```

5. Run Verify.

**Done when**

- 2c item 6 runs `run-state start` with the plan directory and `"${CLAUDE_SESSION_ID}"`.
- The operating rules have the **Keep the heartbeat** bullet directly below **After every agent returns**.
- Pause item 1 and Stop item 1 run `run-state end` only when 2c item 6 has written this run's marker.
- Nothing else in the file changed.

### M08-T05: stop-guard releases after 3 blocks without a heartbeat change

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M08-T03
- Files: `plugins/orcastrat/hooks/stop-guard`, `tests/orcastrat/stop-guard.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats`
- Fails first: yes
- Commit: `feat(orcastrat): stop-guard releases after 3 blocks without a heartbeat change`

**Objective**

`stop-guard` counts consecutive blocks in the marker, restarts the count when the heartbeat has advanced, allows the fourth stop in a row with no heartbeat change by replacing the marker with `active-run.released`, and fails open on a bad count, heartbeat or write (D139, D140).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Loop guard** and **Fails open** bullets
- plan.md Decisions D06, D139 and D140
- `plugins/orcastrat/hooks/stop-guard` (whole file)
- `plugins/orcastrat/scripts/run-state` lines 82–93 (the temp-file-then-`mv` rewrite to copy)

**Interfaces**

- Consumes: `stop-guard shell variables dir, git_dir, marker, plan, heartbeat, blocks, block_heartbeat, session, has_session` (M08-T03)
- Consumes: `stop-guard.bats variables SCRIPT, REPO, PROJECT, MARKER, OWNER, OTHER` (M08-T03)
- Consumes: `stop-guard.bats helpers write_marker <plan> <heartbeat> <blocks> <block_heartbeat> [<session>], hook_input <session id>, block_json <plan as printed>, run_hook <stdin text>, make_call_stubs <dir> <log>` (M08-T03)
- Produces: `<git-dir>/orcastrat/active-run.released holding one line: released <UTC> after 3 blocked stops with no heartbeat change; plan <plan>`

**Steps**

1. In `tests/orcastrat/stop-guard.bats`, add these tests, with "allowed", "blocked" and "unchanged" as the existing tests use them, and `$MARKER.released` as the released file:
   - `a block counts itself and records the heartbeat`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is blocked; lines 1–6 of `$MARKER` are then exactly `plan=plans/my plan`, `started=1000`, `heartbeat=5000`, `blocks=1`, `block_heartbeat=5000` and `session=<OWNER's value>`; no `$MARKER.tmp` exists.
   - `three stops in a row with no heartbeat change are blocked and the fourth is allowed`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; three runs of `run_hook "$(hook_input "$OWNER")"` are each blocked, and line 4 of `$MARKER` is then `blocks=3`; a fourth run is allowed, `$MARKER` and `$MARKER.tmp` don't exist, and `$MARKER.released` has exactly one line, matching the regex `^released [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z after 3 blocked stops with no heartbeat change; plan plans/my plan$`.
   - `the stop after a release is allowed and recreates no marker`: `write_marker "plans/my plan" 5000 3 5000 "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is allowed; a second identical run is allowed too; `$MARKER` doesn't exist and `$MARKER.released` still has exactly one line.
   - `a heartbeat change since the last block restarts the count`: `write_marker "plans/my plan" 6000 3 5000 "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is blocked; lines 3–5 of `$MARKER` are then `heartbeat=6000`, `blocks=1` and `block_heartbeat=6000`.
   - `a heartbeat or block count that isn't a whole number is allowed and leaves the marker unchanged`: for each heartbeat and blocks pair `'' 0`, `abc 0`, `-5 0`, `5000 ''` and `5000 x`, `write_marker "plans/my plan" <heartbeat> <blocks> '' "$OWNER"`, then `run_hook "$(hook_input "$OWNER")"` is allowed, unchanged.
   - `a failed marker write is allowed and leaves the marker unchanged`: `write_marker "plans/my plan" 5000 1 5000 "$OWNER"`; `mkdir "$MARKER.tmp"`; `run_hook "$(hook_input "$OWNER")"` is allowed (empty `$stderr` included), unchanged, and `$MARKER.tmp` is still a directory.
   - `a different session leaves the block count as it was`: `write_marker "plans/my plan" 5000 2 5000 "$OWNER"`; `run_hook "$(hook_input "$OTHER")"` is allowed and line 4 of `$MARKER` is `blocks=2`; then `run_hook "$(hook_input "$OWNER")"` is blocked and line 4 is `blocks=3`.
2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/hooks/stop-guard`, directly after the check that `plan` isn't empty, `exit 0` when `heartbeat` or `blocks` isn't a whole number, with `case "$heartbeat" in '' | *[!0-9]*) exit 0 ;; esac` and the same `case` for `blocks`.
4. Below that, set `count=$((10#$blocks))` when `block_heartbeat` equals `heartbeat`, otherwise `count=0`. When `[ "$count" -ge 3 ]`: write one line to `"$marker.released"` with `printf 'released %s after 3 blocked stops with no heartbeat change; plan %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$plan"`, with `2>/dev/null` as the first redirection and `|| exit 0` after it; then `rm -f "$marker" 2>/dev/null`; then `exit 0`.
5. Otherwise, before the reason is built: set `tmp="$marker.tmp"` and copy the marker to it with a `while IFS= read -r line || [ -n "$line" ]` loop that strips one trailing carriage return from each line and writes `blocks=$((count + 1))` in place of the `blocks=` line, `block_heartbeat=$heartbeat` in place of the `block_heartbeat=` line, and every other line unchanged. Run the loop in a subshell whose stderr goes to `/dev/null`, so a failed redirection prints nothing: `( while ...; do ...; done < "$marker" > "$tmp" ) 2>/dev/null`; on failure run `rm -f "$tmp" 2>/dev/null` and `exit 0`. Then `mv -f "$tmp" "$marker" 2>/dev/null`, with the same `rm -f` and `exit 0` on failure. The block line is printed only after the `mv` succeeds.
6. Add to the header comment: the loop guard counts consecutive blocks in `blocks=` and `block_heartbeat=`, restarting at 0 when the heartbeat differs from the one recorded at the last block; at a count of 3 it allows the stop, deletes the marker and writes `active-run.released` with one line saying why (D06, D139); a heartbeat or count that isn't a whole number, or a failed write, allows the stop and leaves the marker unchanged (D140).
7. Run Verify and confirm all 21 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats` reports 21 tests and no failure.
- Three consecutive stops by the owning session with no heartbeat change are blocked, and the fourth is allowed with the marker replaced by `active-run.released`.

### M08-T06: stop-guard finds the marker from worktrees and Windows paths

- Kind: change
- Tier: worker
- Status: done
- Wave: 4
- Depends on: M08-T03, M08-T05
- Files: `plugins/orcastrat/hooks/stop-guard`, `tests/orcastrat/stop-guard.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats`
- Fails first: yes
- Commit: `feat(orcastrat): stop-guard finds the marker from worktrees and Windows paths`

**Objective**

`stop-guard`'s fast path accepts `$CLAUDE_PROJECT_DIR` written with backslashes and follows a `.git` file's `gitdir:` line, absolute or relative, so a linked worktree's session is guarded by that worktree's own marker (D06, D144, D146).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Marker** and **Fast exit when idle** bullets, and §20 item 5
- plan.md Decisions D06, D144, D145 and D146
- `plugins/orcastrat/hooks/stop-guard` (whole file)
- `tests/orcastrat/run-state.bats` tests `start in a linked worktree writes the marker in that worktree's git dir` and `run-state accepts <plan-dir> in both drive-letter forms` (worktree and `cygpath` patterns)

**Interfaces**

- Consumes: `stop-guard shell variables dir, git_dir, marker, plan, heartbeat, blocks, block_heartbeat, session, has_session` (M08-T03)
- Consumes: `stop-guard.bats variables SCRIPT, REPO, PROJECT, MARKER, OWNER, OTHER` (M08-T03)
- Consumes: `stop-guard.bats helpers write_marker <plan> <heartbeat> <blocks> <block_heartbeat> [<session>], hook_input <session id>, block_json <plan as printed>, run_hook <stdin text>, make_call_stubs <dir> <log>` (M08-T03)
- Produces: none

**Steps**

1. In `tests/orcastrat/stop-guard.bats`, add these tests, with "allowed", "blocked" and "unchanged" as the existing tests use them:
   - `a linked worktree's session is blocked by the worktree's own marker`: `git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"`; `PROJECT="$BATS_TEST_TMPDIR/task tree"`; `MARKER="$(git -C "$PROJECT" rev-parse --absolute-git-dir)/orcastrat/active-run"`; `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is blocked, and `$REPO/.git/orcastrat/active-run` doesn't exist.
   - `the main checkout's marker doesn't affect a linked worktree`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"` (the main checkout's marker); `git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"`; `make_call_stubs "$BATS_TEST_TMPDIR/call-bin" "$BATS_TEST_TMPDIR/calls"`; `run --separate-stderr env CLAUDE_PROJECT_DIR="$BATS_TEST_TMPDIR/task tree" PATH="$BATS_TEST_TMPDIR/call-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"` is allowed, `$BATS_TEST_TMPDIR/calls` doesn't exist, and `$MARKER` is unchanged.
   - `a .git file with a relative gitdir and a CRLF line ending is followed`: `PROJECT="$BATS_TEST_TMPDIR/proj"`; `mkdir -p "$PROJECT"`; `printf 'gitdir: ../gitdirs/proj\r\n' > "$PROJECT/.git"`; `MARKER="$BATS_TEST_TMPDIR/gitdirs/proj/orcastrat/active-run"`; `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `run_hook "$(hook_input "$OWNER")"` is blocked.
   - `a .git file without a gitdir line is allowed`: `PROJECT="$BATS_TEST_TMPDIR/proj"`; `mkdir -p "$PROJECT"`; `printf 'not a gitdir line\n' > "$PROJECT/.git"`; `run_hook "$(hook_input "$OWNER")"` is allowed.
   - `a CLAUDE_PROJECT_DIR written with backslashes is followed`: `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; `PROJECT="${REPO//\//\\}"` (every `/` of `$REPO` made a `\`); `run_hook "$(hook_input "$OWNER")"` is blocked.
   - `drive-letter paths in CLAUDE_PROJECT_DIR and in a .git file are followed`: first `command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"`. `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; with `PROJECT="$(cygpath -w "$REPO")"`, then with `PROJECT="$(cygpath -m "$REPO")"`, `run_hook "$(hook_input "$OWNER")"` is blocked. Then `PROJECT="$BATS_TEST_TMPDIR/proj"`, `mkdir -p "$PROJECT"`, `MARKER="$BATS_TEST_TMPDIR/gitdirs/proj/orcastrat/active-run"` and `write_marker "plans/my plan" 5000 0 '' "$OWNER"`; with `$PROJECT/.git` holding the one line `gitdir: ` followed by `cygpath -m "$BATS_TEST_TMPDIR/gitdirs/proj"`'s output, then followed by `cygpath -w "$BATS_TEST_TMPDIR/gitdirs/proj"`'s output, `run_hook "$(hook_input "$OWNER")"` is blocked.
2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/hooks/stop-guard`'s fast path, directly after the check that `dir` isn't empty, turn every backslash in it into `/` with `dir=${dir//\\//}`.
4. Replace the fast path's `else exit 0` branch with an `elif [ -f "$dir/.git" ]` branch followed by `else exit 0`. The new branch sets `gd` to the output of `sed -n 's/^gitdir:[[:space:]]*//p' "$dir/.git" 2>/dev/null`, keeps its first line with `gd=${gd%%$'\n'*}`, strips one trailing carriage return with `gd=${gd%$'\r'}`, turns its backslashes into `/` with `gd=${gd//\\//}`, and runs `exit 0` when `gd` is empty. Then, with a `case` on `$gd`, it sets `git_dir=$gd` when `gd` matches `/*` or `[A-Za-z]:/*`, and `git_dir="$dir/$gd"` otherwise. The rest of the script stays as it is.
5. Add to the header comment: `$CLAUDE_PROJECT_DIR` may be written with backslashes (`C:\…`), which become `/`; when `.git` is a file (a linked worktree), its `gitdir:` line names the git dir, as `/…`, `<drive>:/…` or a path relative to `$CLAUDE_PROJECT_DIR`, read with `sed` before stdin; only `$CLAUDE_PROJECT_DIR/.git` is looked at, never a parent directory's (D144, D145, D146).
6. Run Verify and confirm all 27 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/stop-guard.bats` reports 27 tests and no failure (the drive-letter test is skipped where `cygpath` is absent).
- A linked worktree's session is blocked only by the marker in that worktree's own git dir.

### M08-T07: Register the Stop hook

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M08-T03, M08-T06
- Files: `plugins/orcastrat/hooks/hooks.json`
- Verify: `grep -qF '"Stop"' plugins/orcastrat/hooks/hooks.json && grep -qF 'bash \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard\"' plugins/orcastrat/hooks/hooks.json && ! grep -qF '"matcher"' plugins/orcastrat/hooks/hooks.json && ! grep -qF '"timeout"' plugins/orcastrat/hooks/hooks.json && claude plugin validate ./plugins/orcastrat`
- Fails first: no (a config file with no test; the Verify greps fail until the file exists)
- Commit: `feat(orcastrat): register the Stop hook`

**Objective**

`plugins/orcastrat/hooks/hooks.json` registers one `Stop` hook that runs `bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard"` (D138).

**Read first**

- `docs/orcastrat-execution-spec.md` §9, the **Hook** bullet, and §20 item 5
- plan.md Decision D138
- `plugins/denoizinator-net/hooks/hooks.json` (format reference; a different event)

**Interfaces**

- Consumes: `plugins/orcastrat/hooks/stop-guard` (M08-T03)
- Produces: `plugins/orcastrat/hooks/hooks.json`, one `Stop` hook with the command `bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard"`

**Steps**

1. Create `plugins/orcastrat/hooks/hooks.json` with exactly this content:

   ```json
   {
     "hooks": {
       "Stop": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard\""
             }
           ]
         }
       ]
     }
   }
   ```

2. Leave `plugins/orcastrat/.claude-plugin/plugin.json` unchanged: it gets no `hooks` key (D138).
3. Run Verify.

**Done when**

- `plugins/orcastrat/hooks/hooks.json` holds the content above, and `claude plugin validate ./plugins/orcastrat` passes (its missing-`version` warning is expected).
