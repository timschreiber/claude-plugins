# Advisory triage: M01–M09 review findings vs. HEAD

Checked against `orcastrat-execution` HEAD (`e88074c`, "chore(plan): survey M10"). 44 findings from the `## Advisory` sections of `M01-review.md`…`M09-review.md`. M07 and M09 (both `done`) rewrote large parts of `run`'s SKILL.md after several of these were written; findings are checked against the *current* text, not the text quoted in the review.

## plugins/orcastrat/skills/run/SKILL.md

### A-M01-1 — 2a intro said "These only read" while item 7 writes
**Fixed.** Current line 138: "These only read, **except where an item says it writes**. Stop and report to the user if any fails." Item 6 (pre-rename leftovers, `git worktree prune`) is the one write and is self-documented as such. No further action.

### A-M01-2 — `git worktree prune` can't unregister a pre-rename worktree; "can be deleted" is unconditional
**Still present.** Current 2a item 6 (line 145): "...run `git worktree prune` ... and tell the user in one line that the old `orchestratinator/` directory can be deleted. Never delete it yourself." `git worktree prune` only drops registrations whose directory is *missing*; a worktree still on disk under `.git/orchestratinator/<slug>/` stays a registered worktree, and the check never runs `git worktree list` to notice that before telling the user it "can be deleted."
**Covered later:** No. Nothing in M10–M15's outline touches 2a, and no Decision addresses this.
**Fix:** In 2a item 6, before the "can be deleted" message, run `git worktree list --porcelain` and check whether any `worktree ` line falls under the found `orchestratinator/` directory; if so, tell the user it's still a registered worktree and to run `git worktree remove` (then delete its branch) instead of deleting the directory by hand. Test: a `bats` fixture in a new `2a.bats`-style test (none exists today for 2a prose, since 2a is orchestrator prose, not a script) — practically this is only checkable by a script-level unit if the logic moves into a script, otherwise it's a manual/plan-reviewer-level check.
**Needs decision:** No — the fix only sharpens an existing "never delete it yourself" policy; no new design choice.

### A-M03-4 — Retry section's "dispatch again" left the re-record-HEAD step implicit
**Fixed.** Current **Escalate** step (line 415): "Dispatch the task again at 3d item 1, without checking the limits: **it records the new HEAD as BASE**, dispatches a fresh worker at the next tier, and adds the `Failures:` line." The ambiguity is gone.

### A-M05-1 — 3e item 3 told the reader to "remember the `- Process:` line" that M05-T09 had removed
**Obsolete.** M07 rewrote 3e (Parallel wave) top to bottom; the current 3e item 3 is "Containment check" and contains no "remember the `- Process:` line" text, and no soft-reset language survives anywhere in the file (`grep -c "Process:"` in SKILL.md finds only the unrelated `- Process: already integrated` line at 341, for a merge-failed task that turns out already integrated). No action.

### A-M05-3 — 3d item 6 commits leftover paths as "in the task's Files" without re-checking scope after Verify runs
**Still present**, current line 274 (3d item 6, "Commit what the worker left"): "...commit those paths for the worker (**the scope check passed**, so they are all in the task's Files)..." Item 4 (scope check, line 268) runs before item 5 (Verify, lines 269–273); any untracked file Verify itself creates lands in item 6's commit without ever being scope-checked.
**Covered later:** No outline bullet touches 3d. D86 (plan.md) documents exactly this ordering (scope check, then Verify, then commit-what's-left) as the intended design — the advisory finding is really pointing at a hole *inside* an already-made Decision, not an unimplemented one.
**Fix:** Re-run `scope-check` in item 6 before committing the worker's leftovers (paying the extra script call every task), or constrain what Verify may do. Test: a `run`-level integration test isn't practical in bats (no orchestrator harness); would need a note in the milestone's Review Focus for whichever milestone revisits 3d, or a bats test against a stand-alone helper if this logic is ever extracted into a script.
**Needs decision:** Yes — should item 6 re-run scope-check after Verify (extra script call every task, closes the hole), or is the risk (a Verify command creating a stray untracked file that happens to lie outside Files) accepted as documented residual risk? No source or Decision picks between these.

### A-M05-4 — "Never push" exception lists only "failed or interrupted attempt", not "blocked"
**Still present**, current line 32: "...except the `git reset --hard` to BASE that discards a **failed or interrupted attempt** (see Definitions)..." "Keep a blocked attempt" (Definitions, line 58) explicitly runs "discard the attempt" too (for STUCK/GAP/VACUOUS blocks), so the exception's own wording undercounts what it covers. D99 (plan.md) already states the correct rule: "the exception is the `git reset --hard <BASE>` that discards a **failed, interrupted or blocked** attempt."
**Covered later:** No.
**Fix:** In SKILL.md line 32, change "a failed or interrupted attempt" to "a failed, interrupted or blocked attempt", matching D99 verbatim. Test: none exists for this line (prose); could add a lightweight `grep`-based consistency test asserting the "Never push" bullet contains "blocked", but no such test framework target exists today for SKILL.md prose.
**Needs decision:** No — pure wording sync with an existing Decision (D99).

### A-M07-2 — Containment-failure serial switch isn't recorded anywhere
**Still present.** Current 3e item 3 ("Containment check", lines 289–293) tells the user in one line and switches to serial for the rest of the run, but writes nothing to `notes/run-log.md` or anywhere else. If context compacts or the Stop hook sends the session back after this point, **next**'s output gives no sign the run should stay serial, so the model has to remember on its own. The same applies to which tasks are recorded for GAP/VACUOUS/merge-failure — those only settle into files at items 9/11/12, not when they occur.
**Covered later:** No. D122/D133 (containment mechanics) and D137 (combined re-verify failure bookkeeping) don't address *persisting* the serial-mode switch; no M10–M15 outline bullet touches 3e.
**Fix:** Append a run-log line (e.g. `containment-fallback <UTC> wave <n>`, following the `background-warning`/`already-integrated` line pattern already in the file) when the containment check trips, and have **next** or 2a check for one before deciding parallel-vs-serial for later waves. Test: a `next.bats`/SKILL.md-level test once such a line exists.
**Needs decision:** Yes — where should the serial-mode-for-the-rest-of-the-run fact live: a `notes/run-log.md` line (cheap, consistent with existing patterns) or a milestone/plan.md field (more visible, costs a field)? No Decision picks.

### A-M07-3 — Limit check mid-wave can Pause with earlier batches' worktrees not yet integrated/removed
**Still present.** "Check the limits" runs "before each parallel batch" (line 279); worktree removal and integration only happen "When every batch is done" (line 307 onward). If the limit trips between batches of the same wave, the already-run batches' worktrees are still on disk and unintegrated when **Pause** requires "no task worktrees should remain" (line 429). The next run's 2a item 3 ("Leftover worktrees") would then stop it.
**Covered later:** No.
**Fix:** Either move the limit check to only fire between *waves* (not between batches within one wave), or make Pause mid-wave finish removing+integrating the completed batches (mirroring what "When every batch is done" already does) before writing the Pause commit. Test: none exists; would need a fixture wave with `Max parallel` smaller than the wave and a task limit that trips mid-wave.
**Needs decision:** Yes — which of the two fixes above (limit checked only between waves, vs. Pause finishes in-flight batches) is intended. Neither source nor a Decision settles it.

### A-M07-4 / A-M09-2 (same lines) — Items 11/12 match a task's failure-log "Then" literally, missing the `resume failed (<error>), …` variant
**Still present.** Item 11 (line 339–340) matches "Then `escalated to <next tier>`" and item 12 (line 342–344) matches "Then `blocked (STUCK)`" literally, but item 5 (line 303) can instead write `resume failed (<error>), escalated to <next tier>` or `resume failed (<error>), blocked (STUCK)` when a resume's SendMessage call itself errors. A literal match on the short forms misses the `resume failed (<error>), …` forms.
**Covered later:** No.
**Fix:** Change the match in items 11/12 from an exact-string match to "Then ending in `escalated to <next tier>`" / "Then ending in `blocked (STUCK)`" (or equivalently, matching a trailing substring), so both the plain and `resume failed (<error>), …`-prefixed forms are caught.
**Needs decision:** No — the fix is a precise textual correction; D95 already defines the `resume failed (<error>), …` form.

### A-M09-1 — 3e item 5's "Leave its worktree" wording is stale after M09 moved removal earlier
**Still present**, exactly at line 304: "...Leave its worktree: item 11 or item 12 settles the task once the wave is integrated." But the "When every batch is done" removal step (lines 307–311) now removes every worktree of the wave (after holding reports/failure logs) **before** integration (item 7) even begins, contradicting D174 ("No worktree stays for the user") and the sentence's own premise.
**Covered later:** No.
**Fix:** Reword item 5's last sentence to something like "Its held report and failure log, and item 11 or 12, settle the task once the wave's worktrees are removed and it's integrated" — matching what actually happens.
**Needs decision:** No — pure wording fix; the mechanism (hold, then settle) is already fully specified elsewhere in the same section.

### A-M09-3 — `hold save` / `git worktree remove` in the removal step aren't prefixed with `cd "<MAIN>" &&`
**Still present**, lines 309–311, unchanged: neither the `hold save` line, the block-with-GAP/STUCK `git update-ref` lines, nor the `git worktree remove --force "<worktree>"` line is prefixed with `cd "<MAIN>" &&`. `hold` resolves `<plan-dir>` against the current directory (`plugins/orcastrat/scripts/hold:45-51`), and if the session's shell is still inside a just-processed worktree (from 3e item 1's `cd "<worktree>" && ...` setup command, or from a Verify call), `hold save "<plan dir>" ...` could exit 2 with `not a directory`, turning into a SETUP Stop. Item 7 later does `cd "<MAIN>" &&` before `integrate`, but the removal step that precedes it doesn't.
**Covered later:** No.
**Fix:** Prefix the removal step's `hold save` and `git worktree remove --force` lines with `cd "<MAIN>" &&`, defensively, regardless of whether Claude Code's Bash tool preserves cwd across calls (cheap and removes the ambiguity either way).
**Needs decision:** No — the original reviewer marked this "Unconfirmed" pending whether Claude Code preserves shell cwd between Bash calls; since the fix (`cd "<MAIN>" &&`) is cheap and correct whether or not cwd persists, no decision is actually needed to apply it defensively.

### A-M08-3 — Background-agent waits + Stop hook interaction is unconfirmed
**Still present** (no change to the relevant text). "Keep the heartbeat" (line 31) and the dispatch/return mechanics don't say what happens if the Stop hook fires while the orchestrator's turn has ended waiting on a background dispatch; per the review's chain, three such blocks release the marker (D139), and the next `run-state beat` would then exit 2 with `no active run` (line 41's generic "script exits 2 → SETUP Stop" rule), reached with no notice to the user that the marker was auto-released by the loop guard.
**Covered later:** No.
**Fix:** This is partly a fact question about Claude Code's own Stop-hook timing relative to background agent dispatch/return, not purely a design choice — an `investigate` task (per this plan's own conventions for establishing facts before planning) would settle whether the scenario is even reachable before any code fix is written.
**Needs decision:** Yes/investigate — needs either a runtime fact-finding task or a product decision on whether background dispatch should hold the heartbeat differently.

### A-M08-4 — Failed `run-state beat` after the marker is released/dropped isn't explained to the user
**Still present.** No text anywhere in SKILL.md checks `<git-dir>/orcastrat/active-run.released` (written by the loop guard per D06/D139) when a `run-state beat`/`elapsed` call fails; the generic line-41 rule turns any script exit-2 into a bare SETUP Stop quoting `error: no active run`, without telling the user *why* (loop-guard release vs. another session's stale-marker cleanup vs. genuine corruption).
**Covered later:** No.
**Fix:** On a SETUP Stop caused specifically by a failed `run-state` call, additionally check for `<git-dir>/orcastrat/active-run.released` and, if present, quote its one line to the user (D06 already defines that file's exact contents, so no new Decision is needed to build this). Test: `stop-guard.bats`/`run-state.bats` already exercise the released-file mechanics; a SKILL.md-level test isn't practical, but the fix is implementable purely from existing Decisions.
**Needs decision:** No — D06 and D139 already supply everything the fix needs.

### A-M08-5 — Same-session rerun within an hour of an interruption is still refused
**Still present**, current 2a → toolchain-check item 6 (line 102): "marker: active <n>m ... End the run here...". This is what spec §9 Limit literally requires (one active run per checkout, regardless of session), so the M08 reviewer already flagged it as "a question for the spec, not a code defect."
**Covered later:** No.
**Fix:** N/A pending a decision.
**Needs decision:** Yes — the reviewer's own framing: (a) keep the current refusal exactly as spec'd (a session can't resume its own interrupted run for up to an hour without the marker aging out or being dropped by another start), or (b) special-case "the marker's `session=` equals this session's ID" to allow an immediate resume. Neither the spec excerpt nor any Decision picks. If (a) is kept, this is arguably a README caveat for M15 rather than a code change, since it's working as designed.

## plugins/orcastrat/README.md

### A-M01-3 — Auto-migration paragraph states no version conditions
**Still present**, exact same text at line 28: "...so after `claude plugin marketplace update timschreiber` an installed `orchestratinator@timschreiber` becomes `orcastrat@timschreiber` on its own. The steps above are the fallback if it doesn't." No mention of the Claude Code v2.1.193+ requirement, `plugin-not-found` on older versions, or that migration only triggers when Claude Code starts with the old name still in settings (all cited from `notes/M01-T01.md` in the original review).
**Covered later:** Not by name — no M15 outline bullet specifically names the "Upgrading from Orchestratinator" section, though M15's outline broadly rewrites the README (Prerequisites, commits/resume, parallel defaults, Windows notes, cast table, "During a run"). D25 approved this exact paragraph's *presence* ("the README's 'Upgrading...' section says so") but didn't address precision/version-gating.
**Fix:** Add the version condition and trigger condition from the docs already cited in `notes/M01-T01.md`. Flag for the M15 task that touches README/CHANGELOG since it's documentation of behavior, per the brief's note that M15 owns README/CHANGELOG accuracy (D26, D125).
**Needs decision:** No — factual completion of an already-approved paragraph.

## scripts/run-bats.sh

### A-M02-1 — Interrupted first clone can't self-heal
**Still present**, line 13: `if [ ! -d "$bats_dir" ]; then` clones. A directory left behind by an interrupted clone (no `bin/bats` inside) satisfies this test forever after, and every later run fails at `exec "$bats_dir/bin/bats"` until a human deletes the directory; a future `BATS_TAG` bump also never re-clones an existing directory.
**Covered later:** No.
**Fix:** Change the condition to check for the executable, e.g. `if [ ! -x "$bats_dir/bin/bats" ]; then rm -rf "$bats_dir"; git clone ...; fi`. Test: impractical to unit-test without a real (or stubbed) git clone in CI; could add a bats test that pre-creates an empty `.tools/bats-core` directory and stubs `git`/`exec` to verify the self-heal path is taken, if this dev script gets its own tests (it currently has none — it's exercised only by being *used* to run the suite).
**Needs decision:** No.

## scripts/Validate-All.ps1 / tests/orcastrat/no-powershell.bats

### A-M02-2 — `Get-ChildItem` without `-Force` misses dotfiles on Linux/macOS PowerShell
**Still present**, lines 42 and 48 (`Get-ChildItem -LiteralPath $orcastrat -Recurse -File` / `...-LiteralPath $dir -Recurse -File`), neither has `-Force`. On non-Windows PowerShell every dot-prefixed path is "hidden," so a `.ps1` under a dot directory of `plugins/orcastrat/` is caught by `no-powershell.bats`'s `find` (which has no such blind spot) but not by the local `Validate-All.ps1` gate — the two D11 implementations can disagree.
**Covered later:** No.
**Fix:** Add `-Force` to both `Get-ChildItem` calls at lines 42 and 48.
**Needs decision:** No.

### A-M02-3 — `.ps1` / `pwsh` checks are case-sensitive on both sides, so `Helper.PS1` passes both
**Still present.** `scripts/Validate-All.ps1:43`: `Where-Object { $_.Extension -ceq '.ps1' }` (the `-ceq` operator is explicitly case-sensitive). `tests/orcastrat/no-powershell.bats:12`: `find "$root" -type f -name '*.ps1'` (case-sensitive by default on Linux). D11 says "fails on any `.ps1` file", with no case caveat.
**Covered later:** No.
**Fix:** Change `-ceq` to `-eq` (PowerShell string `-eq` is case-insensitive) at Validate-All.ps1:43, and `-name` to `-iname` at no-powershell.bats:12 (and in the `portability_violations` helper if used elsewhere). Test: extend `no-powershell.bats`'s "a .ps1 file anywhere in the plugin is a violation" test (line 25) with a `Helper.PS1`-named fixture to lock in the fix as a regression test.
**Needs decision:** No.

## plugins/orcastrat/agents/plan-reviewer.md

### A-M02-4 — Check 11 flags `-and`/`-or`/`-not` as non-bash, but they're valid `find` operators
**Still present**, exact text at line 49 (unchanged from the original citation): "...the `-and`, `-or` and `-not` operators, a backtick line continuation, or cmd.exe syntax..." `find . -not -path y` is valid POSIX/GNU `find` syntax in bash, so a correct bash Verify using it draws a false-positive advisory finding.
**Covered later:** No.
**Fix:** Qualify the operators, e.g. "PowerShell's `-and`, `-or` and `-not` comparison operators (not `find`'s test predicates of the same name)".
**Needs decision:** No. No automated Verify realistically exists for this (it's judged by the plan-reviewer agent's own model reasoning); the fix is text-only.

## plans/orcastrat-execution/notes/M02-T02.md

### A-M02-5 — Inventory row's `plugins/orcastrat/skills/plan/SKILL.md:163` citation is stale
**Still present, and drifted further.** Row still reads `...SKILL.md:163` (line 66 of the inventory file). The actual `git status --porcelain` line in `plugins/orcastrat/skills/plan/SKILL.md` is now at **line 217** (not 163 or even the review's already-corrected 164 — further edits since M02 moved it again).
**Covered later:** Yes — M15's outline explicitly says "CHANGELOG *Added*, *Changed* and *Removed* entries per §28, **with the inventory**, model-pin grep, and dispatch sizes," i.e. this file is a planned input to an M15 task.
**Fix:** When the M15 task copies this inventory into the CHANGELOG, it must re-verify every `path:line` against current HEAD rather than trusting M02-T02.md's citations, since at least this row has drifted twice since it was written.
**Needs decision:** No.

## plugins/orcastrat/scripts/recover

### A-M03-1 — Trailer matching spans the whole branch history, so cross-plan task-ID reuse produces a false `done`
**Still present**, unchanged mechanism (current `recover:105-127`, matches the design in D57). If a plan's `- Branch:` already exists with commits from an unrelated earlier plan that used the same task IDs (the review's own example: `main` holds `e3fa35d` `Orchestratinator-Task: M01-T01` from `plans/orchestratinator-robustness`), a still-`todo` `M01-T01` in the new plan is falsely reported `done` and `run` skips it without executing it.
**Covered later:** No Decision or M10–M15 outline addresses it; D57 (the original design) doesn't scope the search to the current plan.
**Fix:** The plan already solved an analogous problem for `milestone-reviewer`'s Base-finding: D78 restricts the search to "this plan's commits only," starting from the commit that added `plan.md`. The same restriction pattern (search trailers only in commits reachable from Branch **and** added after the commit that added this plan's `plan.md`) would close this gap the same way. Test: `recover.bats` would need a fixture with a pre-existing branch carrying an unrelated plan's trailer for a reused task ID, asserting `recover` no longer reports it `done`.
**Needs decision:** Yes — whether to adopt the D78 restriction pattern for `recover` too (cheap, precedented) versus leaving it as documented residual risk (branches are meant to be created fresh per plan per D01, so the scenario needs a user to deliberately reuse or pre-populate a branch name).

## plugins/orcastrat/scripts/verify

### A-M03-2 / A-M03-3 — `cd`/`mkdir -p` failures print their own message before `error:`, violating the one-line stderr promise
**Still present**, unchanged: `verify:40` (`common_abs=$(cd "$dir" && cd "$common" && pwd) || fail ...`) and `verify:43` (`mkdir -p "$log_dir" || fail ...`) both run a builtin/command that can itself write to stderr (a `cd:` or `mkdir:` message) before the `fail` function's `error: <message>` line, giving two stderr lines instead of D55's promised one.
**Covered later:** No — D54/D55 define the intended one-line format but don't address builtins' own stderr chatter; no M10–M15 outline touches `verify`.
**Fix:** Redirect the failing subshells' own stderr to `/dev/null` explicitly, e.g. `common_abs=$(cd "$dir" 2>/dev/null && cd "$common" 2>/dev/null && pwd) || fail ...` and `mkdir -p "$log_dir" 2>/dev/null || fail ...`. Test: `verify.bats` would need a fixture that makes `cd`/`mkdir -p` fail (e.g. a `<dir>` under a path with no execute permission, or a common-dir resolution failure) and assert stderr is exactly one `error:` line.
**Needs decision:** No.

## tests/orcastrat/verify.bats

### A-M03-5 — The D65 single-quoted-argument quoting path is never actually exercised
**Still present**, same test, same lines (110–117, "verify runs a command containing single and double quotes as one argument"). `run_script` (line 15) calls `bash "$SCRIPT" "$@"` — bats passes the command as a clean argv element — never through the literal one-line, single-quoted form with `'\''`-escaping that `run` actually constructs (per SKILL.md's "Verify a command" Definition and D65). The escaping mechanism itself is untested.
**Covered later:** No.
**Fix:** Add a test that builds the actual one-line invocation `run` would produce (e.g. embed the command in a string like `bash ".../verify" "$PLAN" "$REPO" '<command-with-embedded-quotes-escaped-as-'"'"'\'"'"''"'"'>'` and run that whole line through `bash -c`), confirming the quoting round-trips.
**Needs decision:** No.

## plugins/orcastrat/agents/scout-heavy.md

### A-M04-1 — "External research is allowed" bullet has no WebFetch/WebSearch tool to back it
**Still present**, exact text unchanged at line 54: "**External research** (library docs, API references) is allowed when the brief asks for it." `tools:` (frontmatter) is `Read, Glob, Grep, Bash, Write` — no WebFetch/WebSearch — and the "Search and command bounds" section forbids reaching for `curl` via Bash for anything but short read-only commands.
**Covered later:** No.
**Fix:** Drop this bullet from scout-heavy.md (its own suggestion), since `scout` already carries WebFetch/WebSearch (`agent-files.bats:197`) and `planner.md`'s QUESTIONS routing can send web-research questions there instead.
**Needs decision:** Yes (light) — dropping the bullet vs. adding WebFetch/WebSearch to scout-heavy's allowlist are both viable; spec §22 item 3 is quoted elsewhere as "Web fetch and search only for `scout`," which favors dropping the bullet, but no Decision states this explicitly for scout-heavy.

## plugins/orcastrat/agents/worker-heavy.md

### A-M04-2 — Description promises "bounded judgment," body has no judgment-permission rule (specialist.md has one, worker-heavy.md doesn't)
**Still present.** `worker-heavy.md:3`: "...needs bounded judgment the plan can't pin down..." `worker-heavy.md:60` (investigate-task rule) is immediately followed by `## Report file` at line 62 — no judgment bullet in between. `specialist.md:61` has: "You may use judgment on implementation details that stay inside the task's Files... Anything visible outside those files... is a `GAP`."
**Covered later:** No M10–M15 outline touches worker-heavy.md. The original review itself notes this was flagged as deliberate ("M04 Context: 'specialist alone keeps its extra judgment Rule'"), i.e. this may already be an intentional decision recorded only in M04's Context prose rather than a plan.md Decision.
**Fix:** Either add the same judgment-permission bullet to worker-heavy.md (aligning body with description/rubric), or soften worker-heavy's description/rubric wording so "bounded judgment" doesn't imply a rule it doesn't have.
**Needs decision:** Yes — which of the two directions above; the M04 Context note suggests "specialist alone keeps it" was already chosen, but that leaves the description text still promising more than the body grants, and no plan.md Decision formalizes the choice.

## tests/orcastrat/agent-files.bats

### A-M04-3 — No fixture test exercises the "no `tools` line → flagged" branch
**Still present.** "no-shell agents have a tools line without Bash" (lines 211–220) does contain `[ -z "$(field "$AGENTS/$name.md" tools)" ] || ...` — the logic is right — but it only ever runs against live agent files, all of which currently have a `tools:` line, so that branch of the `||` is never taken `true` in a passing run; a regression that broke the `-z` check itself would go unnoticed. Other tests in the same file (e.g. lines 140, 148, 155) already use `$BATS_TEST_TMPDIR` fixtures for exactly this kind of negative case.
**Covered later:** No.
**Fix:** Add a fixture-based test: write a no-shell agent's frontmatter with no `tools:` line to `$BATS_TEST_TMPDIR`, and assert it's reported as disallowing... i.e. flagged "bad" by the same check logic used in the live test.
**Needs decision:** No.

## plugins/orcastrat/agents/planner.md

### A-M04-4 — Report template's `TASKS:` example is stale for the five-tier system
**Still present**, exact same text at line 133: `TASKS: <count by tier, e.g. worker 9, worker-light 2, worker-heavy 1>`. `plan-format.md:285` now says `worker-light` is "**The default.**" (Sonnet/medium), and the example omits `worker-mini` entirely (the lowest tier, per `plan-format.md:284`).
**Covered later:** No.
**Fix:** Update the example to reflect the current five-tier rubric, e.g. `worker-light 9, worker-mini 3, worker 4, worker-heavy 1`.
**Needs decision:** No.

## plugins/orcastrat/agents/worker*.md (all six: worker, worker-light, worker-heavy, specialist, worker-mini-serial, worker-mini-parallel)

### A-M04-5 — Bounds block's `run-bats.sh` example is this repo's own dev script, but agent files ship to other repos
**Still present** in all six files (each at its own "Search and command bounds" section, e.g. `worker.md:17` equivalent): "...`run-bats.sh` clones bats itself." This repo's dev script name is a per-run/per-repo detail baked into a shipped agent file, arguably conflicting with spec §22 item 1's "no dates, paths, plan names, or per-run content" even though D73 explicitly prescribed this exact wording.
**Covered later:** No — D73 is the source of the current wording, and no later Decision or outline revisits it.
**Fix:** Replace the concrete example with a generic one, e.g. "a task's own Verify command, or a script the task names, may already establish this," so the instruction doesn't name a repo-specific script.
**Needs decision:** Yes — D73 deliberately chose this wording; changing it means either overriding D73 or confirming this specific example is acceptable as "illustrative, not per-run content" (the finding calls out only a possible conflict with spec §22 item 1, not a certain one).

## plugins/orcastrat/reference/plan-format.md

### A-M05-2 — "at most two tiers above its planned Tier" doesn't match `run`'s starting-tier (Re-tiered) counting
**Still present**, now at line 248 (shifted by one from the review's :247): "A task climbs the ladder one tier per `- Escalated:` line, at most two tiers above **its planned Tier** (three rungs)..." But SKILL.md's "Current tier and rung" Definition (line 52) and D31/D84 count from the task's **starting tier** — its `- Re-tiered:` tier when it has one, otherwise its planned Tier — so a re-tiered batch task's climb is measured from the wrong baseline by this sentence.
**Covered later:** Yes, likely — M14's outline explicitly includes "`reference/plan-format.md`: ... `Re-tiered:` as a line `run` appends," which is the natural place to also fix this sentence's "starting tier" language when M14 documents `Re-tiered:`.
**Fix:** When M14 adds the `Re-tiered:` line to plan-format.md, also change "its planned Tier" in this sentence to "its starting tier (its `- Re-tiered:` tier, if any, otherwise its planned Tier)".
**Needs decision:** No — D31/D84 already settle the semantics; this is a wording sync, likely to happen naturally as part of the M14 task.

## tests/orcastrat/task-brief.bats

### A-M06-1 / A-M06-2 — Negated `grep`/assertions aren't the test's last command, so they can never fail under bats
**Still present**, same lines, unchanged: line 180 (`! grep -qxF '### M01-T02: Second task' ...`, followed by another assertion at 181) and line 210 (`! grep -q "$(printf '\r')" ...`, followed by a `diff` at 211–212). bats's `set -e` doesn't apply to a `!`-negated command, and since neither line is the test's last command, a `grep` match (which should fail the test) is silently swallowed.
**Covered later:** No.
**Fix:** Replace each with `run ! grep -qxF ... "$BRIEFS/M01-T01.md"` (or `run grep ...; [ "$status" -ne 0 ]`) so the assertion actually participates in the test's pass/fail.
**Needs decision:** No.

## plugins/orcastrat/scripts/next

### A-M06-3 — Header comment says "six" lines, script prints nine
**Still present**, unchanged, `next:4`: "# Prints the run's current position as six `key: value` lines...". The script prints 9 (`plan`, `milestone`, `next`, `wave`, `blocked`, `open-questions`, `recover`, `worktrees`, `marker`; confirmed at the `printf` calls, lines 290–302).
**Covered later:** No. **Fix:** Change "six" to "nine" (and, ideally, list the three lines D174/D153 etc. added — `worktrees`, `marker`, and confirm `recover` was already among the six). **Needs decision:** No.

### A-M06-4 — `has_todo` ignores whether Wave is a valid number, producing `wave: none` + `next: wave none`
**Still present**, unchanged, `next:204` (`has_todo=1` set unconditionally for any `todo` task) vs. the numeric-wave filter at lines 205–208 that only affects `min_wave`. If every `todo` task in the current milestone has an empty or non-numeric Wave, `wave_line` stays `wave: none` (line 196 default) while `has_todo=1`, so `next_step="wave $wave_n"` (line 280–281) becomes the literal string `wave none` — a step `run` has no handling for.
**Covered later:** No.
**Fix:** Either fail loudly (`next` exits 2, "todo task with no valid Wave") or have the `next:` line fall back to something `run` can act on (e.g. treat an invalid Wave as a validation-checklist failure surfaced separately, since Wave is supposed to be assigned by the planner before any task is `todo`). Test: `next.bats` fixture with a `todo` task whose Wave is blank/non-numeric.
**Needs decision:** Yes — what should happen in this state: is it even reachable (should the validation checklist already reject a milestone with a `todo` task and no valid Wave, making this dead code), or does `next` need its own explicit handling? No Decision addresses it.

### A-M06-5 — `recover`'s own stderr isn't suppressed, so a `recover` failure prints two `error:` lines
**Still present**, unchanged, `next:58-60`: `recover_out=$(bash ".../recover" "$plan_dir")` (stdout captured, stderr not redirected) then `[ "$recover_status" -eq 0 ] || fail 'recover failed'`. If `recover` itself exits 2 with its own `error: ...` line, that reaches `next`'s stderr unsuppressed, followed by `next`'s own `error: recover failed` — two lines instead of D55's promised one.
**Covered later:** No.
**Fix:** Redirect `recover`'s stderr, e.g. `recover_out=$(bash ".../recover" "$plan_dir" 2>/dev/null)`.
**Needs decision:** No.

## plugins/orcastrat/scripts/task-brief (and recover, next)

### A-M06-7 — `fence_of` is duplicated in four places
**Still present.** The same `fence_of` awk function is copied in `task-brief`'s `extract_awk` (lines 86–93) and `find_heading_awk` (lines 125–132), and independently in `recover`'s `todo_awk` (lines 60–67) and `next`'s `tasks_awk` (lines 104–111) — four copies total. A later fix to the fence rule has to be applied in all four.
**Covered later:** No. This is distinct from D44's `lib/common` (which covers `print_path`, not awk helpers).
**Fix:** Factor `fence_of` into a shared awk include, or accept the duplication as a documented tradeoff of these scripts being bash-3.2-only single files with no awk library mechanism readily available; if kept, add a code comment cross-referencing all four copies (already partially done — `task-brief`'s comment at line 74 already cross-references `recover`).
**Needs decision:** Yes (low stakes) — whether de-duplicating is worth the added indirection in bash-3.2-only scripts with no natural "source an awk snippet" mechanism, or whether the existing cross-reference comments are sufficient mitigation. No Decision addresses it either way.

## plugins/orcastrat/agents/worker*.md (all six)

### A-M06-6 — "change nothing except your note" (investigate tasks) reads as contradicting "whatever your status, write your report file"
**Still present** in all six worker agent files, e.g. `worker.md:60` ("If the task's Kind is `investigate`: change nothing except your note...") immediately followed by `## Report file` (`worker.md:62`) / "Before you reply, **whatever your status**, write your report file..." (`worker.md:64`). On inspection this likely isn't a real logical contradiction — "note" almost certainly refers colloquially to the same report file the `## Report file` section defines precisely (the Definitions in SKILL.md have only one Report file location per task, with no investigate-specific alternate), and the README already calls investigate output "findings...to `notes/`" — but the wording invites a worker to read "note" as something separate from the six-section report file it must otherwise write.
**Covered later:** No.
**Fix:** Replace "change nothing except your note" with "change nothing except your report file" (or "...your report") in all six agent files, for consistency with the `## Report file` section's terminology.
**Needs decision:** No — this reads as a terminology fix, not a behavior change (the underlying rule — investigate tasks touch only their report file — is already unambiguous elsewhere).

## plugins/orcastrat/agents/merger.md

### A-M07-1 — 20-line overflow rule points at a file the merger can't write
**Still present**, unchanged at line 54: "Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path." `tools:` (line 6) is `Read, Glob, Grep, Edit` — no Write — and line 48 says "Never create a file." Since the merger's actual reply format (`STATUS:`/`NOTE:` — line 56–61) is a fixed two-line block, the overflow rule can never trigger, but it still sits in the file contradicting the merger's other instructions.
**Covered later:** No.
**Fix:** Drop the "Anything longer goes in a file..." sentence from line 54, leaving just "Your reply is at most 20 lines." (already true given the two-line reply format).
**Needs decision:** No.

## plugins/orcastrat/hooks/stop-guard

### A-M08-1 — `2>/dev/null` comes after the redirect it's meant to guard
**Still present**, unchanged, lines 98–99: `printf '...' ... > "$marker.released" 2>/dev/null || exit 0`. Bash applies redirections left to right, so if opening `$marker.released` itself fails, that error reaches the hook's real stderr before `2>/dev/null` takes effect (though `exit 0` after `|| exit 0` still keeps the hook's exit status correct and stdout empty). No test covers a failed write of the released file.
**Covered later:** No.
**Fix:** Reorder to `2>/dev/null > "$marker.released"`, or wrap the whole `printf ... > file` in `{ ...; } 2>/dev/null`.
**Needs decision:** No.

### A-M08-2 — Block count (`mv`) is written before `print_path`/JSON-escaping run
**Still present**, unchanged: the `mv -f "$tmp" "$marker"` write (line 119) happens before `print_path "$plan"` (line 125) and the JSON `sed` escaping (line 129). If either of those later steps fails, the hook still allows the stop (per its fail-open design) but has already incremented the block count — contradicting spec §9 Fails open, "an error leaves the loop guard's block count unchanged."
**Covered later:** No. D140 documents the intended "fails open, marker unchanged" behavior but the code doesn't fully deliver it for this specific failure window.
**Fix:** Move the `mv -f "$tmp" "$marker"` write to after `print_path`/escaping succeed (compute `reason`/`escaped` first, using the *old* `$plan` value which is already read before any write, then only write the marker once ready to also print the block JSON) — or accept the current order as an accepted, very-low-probability tradeoff (T05 Step 5 already prescribed this exact order deliberately, per the original review).
**Needs decision:** Yes (very low priority) — whether to reorder for full fails-open correctness in this rare failure window, or accept it as already deliberately ordered per T05 Step 5 (the original finding notes "those failures are very unlikely").

## plugins/orcastrat/scripts/instructions-ack

### A-M09-4 — Unchecked `mv -f` can leave `$ack.tmp` behind with the old ack intact
**Still present**, unchanged, line 62: `mv -f "$ack.tmp" "$ack"` — no `||` error check, so a failed rename (e.g. cross-filesystem edge case, permissions) still `exit 0`s successfully while leaving `$ack.tmp` on disk and the old `ack` file (and old choice/hashes) untouched, silently. D55's error contract isn't honored for this specific failure.
**Covered later:** No.
**Fix:** `mv -f "$ack.tmp" "$ack" || fail "cannot write: $(print_path "$ack")"`.
**Needs decision:** No.

## plugins/orcastrat/scripts/hold

### A-M09-5 — Empty `<key>` passes validation and `save` then wipes the whole `hold/` directory for the plan
**Still present**, unchanged: `key=$2` (line 46) has no non-empty check; `save`'s `rm -rf "$key_dir"` (line 66), with `key_dir="$common_abs/orcastrat/$slug/hold/$key"` (line 62), becomes `.../hold/` when `key` is empty — deleting every other task's held files for the plan. `run` always passes a task ID as `<key>` today, so the risk is currently theoretical.
**Covered later:** No.
**Fix:** Add `[ -n "$key" ] || fail 'usage: hold save <plan-dir> <key> <dir> <path>... | restore ...'` (or a more specific message) right after `key=$2`.
**Needs decision:** No.

## tests/orcastrat/skill-files.bats

### A-M09-6 — Diagnostic `bad` list shows full paths instead of skill directory names
**Still present**, unchanged, lines 29 and 39: both `bad="$bad $(dirname "$f")"` for `$f` in `"$SKILLS"/*/SKILL.md`, so `dirname` yields the full path (e.g. `/…/plugins/orcastrat/skills/plan`) rather than just `plan` as M09-T06 Step 2 intended. Cosmetic only — doesn't affect what either test (lines 25–34, 36–43) actually asserts.
**Covered later:** No.
**Fix:** Use `$(basename "$(dirname "$f")")` in both places.
**Needs decision:** No.

---

## Summary table

| ID | Quote (short) | Status | Covered later | Needs decision |
|---|---|---|---|---|
| A-M01-1 | SKILL.md 2a "only read" vs. writing item | Fixed | — | No |
| A-M01-2 | worktree prune can't see old registered worktree | Still present | No | No |
| A-M01-3 | README auto-migration unconditional | Still present | Implicit (M15 README rewrite, not named) | No |
| A-M02-1 | run-bats.sh clone not self-healing | Still present | No | No |
| A-M02-2 | Validate-All.ps1 missing `-Force` | Still present | No | No |
| A-M02-3 | `.ps1`/`pwsh` checks case-sensitive | Still present | No | No |
| A-M02-4 | plan-reviewer check 11 `-and`/`-or`/`-not` false positive | Still present | No | No |
| A-M02-5 | M02-T02.md inventory line drift | Still present (worse) | Yes (M15 CHANGELOG inventory bullet) | No |
| A-M03-1 | recover cross-plan trailer reuse | Still present | No | Yes |
| A-M03-2 | verify `cd` failure double stderr | Still present | No | No |
| A-M03-3 | verify `mkdir -p` failure double stderr | Still present | No | No |
| A-M03-4 | Retry "dispatch again" ambiguity | Fixed | — | No |
| A-M03-5 | verify.bats never exercises D65 quoting | Still present | No | No |
| A-M04-1 | scout-heavy "External research" with no web tool | Still present | No | Yes (light) |
| A-M04-2 | worker-heavy lacks judgment rule specialist has | Still present | No | Yes |
| A-M04-3 | agent-files.bats no-tools-line branch untested | Still present | No | No |
| A-M04-4 | planner.md TASKS example stale | Still present | No | No |
| A-M04-5 | worker*.md run-bats.sh example is repo-specific | Still present | No | Yes |
| A-M05-1 | 3e item 3 stale "- Process:" wording | Obsolete (M07 rewrote 3e) | — | No |
| A-M05-2 | plan-format tier climb "planned Tier" vs. starting tier | Still present | Yes (M14 Re-tiered: bullet) | No |
| A-M05-3 | 3d item 6 commits leftovers without re-scope-check after Verify | Still present | No | Yes |
| A-M05-4 | "Never push" exception omits "blocked" | Still present | No | No |
| A-M06-1 | task-brief.bats negation not last command (1) | Still present | No | No |
| A-M06-2 | task-brief.bats negation not last command (2) | Still present | No | No |
| A-M06-3 | next.md header says "six", prints nine | Still present | No | No |
| A-M06-4 | next `has_todo`/`wave: none` edge case | Still present | No | Yes |
| A-M06-5 | next doesn't suppress recover's stderr | Still present | No | No |
| A-M06-6 | worker*.md "note" vs. "report file" wording | Still present | No | No |
| A-M06-7 | fence_of duplicated 4×  | Still present | No | Yes (low stakes) |
| A-M07-1 | merger.md 20-line file-overflow rule unreachable | Still present | No | No |
| A-M07-2 | containment-failure serial switch unrecorded | Still present | No | Yes |
| A-M07-3 | limit check mid-wave can Pause with unintegrated worktrees | Still present | No | Yes |
| A-M07-4 | items 11/12 literal "Then" match misses resume-failed form | Still present | No | No |
| A-M08-1 | stop-guard redirect order | Still present | No | No |
| A-M08-2 | stop-guard mv before print_path/escaping | Still present | No | Yes (low priority) |
| A-M08-3 | background-agent + Stop hook interaction unconfirmed | Still present | No | Yes/investigate |
| A-M08-4 | failed beat after marker released, no user-facing reason | Still present | No | No |
| A-M08-5 | same-session rerun refused within an hour | Still present | No | Yes |
| A-M09-1 | 3e item 5 stale "leave its worktree" wording | Still present | No | No |
| A-M09-2 | item 11 `<n>` missing for escalated task after removal | Still present | No | No |
| A-M09-3 | hold save/worktree remove missing `cd MAIN` prefix | Still present | No | No |
| A-M09-4 | instructions-ack unchecked `mv -f` | Still present | No | No |
| A-M09-5 | hold empty key wipes whole hold dir | Still present | No | No |
| A-M09-6 | skill-files.bats dirname shows full path | Still present | No | No |
