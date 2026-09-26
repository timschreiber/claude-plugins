# planandtier spike: interactive run (P2, P3, P8)

The headless probes answered P1 and P4–P7 (see `planandtier-spike-findings.md`). Three
probes need one interactive plan-and-approve session, because headless (`claude -p`) sessions
have no `ExitPlanMode` tool:

- **P2:** do the `ExitPlanMode` hooks fire, and does a deny make the model revise the plan?
- **P3:** does the first response after approval see the hook's `additionalContext`?
- **P8:** does the model launch the saved workflow on that injected instruction alone?

Your part is to run the session and watch three things. The log analysis is done afterwards
from the saved probe log.

## Where things run

| What | Where |
|---|---|
| Setup and the interactive Claude session | A **throwaway repo** at `%TEMP%\tier-spike`. The setup script below creates it. Do not run the session in claude-plugins: the probe logs every prompt, and the session edits files. |
| The plugin being tested | Loaded from this repo (`plugins/planandtier`, branch `planandtier`) by the `--plugin-dir` path. Nothing is installed or copied. |
| The analyze script | Run from the **claude-plugins repo root**, after you `/exit`. It is already in this repo at `probes/planandtier/analyze-spike.js`. |

## Setup (about 1 minute)

Open PowerShell anywhere. This block creates the throwaway repo, moves you into it, and starts
Claude there:

```powershell
# 1. Clear any old probe log so the results are clean
Remove-Item "$HOME\.claude\plugins\data\planandtier-inline\probe.log" -ErrorAction SilentlyContinue

# 2. Make a throwaway repo
$dir = "$env:TEMP\tier-spike"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
'export function log(m){console.log(m)}' | Set-Content logger.js
'import {log} from "./logger.js"; log("hi")' | Set-Content main.js
git add -A; git commit -qm init

# 3. Start Claude Code in plan mode with the probe plugin loaded
claude --permission-mode plan --plugin-dir C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins\plugins\planandtier
```

If it asks whether you trust the folder, say yes.

The probe log is written to `~\.claude\plugins\data\planandtier-inline\probe.log`. Claude Code
sets `CLAUDE_PLUGIN_DATA` itself for `--plugin-dir` loads, so setting it in your shell does nothing.

## Steps in the session

Everything here happens inside the Claude session you just started in `%TEMP%\tier-spike`.

1. **Send this prompt:**
   > Plan a small change: add a --verbose flag to main.js, wire it into logger.js, and add a test file. Write the plan and call ExitPlanMode.

2. **Expect a denial, and let it happen.** The probe rejects the first `ExitPlanMode` on
   purpose, and the message contains `PROBE-P2`. Claude should then add a line
   `probe-revised` to the plan and call `ExitPlanMode` again. Don't type anything. This is
   the P2 check.
   - If Claude stops after the denial and doesn't retry, note that. It is a result.

3. **Approve the plan** when the approval dialog appears. Pick the option that starts
   executing (not "keep planning").

4. **Now type nothing, and watch the first message Claude writes.**
   - **P3:** does it start with the word `ZEBRA-PLANANDTIER`?
   - **P8:** does it launch the workflow by itself, or does it ask you first or say it needs
     you to request it?
   - If Claude Code shows a permission prompt for running the workflow, approve it. That
     counts as a click, not as typing. Note that it appeared.

5. **Wait for it to finish.** You should see 7 small tasks run one at a time (T01 to T07).
   This takes a few minutes. Then exit with `/exit`.

## Record

Answer these in plain words:

1. Did the denial happen, and did Claude revise and retry by itself? (yes/no)
2. Did the first message after approval begin with `ZEBRA-PLANANDTIER`? (yes/no)
3. Did the workflow launch without you typing anything? Did you get a permission prompt for
   it, and did Claude ask before launching? (launched by itself / asked me first / I had to
   type a command)
4. Anything unexpected, such as errors or the workflow not appearing.

## Analyze

After `/exit`, switch back to the **claude-plugins repo** (the session left your shell in the
throwaway repo):

```powershell
Set-Location C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins
```

Write an `observations.json` anywhere (for example on your Desktop) and run the analyzer:

```json
{
  "generated": "<ISO timestamp>",
  "claudeCodeVersion": "<claude --version>",
  "P3_marker_echoed": true,
  "P5_args_typeof": "object",
  "P7_all_tasks_done": true,
  "P8_typed_a_command_or_prompted": false
}
```

- `P3_marker_echoed`: answer 2 above.
- `P8_typed_a_command_or_prompted`: `true` if you typed anything, or Claude asked you to
  confirm launching the workflow before doing it. A plain tool-permission click is `false`.

```powershell
node probes/planandtier/analyze-spike.js "$HOME\.claude\plugins\data\planandtier-inline\probe.log" <path>\observations.json
```

This rewrites `probes/evidence/planandtier-spike-results.json` and prints a verdict for each
probe. Then update `planandtier-spike-findings.md` with the P2, P3 and P8 results.

## If something goes wrong

- **No denial at all:** the `ExitPlanMode` hook may not be firing. Don't retry, because that
  is the P2 answer.
- **`claude` says the plugin failed to load:** keep the message.
- **Claude never calls `ExitPlanMode`:** send the prompt again and add "You must call
  ExitPlanMode when the plan is ready."
