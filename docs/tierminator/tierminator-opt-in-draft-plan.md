# tierminator opt-in: draft plan

**Status: SUPERSEDED (2026-09-28).** Phases 0 to 2 (the probes, arming and
disarming, and gating every hook) are implemented, renamed `/tierminator:arm`
and `/tierminator:disarm`; see the reference doc's
[Arming](tierminator-reference.md#arming) section. The saved-plan execution
and the workflow overlap parts were written for the earlier workflow design
and are not planned. What follows is kept as it was written.

**Original status: DRAFT. Nothing here is implemented, and nothing is decided until the
evidence phase (Phase 0) has run.** Written 2026-09-26 from a design discussion.
This is a design plan, not a tiered task plan: it has no `json tiered-tasks`
block. Turn it into one in plan mode when work starts.

## Goal

tierminator is on in every session today. Change it so a user must opt in per
session, and so it acts only where the user wants it:

1. A session is **unarmed** by default. An unarmed session behaves as if the
   plugin were not installed.
2. `/tierminator` (alias of `/tierminator:start`) arms the session.
   `/tierminator:stop` disarms it. A new session starts unarmed.
3. **Armed + plan mode**: the tiering rules and the plan gate apply, as today.
4. **Armed + manual or auto mode**: prompts run as normal, with two exceptions
   below. Nothing is injected, gated or blocked.
5. **Executing an approved plan** still happens after the user leaves plan mode.
   That is the point of the plugin, and it is allowed.
6. **Executing a saved plan** the user names in a prompt (not from plan mode) is
   run through tierminator when the plan is a valid tierminator plan and the
   session is armed. Otherwise it runs as normal.
7. Two plans never run together.

## Decisions already made

- `start` only arms. It does **not** enter plan mode.
- Armed is separate from active: arming outside plan mode is allowed; nothing
  happens until plan mode or a saved-plan execution.
- `/tierminator`, `:start` and `:stop` are user-only (`disable-model-invocation:
  true`), so the model cannot arm or disarm the plugin.
- The armed flag lives in the existing per-session state (`lib/state.js`), so a
  new session is unarmed, `--resume` keeps the flag, and `SessionEnd` cleanup
  removes it.
- Saved-plan detection is deterministic (`parsePlan()` on a path found in the
  prompt). Judging whether the user wants it executed is left to the model, so
  the wording is not restricted.
- A prompt that resolves to two or more valid plans launches none of them; the
  user must pick one (see Phase 3).
- Every hook checks the armed flag first and exits, so unarmed sessions pay one
  small file read.

## Hook behavior by state

| State | Behavior |
|---|---|
| Unarmed, any mode | Every hook returns at once. |
| Armed, plan mode | `h1` injects rules; `h2` gates `ExitPlanMode`; `h3` saves approved tasks. |
| Armed, manual/auto, no candidate | Nothing fires. |
| Armed, manual/auto, prompt names one valid plan | `h1` saves a `candidate` and adds a note; the model decides; `h4` fills the args. |
| Armed, manual/auto, prompt names 2+ valid plans | `h1` saves candidates and a note telling the model to ask which; `h4` accepts only one stored plan per launch. |
| Approved, before launch | `h5` guards the window (same turn as approval). |
| Launched | `h5` stands down. |

## Phases

### Phase 0: Evidence (before anything is decided)

Each probe gets an evidence file under `probes/evidence/planandtier-*` and a
findings entry under `docs/tierminator/`. No claim is added without its file.

1. **Slash-command input.** What `UserPromptSubmit` receives for `/tierminator`,
   `/tierminator:start` and `/tierminator:stop`: raw text, or the expanded skill
   body.
2. **Bare command resolution.** Does `/tierminator` resolve to a skill named
   `tierminator` inside the plugin `tierminator`?
3. **Zero-token toggle.** Does blocking from `UserPromptSubmit` suppress the
   model turn and still show the user a message? Does it work for slash
   commands? (Fallback: a skill body that says "confirm in one line".)
4. **Skill-scoped hooks.** Do hooks declared in skill frontmatter live long
   enough to replace the static `hooks.json` entries? (Optional; the flag-file
   design does not depend on it.)
5. **Saved-plan matrix.** With the candidate note in place, across manual,
   default and auto modes: several wordings of "execute this plan", discuss-only
   prompts ("summarize this plan"), a prompt naming two valid plans, and a
   plan-shaped file that is not a valid tierminator plan. Record whether the
   model launched `tierminator:execute-plan`, launched anything else, whether
   the permission prompt appeared, and whether it said it was using
   tierminator. Pass bar: no launch on discuss-only prompts, no double launch,
   and a launch on execute-intent prompts. Failing to launch falls back to an
   untiered run, which is the no-plugin baseline.
6. **Overlapping plans.** Does Claude Code already prevent two workflows
   running in a session? Is there a signal for workflow completion? Without a
   reliable completion signal we do not ship a "plan already running" guard.

**Exit:** each probe is recorded. Decide the saved-plan feature (Phase 3) and
the toggle mechanism (Phase 1) from the results.

### Phase 1: Arm and disarm

Independent of probes 5 and 6; depends on probes 1 to 3 for the mechanism.

- `lib/state.js`: an `armed` flag helper (read, set, clear), stored with the
  session state.
- Skills `tierminator`, `start`, `stop`, all `disable-model-invocation: true`.
  `start` and `tierminator` arm and print one line: "tierminator is on for this
  session; it applies in plan mode." `stop` disarms and clears any state that
  has not launched (`planning`, `approved`, `candidate`).
- A `UserPromptSubmit` path (in `h1`, or a new script) that writes or clears the
  flag from the command text, per the probe 1 to 3 results.
- `h6` removes the flag with the other session state on `SessionEnd`.
- Tests under `tests/tierminator/`: arm, disarm, unarmed no-ops.

### Phase 2: Gate every hook on the flag and the mode

- `h1` (both paths), `h2`, `h3`, `h4`, `h5`: return at once if unarmed.
- `h3` on an unarmed approval: remove any stale state, save nothing.
- `h1` `UserPromptSubmit`, not in plan mode, state `approved`: mark it
  `abandoned` and let the prompt through. A real user prompt proves the
  approval-to-launch window has closed (it all happens inside one turn), so a
  failed launch cannot block a later normal prompt.
- New plan-mode approval replaces `approved` and `abandoned` state.
- `execute-plan.js`: on empty args, return a clean message (also used by the
  several-plans case).
- Tests: every hook is a no-op unarmed; armed manual and auto prompts are
  untouched; the stuck-`approved` case clears on the next prompt.

### Phase 3: Saved-plan execution (contingent on probe 5)

- Extract `h3`'s "read plan, `parsePlan()`, save state" into a shared `lib/`
  function.
- `h1` `UserPromptSubmit`, armed, not in plan mode: find paths in the prompt
  (plain paths, `@` mentions, quoted paths, relative to the working directory).
  Keep the ones that are plan files and pass `parsePlan()` (not opted out).
  - One valid plan: save it as a `candidate` and add the note ("The user
    mentioned a tierminator plan at `<path>` (N tasks). If they are asking you
    to execute it, launch `tierminator:execute-plan` with no args; say
    'Running through tierminator'. Otherwise ignore this. Arming tierminator and
    asking for execution is the user's opt-in for the Workflow tool.").
  - Two or more: save all as candidates; the note says plans cannot run
    together, to ask which, and not to launch until the user chooses.
  - None valid: emit nothing.
  - A `json tiered-tasks` block that fails validation: one-line note that the
    run will be untiered. (Open question 1.)
- `h4`: accept a `candidate`. One candidate: fill the args from it. Several:
  fill nothing unless the launch args name one plan that is a stored candidate;
  otherwise the workflow returns its "several plans, ask which" message. Never
  set `permissionDecision`.
- `candidate` is ignored by `h5`, replaced by the next mention, cleared by
  `stop`, and pruned with other state.
- Tests: one, two, zero and invalid plans; membership check; a non-candidate
  path is rejected.

### Phase 4: Overlap guard (contingent on probe 6)

- If Claude Code already prevents overlapping workflows, document that and stop.
- Otherwise, if a completion signal exists, `h4` refuses a second launch while
  one runs. If neither, document the gap; do not ship a guard that misreads a
  finished run as running.

### Phase 5: Docs and evidence

- Plugin README: install, `/tierminator` and `:stop`, saved-plan execution, the
  limits (untiered fallbacks, manual-mode permission prompt).
- `docs/tierminator/` findings for every probe; evidence files committed with
  them.
- Reconcile `rules/tiering.md`, the root `CLAUDE.md` description and
  `marketplace.json` wording if they say "always on".

Commit and push after each successful phase, per the repo's `CLAUDE.md`.

## Risks

- **Saved-plan false positives.** The model may launch a plan the user only
  meant to discuss. Same misreading rate as without the plugin, but a costlier
  outcome. Manual mode still shows the Workflow permission prompt; auto mode
  does not. Probe 5 sets the bar.
- **Saved-plan false negatives.** The model may execute untiered. That is the
  no-plugin baseline. The "Running through tierminator" line lets the user tell.
- **Workflow tool guidance.** The tool tells the model to use it only on user
  opt-in. The note must say arming plus the request is the opt-in. Recorded
  post-approval runs show launches work; this entry point needs its own
  evidence.
- **Hook cost.** `hooks.json` is static, so every tool call still spawns Node
  in unarmed sessions. Keep the early exit minimal.

## Open questions

Design
1. When a plan has a `json tiered-tasks` block that fails validation, should
   the hook add a one-line "running untiered" note? (Leaning yes, since a typo
   would otherwise silently drop tiering.)
2. When the user picks among several plans, should the reply be allowed to be
   "the first one" (needs the `h4` membership check) or must it contain the
   path again (simpler, clumsier)? (Leaning membership check.)
3. `/tierminator:stop` during a running workflow: warn and let it finish, or
   refuse? (Leaning warn and let it finish.)

Behavior
4. Should `/clear` disarm? The session id changes, so it does under the current
   design. `--resume` keeps the flag. (Leaning yes, as is.)
5. Should a re-run of an already-executed plan get a confirmation? Nothing
   records "executed" in the plan file. (Leaning no: the user owns that.)

Scope
6. Bare `/tierminator` and `:start` as duplicate skills, or one hook regex
   covering both? Depends on probe 2.
7. Skill-scoped hooks instead of the static `hooks.json`: worth it only if
   probe 4 shows they last.
