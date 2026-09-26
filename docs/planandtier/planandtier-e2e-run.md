# planandtier: end-to-end run

The last check before the plugin is done: one real plan, approved, executed with nothing typed after
approval. It shows that the built hooks, workflow and worker work together in an interactive session,
which the headless runs could not cover.

The run passes if:
- the plan has at least 3 tasks across at least 2 different model/effort pairs;
- every task completes after you approve, with you typing nothing;
- each worker's recorded effort matches its tag.

You run the session and answer three questions. Everything else is read from logs the session writes.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-e2e`, created by the setup below. Not claude-plugins: the workers create and edit files. |
| The plugin under test | `plugins/planandtier` in this repo, loaded with `--plugin-dir`. |
| A logger that changes nothing | `probes/planandtier/probe-plugin`, loaded beside it with `PROBE_OBSERVE=1`. It only records what each hook sees, so the effort each worker ran at can be checked afterwards. |

## Setup (about 1 minute)

Open PowerShell anywhere and run this block. It clears old logs, creates the throwaway repo, moves you
into it, and starts Claude there in plan mode.

```powershell
# 1. Clear old logs and state so the results are clean
Remove-Item "$HOME\.claude\plugins\data\planandtier-probe-inline\probe.log" -ErrorAction SilentlyContinue
Remove-Item "$HOME\.claude\plugins\data\planandtier-inline\sessions" -Recurse -Force -ErrorAction SilentlyContinue

# 2. Make a throwaway repo
$dir = "$env:TEMP\tier-e2e"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
'# Todo CLI' | Set-Content README.md
git add -A; git commit -qm init

# 3. Start Claude Code in plan mode with both plugins; the probe only logs
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$env:PROBE_OBSERVE = '1'
claude --permission-mode plan --plugin-dir "$repo\plugins\planandtier" --plugin-dir "$repo\probes\planandtier\probe-plugin"
```

If it asks whether you trust the folder, say yes.

## Steps in the session

Everything here happens inside that Claude session.

1. **Send this prompt:**
   > Plan a small Node.js command-line todo tool in this repo: `todo.js` with `add`, `list` and `done` commands that keep their data in `todo.json`, a test file using `node:test`, and a usage section in README.md. Split the work into tasks.

   It should produce a plan ending in a `## Tasks` section. Plans for this prompt normally include
   one mechanical task (such as the README text) and one that needs more care (such as the
   storage code), which is what gives you two different tiers.

2. **Reject the plan once, on purpose.** When the approval dialog appears, choose the option that keeps
   planning (or reject it), and type this note: `Also add a .gitignore that ignores todo.json.` Claude
   should revise the plan and offer it again. This checks that rejecting a plan does not start execution.

3. **Approve the revised plan in auto mode.** Choose the auto mode option.

4. **Now type nothing.** Watch what Claude does first, then watch `/workflows` (you can open it with
   `/workflows`). You should see the tasks run one at a time, each named `T01`, `T02`, ...

5. **Wait for the workflow to finish.** It takes a few minutes. Then ask Claude nothing further.

6. **Optional relaunch check.** Type `/planandtier:execute-plan` and note what happens: it may run the
   same tasks again, or it may say no tasks were supplied. Either is a useful result. It reruns real
   tasks in the throwaway repo, so skip this if you don't want the extra cost.

7. Exit with `/exit`.

## Record

Answer these in plain words:

1. **Rejection (step 2):** after you rejected the plan, did Claude just revise it and offer it again,
   or did it start running tasks? (revised / started running)
2. **Approval (steps 3 and 4):** after you approved, did the workflow launch by itself with nothing typed,
   or did Claude stop, ask you something, or say it needs you to do something?
3. **Result:** did every task finish? Did you get any permission prompt during the run, for the workflow
   or for a worker? If a task failed or stalled, which one and what did the screen say?
4. **Optional step 6:** what happened when you typed `/planandtier:execute-plan`?
5. Anything unexpected, such as errors.

## After you `/exit`

Tell me you're done and answer the questions above. I read the rest myself:
- the probe log at `~\.claude\plugins\data\planandtier-probe-inline\probe.log`, for every hook input and
  the effort each worker ran at;
- the session transcript, for what Claude did after approval;
- the files the workers created in `%TEMP%\tier-e2e`.

Please don't delete those until I've read them. I'll write the results to
`docs/planandtier/planandtier-e2e-findings.md`, with the evidence in
`probes/evidence/planandtier-e2e-results.json`.

## If something goes wrong

- **`claude` reports that a plugin failed to load:** keep the message and stop.
- **Claude never calls `ExitPlanMode`:** tell it "You must call ExitPlanMode when the plan is ready."
- **The plan is denied more than once:** that is the plugin's check working. Let Claude fix the plan. After
  three denials the plugin lets the plan through untiered, and says so.
- **After approval Claude implements the plan itself instead of launching the workflow:** stop there
  and tell me. Note whether it was blocked.
