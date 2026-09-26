# planandtier: run without auto mode

The end-to-end run used auto mode. This run approves the plan with manual permissions instead, the way
most people run Claude Code, to find out what the workflow does when you have to click.

## What headless runs already showed

Nobody could click in those runs, so they only show what happens when approval is unavailable
(`probes/evidence/planandtier-default-mode-headless-results.json`):

- **A review gate.** In default mode, the `Workflow` call stopped at a prompt titled
  "Review dynamic workflow before running" before any task started.
- **Workers that can't get permission fail cleanly.** With that gate allowed, the first worker was
  denied write access, reported `failed` with the reason, and the workflow halted at T01. It did not hang.

## What this run should show

Four things nobody has seen yet:

1. What the **review dialog** says: whether it lists the tasks, and what options it offers.
2. Whether the **workers' permission prompts** (file writes, shell commands) reach you.
3. What the **workflow does while it waits** for you: waits, times out, or fails.
4. What happens if you **decline** the review dialog.

Everything else is read from the logs.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-manual`, created by the setup. Not claude-plugins. |
| The plugin under test | `plugins/planandtier`, loaded with `--plugin-dir`. |
| A logger that changes nothing | `probes/planandtier/probe-plugin`, beside it with `PROBE_OBSERVE=1`. |

## Setup (about 1 minute)

Open PowerShell anywhere and run this block:

```powershell
# 1. Clear old logs and state so the results are clean
Remove-Item "$HOME\.claude\plugins\data\planandtier-probe-inline\probe.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\planandtier-inline\sessions" -Recurse -Force -ErrorAction SilentlyContinue

# 2. Make a throwaway repo
$dir = "$env:TEMP\tier-manual"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
'# Demo' | Set-Content README.md
git add -A; git commit -qm init

# 3. Start Claude Code in plan mode with both plugins; the probe only logs
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$env:PROBE_OBSERVE = '1'
claude --permission-mode plan --plugin-dir "$repo\plugins\planandtier" --plugin-dir "$repo\probes\planandtier\probe-plugin"
```

If it asks whether you trust the folder, say yes. If your settings already allow file writes or
shell commands without asking, the run shows less. Note that in your answers.

## Steps in the session

Everything here happens inside that Claude session.

1. **Send this prompt:**
   > Plan exactly three small tasks: (1) create hello.txt containing the single line "hello planandtier"; (2) create add.js exporting add(a, b) and add.test.js testing it with node:test; (3) create summary.txt with two lines, the content of hello.txt and the result of add(2, 3), which needs a judgment call on how to compute it, so plan this one for Opus.

2. **Approve the plan with manual permissions.** When the approval dialog appears, choose the option
   that keeps asking before edits (not the auto mode option and not the option that accepts all edits).
   Note the wording of every option in the dialog.

3. **Watch what Claude does first.** It should call the workflow. Do not type anything yet.

4. **A dialog titled "Review dynamic workflow before running" may appear.** Before you answer it, look at
   what it shows and note it: the workflow's name, whether it lists the three tasks or their models and
   efforts, and the choices offered. Then **approve it once**. Do not choose "don't ask again".

5. **Answer permission prompts as they appear.** Each time a prompt appears for a worker (a file write,
   a shell command), note what it asks and approve it. Count them.
   - If no prompts appear and the tasks fail or hang, don't fix anything. Note what the screen says and
     where it stopped. Wait at least two minutes before deciding it is stuck.

6. **Wait for the workflow to finish.** Note whether it completed.

7. **Optional: the decline check.** Type `/planandtier:execute-plan`. When the review dialog appears,
   **decline it**. Note what Claude says and does next. This shows what a declined launch leaves behind.

8. Exit with `/exit`.

## Record

Answer these in plain words:

1. **Approval dialog (step 2):** the wording of the options, and which you chose.
2. **Launch (step 3):** did Claude call the workflow by itself?
3. **Review dialog (step 4):** did it appear? What did it show, and what were the choices?
4. **Worker prompts (step 5):** did prompts appear? How many, and for what?
5. **Result (step 6):** did every task finish? If not, where did it stop and what did the screen say?
6. **Decline check (step 7):** what happened, if you ran it?
7. Anything unexpected, such as errors or messages that seemed wrong.

## After you `/exit`

Tell me you're done and send the answers. I read the rest myself: the probe log at
`~\.claude\plugins\data\planandtier-probe-inline\probe.log`, the session transcript, and the files the
workers created in `%TEMP%\tier-manual`. Please don't delete those until I've read them.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **Claude never calls `ExitPlanMode`:** tell it "You must call ExitPlanMode when the plan is ready."
- **After approval Claude does the work itself instead of launching the workflow:** stop and tell me,
  and note whether anything blocked it.
