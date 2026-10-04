# tierminator: tasks-file and launch-state run

Checks the two changes made after `tierminator-dialog-findings.md`, in a real interactive session:

1. **The tasks file.** H2 moves the task block to `<plan>.tasks.json` and leaves a table, so a plan
   whose block has a line of more than 4,500 characters is shown in the approval dialog. Without the
   move, the dialog withholds it.
2. **The confirmed launch.** The state becomes `launched` only when the workflow starts. Declining the
   workflow review leaves it `approved`, so the guard is still on.

It also records the one fact the dialog probe could not: what `PostToolUse` receives in
`tool_response.plan` after a shortened plan is approved.

The run passes if:
- the approval dialog shows the plan, with the task table and no "too large" message;
- after approval, both tasks run from the tasks file and finish;
- after you decline the first workflow review, the debug log shows no `phase=launched` until the
  launch you approve.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-sidecar`, created by the setup. Not claude-plugins: the workers create and edit files. |
| The plugin under test | `plugins/tierminator` in this repo, loaded with `--plugin-dir`, with `TIERMINATOR_DEBUG=1` so every state change is logged. |
| A logger that changes nothing | `probes/planandtier/probe-plugin`, loaded beside it with `PROBE_OBSERVE=1`. It records what each hook receives. |

## Setup (about 1 minute)

Open PowerShell anywhere and run this block. It clears old logs and state, creates the throwaway repo
with a 5,000-character one-line text file, and starts Claude in plan mode.

```powershell
# 1. Clear old logs and state so the results are clean
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
Remove-Item "$HOME\.claude\plugins\data\tierminator-probe-inline\probe.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\tierminator-inline\sessions" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\tierminator-debug.log" -ErrorAction SilentlyContinue

# 2. Note these for the record
claude --version
$Host.UI.RawUI.WindowSize

# 3. Make a throwaway repo with a long one-line file
$dir = "$env:TEMP\tier-sidecar"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
'# Sidecar test' | Set-Content README.md
$words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa '
($words * 60).Substring(0, 5000).Trim() | Set-Content -NoNewline quote.txt
git add -A; git commit -qm init

# 4. Start Claude Code in plan mode with both plugins
$env:TIERMINATOR_DEBUG = '1'
$env:PROBE_OBSERVE = '1'
claude --permission-mode plan --plugin-dir "$repo\plugins\tierminator" --plugin-dir "$repo\probes\tierminator\probe-plugin"
```

If it asks whether you trust the folder, say yes.

## Steps in the session

1. **Send this prompt:**
   > Plan two tasks. T01: create notes.md whose content is exactly the text of quote.txt. T01's prompt must contain the full text of quote.txt verbatim, on one line, not a reference to the file: do not shorten, wrap or summarize it. T02: change the README heading line to `# Sidecar test (see notes.md)`.

2. **Look at the approval dialog.** Note:
   - whether it shows the plan, or says the plan is too large to be shown in full;
   - whether the plan has a table of the tasks with a `Tasks file:` line above it, instead of a
     `json tiered-tasks` block;
   - the tasks file's path. Open it in an editor and check that T01's prompt holds the long text.

3. **Approve without auto mode.** Choose the option that approves the plan but keeps asking for
   permission (not auto mode), so the workflow review prompt appears.

4. **Decline the first workflow review.** When "Review dynamic workflow before running" appears, decline
   it. Note what Claude does next: does it try to launch again, stop, or do the work itself?

5. **Approve the next workflow review.** If Claude offers the launch again, approve it this time. If it
   does not, type `/tierminator:execute-plan` and approve that review. Approve any permission prompts from
   the workers.

6. **Wait for the workflow to finish** (watch `/workflows`). Then exit with `/exit`.

## Record

Save this as `probes/evidence/planandtier-sidecar-observations.json`, filling in each `null` and the
notes:

```json
{
  "generated": "<ISO timestamp>",
  "claudeCodeVersion": "<claude --version>",
  "terminal": { "columns": 0, "rows": 0 },
  "dialog": { "shown": null, "showedTable": null, "tasksFileHadLongPrompt": null },
  "firstReviewDeclined": { "claudeRelaunched": null, "claudeDidWorkItself": null, "notes": "" },
  "run": { "launchedAfterSecondReview": null, "allTasksFinished": null, "notes": "" },
  "notes": ""
}
```

Then copy the two logs next to it:

```powershell
Copy-Item "$HOME\.claude\plugins\data\tierminator-probe-inline\probe.log" `
  "$repo\probes\evidence\planandtier-sidecar-probe.log"
Copy-Item "$env:TEMP\tierminator-debug.log" "$repo\probes\evidence\planandtier-sidecar-debug.log"
```

Tell me when all three are in place. I'll read the rest myself: the plan and tasks files, what H3
received, the phase changes, and what the workers wrote in `%TEMP%\tier-sidecar`. Please don't delete
those until I've read them.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **The dialog says the plan is too large:** note it, press Esc, and stop. The debug log says whether H2
  could not move the block.
- **Claude shortens or wraps the text in T01's prompt:** ask it to put the full text back verbatim. The
  run needs one very long line.
- **The plan is denied more than once:** that is the plugin's check working. Let Claude fix the plan.
- **After approval Claude does the work itself instead of launching:** stop and tell me. Note whether it
  was blocked.
