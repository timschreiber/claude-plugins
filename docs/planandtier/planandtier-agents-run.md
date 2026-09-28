# planandtier: end-to-end run of the agent dispatch

planandtier no longer runs tasks in a workflow. Each task is dispatched with the Agent tool to the agent
for its tier (`planandtier:<model>-<effort>`), commits its own work, and is reset and retried a tier up
if it fails. This run checks the whole thing in a real interactive session, including the case the
workflow could not handle: a task changed through the approval dialog's feedback.

It uses planandtier **installed from the marketplace**, in a plain `claude` session, armed with
`/planandtier:arm`. So the session does not depend on how Claude was launched.

The run passes if:
- `/planandtier:arm` is confirmed in one line;
- the approval dialog shows the plan with its task table;
- after you reject the plan with feedback that contradicts your prompt, the revised plan uses your change;
- after approval, with nothing typed, every task runs and finishes;
- each task is one commit with a `Planandtier-Task:` trailer, and T01 ran on `sonnet-low`;
- the finished code uses your change, not your original prompt;
- a `planandtier: T0x on <tier> …` spend line appears after each task, and one spend summary when the run
  completes;
- `<plan>.telemetry.jsonl` sits beside the plan, with `planning`, `attempt` and `orchestration` records.

## Where things run

| What | Where |
|---|---|
| The session | A **new throwaway repo** at `%TEMP%\tier-agents-<date-time>`, created by the setup for each run. The workers commit there. Old ones can be deleted by hand once no session is using them. |
| The plugin under test | `planandtier@timschreiber`, installed from the marketplace (the pushed `main`), with `PLANANDTIER_DEBUG=1` so every state change is logged. |
| A logger that changes nothing (optional) | `probes/planandtier/agent-probe-plugin`, loaded with `--plugin-dir` and `PROBE_OBSERVE=1`. It records every Agent call, report and prompt. |

Do not also load `plugins/planandtier` with `--plugin-dir`: the installed copy's hooks would run as well.

## Install or update the plugin (once per push)

```powershell
claude plugin marketplace update timschreiber
claude plugin install planandtier@timschreiber   # the first time
claude plugin update planandtier@timschreiber    # after later pushes
claude plugin list                               # planandtier@timschreiber, enabled
```

## Setup (about 1 minute)

Open a **new** PowerShell window and run this block:

```powershell
# 1. Clear old logs and state
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$env:PROBE_LOG = "$env:TEMP\planandtier-agents-probe.log"
Remove-Item $env:PROBE_LOG -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\planandtier-debug.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\planandtier*\sessions" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item Env:PROBE_DIALOG -ErrorAction SilentlyContinue

# 2. Note these for the record
claude --version
$Host.UI.RawUI.WindowSize

# 3. Make a new throwaway repo with one commit. Each run gets its own folder, so nothing has to be
#    deleted: Windows won't remove a folder that this window or an old Claude session is still in.
Set-Location $env:TEMP
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$dir = "$env:TEMP\tier-agents-$stamp"
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
# There is no global Git identity on this machine, only claude-plugins' own, so copy it in: without it
# the setup's commit and every worker's commit fail with "Author identity unknown".
git config user.name (git -C $repo config user.name)
git config user.email (git -C $repo config user.email)
"# Greeter`n`nStatus: draft" | Set-Content README.md
git add -A
git -c commit.gpgsign=false commit -m init

# 4. Start Claude Code in plan mode, with the probe logger, but only if the README is committed and the
#    tree is clean: planandtier refuses a tiered plan otherwise.
$env:PLANANDTIER_DEBUG = '1'
$env:PROBE_OBSERVE = '1'
if ((git rev-parse --verify -q HEAD) -and -not (git status --porcelain)) {
  claude --permission-mode plan --plugin-dir "$repo\probes\planandtier\agent-probe-plugin"
} else {
  Write-Host 'Not started: the throwaway repo has no commit or has uncommitted changes. Check the git output above.' -ForegroundColor Red
}
```

If it asks whether you trust the folder, say yes. If Claude doesn't start, read the red line and the Git error
above it, fix that, and run the `if` block again. Without the logger, plain `claude --permission-mode plan`
works too; the probe log is then missing from the record.

## Steps in the session

0. **Arm the session: type `/planandtier:arm`.** Claude should answer in one line that planandtier is
   armed for this session. If it says planandtier did not respond, or the command is unknown, the plugin is
   not installed or enabled: exit and check `claude plugin list`.

1. **Send this prompt:**
   > Plan three tasks. T01: in README.md, replace the line `Status: draft` with `Status: ready`; make it a sonnet/low find-and-replace task. T02: create greet.js exporting greet(name), which returns "Hello, " + name + "!". T03: add greet.test.js with node:test cases for greet("Ada") and greet(""), verified by `node --test`.

2. **At the first approval dialog,** check that it shows a task table with a `Tasks file:` line. If it
   shows a plain plan with no table, planandtier is not armed or not loaded: press Esc and stop. Otherwise choose **"Tell
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

Save this as `probes/evidence/planandtier-agents-<stamp>-observations.json` (in `probes\evidence` at the
repo root), where `<stamp>` is the date-time in the throwaway folder's name (`$stamp` in the setup window).
For each `null`, `true` or `false` is enough; if you don't know, leave `null` and say so in `notes`.

```json
{
  "generated": "<ISO timestamp, UTC>",
  "claudeCodeVersion": "<claude --version>",
  "terminal": { "columns": 0, "rows": 0 },
  "arm": { "confirmedArmed": null, "reply": "" },
  "firstDialog": { "showedTable": null },
  "secondDialog": { "showedTable": null, "saidHowdy": null },
  "afterApproval": { "typedNothing": null, "nextTaskStartedByItself": null, "permissionPrompts": null, "notes": "" },
  "result": { "runCompleted": null, "commitsWithTrailers": null, "greetSaysHowdy": null, "testsPass": null },
  "spend": { "lineAfterEachTask": null, "summaryAtEnd": null, "summaryText": "", "telemetryFileBesidePlan": null },
  "notes": ""
}
```

Then copy the two logs next to it, from the same window:

```powershell
Copy-Item $env:PROBE_LOG "$repo\probes\evidence\planandtier-agents-$stamp-probe.log"
Copy-Item "$env:TEMP\planandtier-debug.log" "$repo\probes\evidence\planandtier-agents-$stamp-debug.log"
Get-ChildItem "$HOME\.claude\plans\*.telemetry.jsonl" | Sort-Object LastWriteTime | Select-Object -Last 1 |
  Copy-Item -Destination "$repo\probes\evidence\planandtier-agents-$stamp-telemetry.jsonl"
```

Tell me when all four are in place. I'll read the transcript, the plan, its tasks file and the throwaway
repo myself. Please don't delete them until I have.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **`/planandtier:arm` is unknown, or Claude says planandtier did not respond:** the installed plugin is
  missing or disabled. Exit and run the install block again.
- **`ExitPlanMode` is denied because of the working tree or the Git identity:** the setup's commit or its
  `git config` lines did not happen. Stop and tell me.
- **A dispatch is refused:** that is H4 checking the call. Let Claude make the call the refusal gives.
- **The run stops at a task:** note Claude's report (task, tiers tried, reason), leave the repo as it is,
  and continue with the record.
- **Claude does a task itself instead of dispatching:** stop and tell me. Note whether it was blocked.
