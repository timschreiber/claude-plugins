# tierminator: rejecting a plan after its block was moved

Once a plan passes H2, its plan file no longer holds the task block: H2 has moved it to the tasks file
and left a table. This run checks what happens when you reject that plan and ask for a change to a task.
Claude has to write a complete new block. If it edits only the table, H2 denies it and asks for the block,
so that ends well too, one denial later. What must never happen is a dialog showing the changed task
while the old task runs.

The run passes if:
- the second approval dialog shows the changed T02 in the table;
- the workflow creates `farewell.txt`, not `bye.txt`.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-reject`, created by the setup. |
| The plugin under test | `plugins/tierminator` in this repo, loaded with `--plugin-dir`, with `TIERMINATOR_DEBUG=1`. |
| A logger that changes nothing | `probes/planandtier/probe-plugin`, loaded beside it with `PROBE_OBSERVE=1`. |

## Setup (about 1 minute)

Open a **new** PowerShell window, so that no variables are left over from earlier runs, and run this block:

```powershell
# 1. Clear old logs and state
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
Remove-Item "$HOME\.claude\plugins\data\tierminator-probe-inline\probe.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\tierminator-inline\sessions" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\tierminator-debug.log" -ErrorAction SilentlyContinue
Remove-Item Env:PROBE_DIALOG -ErrorAction SilentlyContinue

# 2. Make a throwaway repo
$dir = "$env:TEMP\tier-reject"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
'# Reject test' | Set-Content README.md
git add -A; git commit -qm init

# 3. Start Claude Code in plan mode with both plugins
$env:TIERMINATOR_DEBUG = '1'
$env:PROBE_OBSERVE = '1'
claude --permission-mode plan --plugin-dir "$repo\plugins\tierminator" --plugin-dir "$repo\probes\tierminator\probe-plugin"
```

## Steps in the session

1. **Send this prompt:**
   > Plan two tasks. T01: create hello.txt containing the single line `hello`. T02: create bye.txt containing the single line `bye`.

2. **At the first approval dialog,** check that it shows a task table. Then **reject the plan** (choose the
   option that keeps planning) and type this feedback:
   > Change T02: it should create farewell.txt containing the single line `farewell` instead of bye.txt, and its title should say farewell.

3. **Watch what Claude does,** without helping it. Note whether it is denied (a `PreToolUse:ExitPlanMode`
   hook error) before the next dialog appears.

4. **At the second approval dialog,** note what the T02 row says. Then **approve.** Auto mode is fine if
   offered; if not, approve the workflow review and any worker prompts.

5. **Wait for the workflow to finish**, then exit with `/exit`.

6. **Check the result** in the same PowerShell window:
   ```powershell
   Get-ChildItem $dir -Name
   ```

## Record

Save this as `probes/evidence/planandtier-reject-observations.json` (in `probes\evidence` at the repo
root), filling in each `null`:

```json
{
  "generated": "<ISO timestamp, UTC>",
  "claudeCodeVersion": "<claude --version>",
  "firstDialog": { "showedTable": null },
  "afterRejection": { "deniedBeforeSecondDialog": null, "notes": "" },
  "secondDialog": { "shownTable": null, "t02Row": "<the T02 row as shown>" },
  "run": { "allTasksFinished": null, "farewellTxtExists": null, "byeTxtExists": null },
  "notes": ""
}
```

Then copy the two logs next to it:

```powershell
Copy-Item "$HOME\.claude\plugins\data\tierminator-probe-inline\probe.log" `
  "$repo\probes\evidence\planandtier-reject-probe.log"
Copy-Item "$env:TEMP\tierminator-debug.log" "$repo\probes\evidence\planandtier-reject-debug.log"
```

Tell me when all three are in place. I'll read the transcript, the plan and its tasks file myself.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **The second dialog shows `farewell` but the run creates `bye.txt`:** that is the failure this run looks
  for. Note it and stop.
- **Claude is denied three times in a row:** the plan then goes through untiered. Note it and stop.
