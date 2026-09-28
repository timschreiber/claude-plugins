# planandtier: end-to-end run of `/planandtier:execute-plan`

`/planandtier:execute-plan` runs a saved plan in a session other than the one that planned it. This run
checks it in real interactive sessions, with planandtier installed from the marketplace:

- **Part A** plans three tasks and leaves without approving.
- **Part B** starts a new session, lists the saved plans with no path, then runs the plan by its path.
- **Part C** rolls the branch back to just after T01 and runs the plan again in a new session. It should
  skip T01.
- **Part D** runs a plain plan, which Claude should implement without planandtier.

The run passes if:
- the no-path listing shows the plan from Part A;
- in Part B, with nothing else typed, T01 to T03 each commit with `Planandtier-Task:` and
  `Planandtier-Plan:` lines carrying the same plan id;
- in Part C, Claude says T01 is not run again, and only T02 and T03 run;
- in Part D, Claude implements the plain plan itself, with no Agent dispatches.

## Install or update the plugin (once per push)

```powershell
claude plugin marketplace update timschreiber
claude plugin install planandtier@timschreiber   # the first time
claude plugin update planandtier@timschreiber    # after later pushes
claude plugin list                               # planandtier@timschreiber, enabled
```

Do not also load `plugins/planandtier` with `--plugin-dir`: the installed copy's hooks would run as well.

## Setup (about 1 minute)

Open a **new** PowerShell window and run this block. It keeps its variables for all four parts, so use the
same window throughout.

```powershell
# 1. Clear old logs and state
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$env:PROBE_LOG = "$env:TEMP\planandtier-execute-probe.log"
Remove-Item $env:PROBE_LOG -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\planandtier-debug.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\planandtier*\sessions" -Recurse -Force -ErrorAction SilentlyContinue

# 2. Note these for the record
claude --version

# 3. A new throwaway repo with one commit, with claude-plugins' Git identity copied in (there is no
#    global one on this machine).
Set-Location $env:TEMP
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$dir = "$env:TEMP\tier-execute-$stamp"
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
git config user.name (git -C $repo config user.name)
git config user.email (git -C $repo config user.email)
"# Greeter`n`nStatus: draft" | Set-Content README.md
git add -A
git -c commit.gpgsign=false commit -m init

# 4. Debug logging, and the optional probe logger
$env:PLANANDTIER_DEBUG = '1'
$env:PROBE_OBSERVE = '1'
$probe = "--plugin-dir", "$repo\probes\planandtier\agent-probe-plugin"
if ((git rev-parse --verify -q HEAD) -and -not (git status --porcelain)) { 'Ready.' } else { Write-Host 'Not ready: check the git output above.' -ForegroundColor Red }
```

## Part A: plan, and leave without approving

1. Start Claude Code in plan mode:
   ```powershell
   claude --permission-mode plan @probe
   ```
2. Type `/planandtier:arm`. Claude should confirm in one line that planandtier is armed.
3. Send this prompt:
   > Plan three tasks. T01: in README.md, replace the line `Status: draft` with `Status: ready`; make it a sonnet/low find-and-replace task. T02: create greet.js exporting greet(name), which returns "Hello, " + name + "!". T03: add greet.test.js with node:test cases for greet("Ada") and greet(""), verified by `node --test`.
4. At the approval dialog, check that it shows the task table, then press **Esc** (do not approve), and type
   `/exit`.

## Part B: list the saved plans, then run one

1. Start a new session, **not** in plan mode:
   ```powershell
   claude @probe
   ```
   If you use auto mode, add `--permission-mode auto`. Otherwise, approve the workers' permission prompts
   as they come.
2. Type `/planandtier:execute-plan` with no path. Claude should list recent planandtier plans with the one
   from Part A at the top (its title, 3 tasks and a time), and ask which to run. Don't answer in words.
3. Type `/planandtier:execute-plan <the plan's path from the list>`. Claude should say the session is now
   armed and dispatch T01. **Type nothing else.** T01, T02 and T03 should run in turn, as after an approval.
4. When Claude says the run is complete, type `/exit`, and check in the PowerShell window:
   ```powershell
   git log --format="%h %s%n%b" -4
   ```
   Every task commit should have both lines, with the same `Planandtier-Plan:` id.

## Part C: pick the plan up after T01

1. Roll the branch back to just after T01, keeping T01's commit:
   ```powershell
   git reset --hard HEAD~2
   git log --oneline -3
   ```
2. Start a new session (`claude @probe`, plus auto mode if you use it), and type
   `/planandtier:execute-plan <the same plan path>`.
   Claude should say that T01 (with its commit, as "earlier run") is not run again, and dispatch **T02**.
   Type nothing else until it says the run is complete.
3. Type `/exit`, then check `git log --format="%h %s%n%b" -4` again: T01's commit is the one from Part B,
   followed by new T02 and T03 commits.

## Part D: a plain plan runs without planandtier

1. Write a plain plan outside the repo:
   ```powershell
   $plain = "$env:TEMP\plain-plan-$stamp.md"
   "# Add a license line`n`nAppend the line ``License: MIT`` to the end of README.md." | Set-Content $plain
   $plain
   ```
2. Start a new session (`claude @probe`) and type `/planandtier:execute-plan <the $plain path>`.
   Claude should say the plan is not a tiered planandtier plan and edit README.md itself, with no Agent
   dispatches. Approve the edit if asked, then `/exit`.

## Record

Save this as `probes/evidence/planandtier-execute-plan-<stamp>-observations.json` (in `probes\evidence` at
the repo root), where `<stamp>` is `$stamp`. For each `null`, `true` or `false` is enough; if you don't
know, leave `null` and say so in `notes`.

```json
{
  "generated": "<ISO timestamp, UTC>",
  "claudeCodeVersion": "<claude --version>",
  "partA": { "armed": null, "dialogShowedTable": null, "leftWithoutApproving": null },
  "partB": { "listingShowedPlan": null, "listingText": "", "runStartedWithNothingTyped": null, "allThreeCommitted": null, "commitsHavePlanLine": null, "planId": "" },
  "partC": { "saidT01NotRunAgain": null, "firstDispatchWasT02": null, "t02AndT03Committed": null },
  "partD": { "saidNotTiered": null, "claudeEditedItself": null, "noAgentDispatch": null },
  "permissionMode": "",
  "notes": ""
}
```

Then copy the two logs next to it, from the same window:

```powershell
Copy-Item $env:PROBE_LOG "$repo\probes\evidence\planandtier-execute-plan-$stamp-probe.log"
Copy-Item "$env:TEMP\planandtier-debug.log" "$repo\probes\evidence\planandtier-execute-plan-$stamp-debug.log"
```

Tell me when all three are in place. I'll read the transcripts, the plan, its tasks file and the throwaway
repo myself. Please don't delete them until I have.

## If something goes wrong

- **`/planandtier:execute-plan` is unknown, or Claude says planandtier did not respond:** the installed
  plugin is missing or out of date. Exit and run the install block again.
- **The listing is empty:** note it. Then type the command with the plan's path. It is the newest `.md`
  file in `$HOME\.claude\plans`.
- **Claude refuses to run the plan:** keep its exact words; the refusal names the reason.
- **Claude does a task itself instead of dispatching, or dispatches in Part D:** stop and tell me.
