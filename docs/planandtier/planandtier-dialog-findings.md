# planandtier: plan dialog and workflow launch findings

On 2026-09-27 two things went wrong with one tiered plan. The plan approval dialog withheld the first
version of the plan, and after the revised version was approved, the workflow launch was rejected. Two
probes, both on Claude Code 2.1.283 (Windows), measured why:

- **Launch shapes**, headless, four cells. Evidence: `probes/evidence/planandtier-launch-shapes-results.json`.
  Runner: `probes/planandtier/launch-shapes.js`.
- **Dialog shapes**, one interactive session, six plans. Evidence:
  `probes/evidence/planandtier-dialog-shapes-observations.json` (what the dialog showed) and
  `planandtier-dialog-shapes-probe.log` (what each hook received). Steps:
  `probes/planandtier/dialog-shapes-run.md`.

A third run then checked the plugin as changed in response: see
[the last section](#the-built-plugin-tasks-file-and-confirmed-launch).

## Result

| Question | Answer |
|---|---|
| What rejected the launch? | **A CRLF workflow script.** Multi-line prompts and non-ASCII prompts launch fine. |
| What makes the dialog withhold a plan? | **One long line.** Total size does not: a 21 KB plan with short lines was shown. |
| Can a hook shrink the plan before the dialog shows it? | **Yes.** The dialog reads the plan file after `PreToolUse` hooks have run. |
| Does the built plugin's tasks file work end to end? | **Yes.** A plan with a 5,781-character line was shown as a table, approved, and run from its tasks file. See [the last section](#the-built-plugin-tasks-file-and-confirmed-launch). |

## The launch rejection

Each cell ran the probe plugin's saved workflow with one task, varying one thing:

| Cell | `execute-plan.js` | Task prompt | Result |
|---|---|---|---|
| A | LF | one line | Ran; the task returned `done` |
| B | **CRLF** | one line | **Rejected** |
| C | LF | three lines | Ran; the task returned `done` |
| D | LF | an em dash | Ran; the task returned `done` |

Cell B's session reported:

> The permission handler returned updatedInput for Workflow that failed schema validation: [...]
> "path": ["script"], "message": "script contains control characters that would be hidden in the approval
> dialog"

So the check applies to the `script` field, which Claude Code fills with the saved workflow's text. The
carriage returns in a CRLF checkout of `execute-plan.js` fail it. In every cell the hook had returned
`updatedInput` for the call. Whether the same script is also rejected when no hook returns
`updatedInput` was not tested.

The cause in this repo was `core.autocrlf=true` with no `.gitattributes`, so `execute-plan.js` was
checked out with CRLF. `.gitattributes` now pins `plugins/planandtier/**` and `probes/planandtier/**` to
`eol=lf`.

## The dialog limit

Each shape was copied byte for byte into the plan file before `ExitPlanMode`. The probe measured each
plan when the call was made. The terminal was 152 columns wide (measured from the dialog's divider
line); its height was not recorded.

| Shape | Bytes | Lines | Longest line | Dialog |
|---|---|---|---|---|
| S1 | 21,335 | 305 | 70 | Shown |
| S5 | 14,229 | 99 | 150 | Shown |
| S2 | 2,948 | 8 | 2,900, inside a code fence | Shown |
| S3 | 4,548 | 8 | 4,500, inside a code fence | Withheld |
| S4 | 4,536 | 6 | 4,500, no fence | Withheld |

A withheld plan shows only the heading and this line, and cannot be approved:

> (the plan is too large to be shown in full — approval is withheld; send feedback asking for a shorter
> plan, or press Esc)

- **One long line triggers it.** S3 and S4 are about a fifth of S1's size.
- **A code fence makes no difference** (S3 against S4).
- **The limit lies between 2,900 and 4,500 characters on one line** at 152 columns.
- **Whether the limit is in characters or in wrapped rows is not known.** A 4,500-character line wraps to
  about 30 rows at 152 columns. If the limit is in rows, a narrower window lowers it.
- For S1 you noted that the dialog first said it could not show the plan, then showed it. The probe
  log records a single `ExitPlanMode` call for S1, so this happened within one dialog. It was not
  seen again.

## A hook can shrink the plan

S6 is S3 with the long block between marker comments. In dialog mode the probe's `PreToolUse` hook moved
that block to a side file and wrote one replacement line into the plan file in its place.

- **The dialog showed the replacement line**, not the long block, and so it was not withheld.
- **The hooks' `tool_input.plan` still held the original text.** Both the `PreToolUse` and
  `PermissionRequest` hooks received the full 4,614-character plan, long line included.

So the dialog re-reads the plan file after `PreToolUse` hooks run, and `tool_input.plan` is a snapshot
taken when the call was made. This is what lets planandtier keep long task prompts in a side file and show
a short table for approval.

## The built plugin: tasks file and confirmed launch

planandtier was then changed. H2 moves every valid task block to a tasks file and leaves a table, and a launch
is recorded only when `PostToolUse` confirms it. One interactive session ran the result on Claude Code
2.1.283, in manual permission mode, following `planandtier-sidecar-run.md`. Evidence, all under
`probes/evidence/`:
- `planandtier-sidecar-observations.json`: what you saw;
- `planandtier-sidecar-probe.log`: every hook input;
- `planandtier-sidecar-debug.log`: every state change;
- `planandtier-sidecar-plan.md` and `planandtier-sidecar-plan.tasks.json`: the approved plan and its tasks
  file.

The session transcript is the source for what Claude did.

| Check | Result |
|---|---|
| The plan Claude wrote | 7,622 bytes, 43 lines, longest line 5,781 characters (T01's prompt, which embeds a 5,000-character text). The dialog-shape results say a plan like this is withheld. |
| After H2 | The plan file was 1,529 bytes, longest line 116, with the task table in place of the block. The tasks file held the block, and its sha256 prefix matches the table's (`899932a0de2b3a06`). |
| Approval dialog | **Shown**, with the table. The tasks file held T01's long prompt. |
| What H3 received | `tool_response.plan` was the **shortened** text (1,523 characters, table and no block), with `tool_response.filePath` set to the plan file. `tool_input` held no plan text. |
| Tasks run | Both, from the tasks file. The workflow's `args` held the two tasks. The workers ran at `medium` and `low`, matching their `sonnet` / `medium` and `sonnet` / `low` tags. The result was `complete`, and `notes.md` matched the original text byte for byte. |
| Phases | `approved` at approval, `launched` at 02:59:29, which is when the second `Workflow` call started, then `removed` at session end. Nothing in between. |

### Declining the workflow review

You declined the first "Review dynamic workflow before running" prompt.

- **Claude Code treated the decline as a user interrupt.** The transcript records `[Request interrupted by
  user for tool use]`, and Claude stopped.
- **No hook ran at that turn's end.** The transcript's `stop_hook_summary` records appear only after later
  turns, so H5's `stop` mode never got to ask for a relaunch.
- **No event followed the declined call.** The probe log has a `PreToolUse` record for it and nothing
  after it.
- **The state stayed `approved`** until you asked Claude to present the workflow again. That second call
  launched, and `PostToolUse` marked it `launched`.

So a decline leaves the plan approved with the guard on. Claude does not retry, and it waits for the user,
which is the intended result. The earlier expectation that H5 would make Claude offer the launch once more
was wrong.

## Not measured

- The exact limit, and whether it depends on the terminal size.
- Whether a launch rejected after H4 (the CRLF case) fires `PostToolUseFailure`. Either way the state now
  stays `approved`, because only a confirmed launch marks it `launched`.
