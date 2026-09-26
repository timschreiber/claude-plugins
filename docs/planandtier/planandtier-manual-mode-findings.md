# planandtier without auto mode: findings

The end-to-end run (`planandtier-e2e-findings.md`) used auto mode. This covers the same plugin with
manual permissions, on Claude Code 2.1.283 (Windows). Two sources:

- **Headless, default mode**, with no one to approve anything. Evidence:
  `probes/evidence/planandtier-default-mode-headless-results.json`.
- **Interactive**, one session: plan mode, then approved with manual permissions. Evidence:
  `probes/evidence/planandtier-manual-mode-results.json`, built from the probe log, the workflow
  record, each worker's transcript and its meta file. The steps are in
  `planandtier-manual-mode-run.md`.

## Result

The plan-approve-run flow works with manual permissions. Nothing about the plugin needs auto mode.

| Check | Result |
|---|---|
| Workflow launched by the model, nothing typed | **Yes.** After approval the session was in `default` mode, and the model's next step was the `Workflow` call. |
| Tasks supplied by H4 | **Yes.** The workflow's `args` held the 3 approved tasks. |
| Every task completed | **Yes.** `complete`, 3 of 3 `done`, with a recorded duration of about 39 seconds. |
| Effort matched the tag | **Yes.** `SubagentStop` recorded `low, low, low` for `sonnet/low`, `sonnet/low`, `opus/low`. |
| Model matched the tag | **Yes.** Each worker's own transcript shows `claude-sonnet-5` for T01 and T02 and `claude-opus-5-5` for T03. |
| The workers' output | Correct: `hello.txt`, `add.js` and `add.test.js` (3 of 3 pass) and `summary.txt`. |

This also closes the gap the auto-mode run left: it is the first run with an Opus task, and the model
is confirmed from the record rather than from the worker's own report.

## What manual permissions add

- **The workflow launch is gated.** In default mode the `Workflow` call stops at a review prompt
  ("Review dynamic workflow before running"). In the headless run there was no one to answer it, so the
  workflow never started, and no `PostToolUse` or `PostToolUseFailure` event fired. In the interactive
  run you approved it and the run went ahead. The gate is separate from the model's decision to launch, so
  the hand-off still works, with one extra click per launch.
- **Workers can ask you for permission.** Every worker request was interactive
  (`requestNonInteractive: false`), and you report getting the worker prompts and approving them. Each
  worker made one Bash call, so about one prompt per task is likely, but that is an inference: approvals
  are not written to any record, and you did not count them.
- **Without a person to approve, a worker fails cleanly.** In the headless run with the launch gate allowed
  and no one to grant write access, the first worker reported `failed` with the reason. The workflow
  halted at T01, and T02 never ran. It did not hang.

## Not recovered

Three details were not captured, and the records cannot supply them:

1. The wording and choices on the review dialog. The design notes say plugin workflows are offered a
   "don't ask again" choice, but that was not seen in this run.
2. Whether the dialog shows the tasks the hook injected, or only the call as the model made it. This
   matters because it decides whether you can see what will run before you approve it.
3. What declining the dialog does. From the code, H4 has already marked the launch by then and no
   failure event follows, so the state would stay `launched` and a later `/planandtier:execute-plan` would
   still work. This has not been run.

An optional short check would settle 1 to 3. It needs only a session with a pre-written approved state,
so it costs no tasks: start Claude in default mode, type `/planandtier:execute-plan`, read the dialog, and
decline it.
