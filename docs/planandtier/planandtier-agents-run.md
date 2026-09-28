# planandtier: end-to-end run of the agent dispatch

planandtier no longer runs tasks in a workflow. Each task is dispatched with the Agent tool to the agent
for its tier (`planandtier:<model>-<effort>`), commits its own work, and is reset and retried a tier up
if it fails. This run checks the whole thing in a real interactive session, including the case the
workflow could not handle: a task changed through the approval dialog's feedback.

The run passes if:
- the approval dialog shows the plan with its task table;
- after you reject the plan with feedback that contradicts your prompt, the revised plan uses your change;
- after approval, with nothing typed, every task runs and finishes;
- each task is one commit with a `Planandtier-Task:` trailer, and T01 ran on `sonnet-low`;
- the finished code uses your change, not your original prompt.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-agents`, created by the setup. The workers commit there. |
| The plugin under test | `plugins/planandtier` in this repo, loaded with `--plugin-dir`, with `PLANANDTIER_DEBUG=1` so every state change is logged. |
| A logger that changes nothing | `probes/planandtier/agent-probe-plugin`, loaded beside it with `PROBE_OBSERVE=1`. It records every Agent call, report and prompt. |

## Setup (about 1 minute)

Open a **new** PowerShell window and run this block:

```powershell
# 1. Clear old logs and state
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$env:PROBE_LOG = "$env:TEMP\planandtier-agents-probe.log"
Remove-Item $env:PROBE_LOG -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\planandtier-debug.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\planandtier-inline\sessions" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item Env:PROBE_DIALOG -ErrorAction SilentlyContinue

# 2. Note these for the record
claude --version
$Host.UI.RawUI.WindowSize

# 3. Make a throwaway repo with one commit
$dir = "$env:TEMP\tier-agents"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $dir) { throw "Could not remove $dir. Exit any Claude session still running there, then run this block again." }
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
"# Greeter`n`nStatus: draft" | Set-Content README.md
git add -A; git commit -qm init
git log --oneline -1   # must print one commit, "init"; if it doesn't, stop and tell me
git status --short     # must print nothing

# 4. Start Claude Code in plan mode with both plugins
$env:PLANANDTIER_DEBUG = '1'
$env:PROBE_OBSERVE = '1'
claude --permission-mode plan --plugin-dir "$repo\plugins\planandtier" --plugin-dir "$repo\probes\planandtier\agent-probe-plugin"
```

If it asks whether you trust the folder, say yes. Always start the session with this exact `claude` line: a
session started without the two `--plugin-dir` flags plans without planandtier.

## Steps in the session

1. **Send this prompt:**
   > Plan three tasks. T01: in README.md, replace the line `Status: draft` with `Status: ready`; make it a sonnet/low find-and-replace task. T02: create greet.js exporting greet(name), which returns "Hello, " + name + "!". T03: add greet.test.js with node:test cases for greet("Ada") and greet(""), verified by `node --test`.

2. **At the first approval dialog,** check that it shows a task table with a `Tasks file:` line. If it
   shows a plain plan with no table, planandtier is not loaded: press Esc and stop. Otherwise choose **"Tell
   Claude what to change"** and type this feedback:
   > Change the greeting: greet should return "Howdy, " + name + "!" instead of "Hello".

3. **At the second approval dialog,** check that the plan now says "Howdy" for both T02 and T03 (the tests
   must expect "Howdy, Ada!"). Then **approve**, choosing auto mode if it is offered.

4. **Type nothing.** Each task runs in the background: Claude dispatches it and ends its turn, and when the
   worker's report comes back, Claude dispatches the next one by itself. Expect T01, T02 and T03 in turn,
   with a pause while each runs. Approve any permission prompts if you are not in auto mode. If Claude stops
   between tasks and nothing happens for a minute, note it and type `continue`.

5. **When Claude says the run is complete,** exit with `/exit`.

6. **Check the result** in the same PowerShell window:
   ```powershell
   git log --format="%h %s%n%b" -4
   Get-Content greet.js
   node --test
   ```

## Record

Save this as `probes/evidence/planandtier-agents-observations.json` (in `probes\evidence` at the repo root).
For each `null`, `true` or `false` is enough; if you don't know, leave `null` and say so in `notes`.

```json
{
  "generated": "<ISO timestamp, UTC>",
  "claudeCodeVersion": "<claude --version>",
  "terminal": { "columns": 0, "rows": 0 },
  "firstDialog": { "showedTable": null },
  "secondDialog": { "showedTable": null, "saidHowdy": null },
  "afterApproval": { "typedNothing": null, "nextTaskStartedByItself": null, "permissionPrompts": null, "notes": "" },
  "result": { "runCompleted": null, "commitsWithTrailers": null, "greetSaysHowdy": null, "testsPass": null },
  "notes": ""
}
```

Then copy the two logs next to it:

```powershell
Copy-Item $env:PROBE_LOG "$repo\probes\evidence\planandtier-agents-probe.log"
Copy-Item "$env:TEMP\planandtier-debug.log" "$repo\probes\evidence\planandtier-agents-debug.log"
```

Tell me when all three are in place. I'll read the transcript, the plan, its tasks file and the throwaway
repo myself. Please don't delete them until I have.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **`ExitPlanMode` is denied because of the working tree:** the setup's commit did not happen. Stop and tell
  me.
- **A dispatch is refused:** that is H4 checking the call. Let Claude make the call the refusal gives.
- **The run stops at a task:** note Claude's report (task, tiers tried, reason), leave the repo as it is,
  and continue with the record.
- **Claude does a task itself instead of dispatching:** stop and tell me. Note whether it was blocked.
