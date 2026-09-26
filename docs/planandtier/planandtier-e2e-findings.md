# planandtier end-to-end findings

One interactive session with the built plugin (`plugins/planandtier`) and the observe-only probe,
on Claude Code 2.1.283 (Windows): plan mode, one deliberate rejection, approval in auto mode, nothing
typed after approval, then a typed `/planandtier:execute-plan`. Evidence:
`probes/evidence/planandtier-e2e-results.json`, built from the probe log, the workflow run records and
the session transcript. The steps are in `planandtier-e2e-run.md`.

## Result

The spec's exit criteria are met, with one caveat about tier variety.

| Criterion | Result |
|---|---|
| A real plan of at least 3 tasks across 2 tiers goes from plan mode to completed execution | **Met.** 4 tasks: sonnet/low, sonnet/medium, sonnet/medium, sonnet/low. Both runs returned `complete`. |
| No typed commands after approval | **Met.** The workflow launched by itself in auto mode. |
| Each task ran at its tagged model and effort | **Efforts met.** The `SubagentStop` effort matched the tag for all 8 worker runs (`low, medium, medium, low`, twice). |

Caveat: the two tiers were two efforts of one model. No Opus task was planned, so this run adds no Opus
evidence beyond the earlier pairs test (`planandtier-spike-findings.md`). The models were not read from
the records this time.

The workers' output is correct: the generated todo tool has a `.gitignore`, `todo.js`, `todo.test.js`
and a README, and `node --test` passes 9 of 9.

## What each part did

- **H1 and H2.** The rules reached the model in plan mode, and the model produced a task block. H2
  denied the first `ExitPlanMode` because `T01.prompt` had no `Verify:` step. The model read the reason,
  edited the plan file and called `ExitPlanMode` again. That is the loop the design relies on, and it
  worked once with no special prompting.
- **Rejection.** The user rejected the plan and typed a change. `PostToolUse` for `ExitPlanMode` fired
  once, for the approval only, so a rejected plan does not trigger H3. The model revised the plan
  and offered it again.
- **H3 and the launch.** After approval, the model's first action was the `Workflow` call for
  `planandtier:execute-plan`, with no other tool call before it. That is a second interactive run of
  P8 passing, this time with the real hook text and in auto mode.
- **H4.** The model sent only `{"name": "planandtier:execute-plan"}`. The workflow record shows the 4
  approved tasks as its `args`.
- **Relaunch.** A typed `/planandtier:execute-plan` goes through the `Workflow` tool, so the
  hook fired and supplied the same 4 tasks. The model noted the work was already done and ran it anyway,
  because it was asked to. The relaunch design (tasks kept until the session ends) works for the
  typed command as well as for a model-initiated launch.

## Open item: the "no tasks" message

The maintainer saw a message about not having any tasks after approving the plan, and the run then
proceeded. It is not in the transcript, either workflow's result, or the hook records. Both runs
received all 4 tasks, and the workflow's own error text ("No tasks were supplied") was never returned.

One possible cause, not confirmed: the `Workflow` tool call is shown as the model made it, without
`args`, before H4 rewrites it, so a display that reports "no args" or "no tasks" would appear even
though the tasks arrive. Nothing in the records tests that. If the exact wording can be recovered,
that would settle it. It cost nothing here, but a message like that could make a user think the run is
broken.

## Also observed

- The `SubagentStop` records include four with no `agent_type`, at the session's `high` effort, in
  addition to the 8 worker stops. As in the spike, anything reading them must filter on `agent_type`.
- After the session ended, the state file was gone: H6's `SessionEnd` deletion ran.
