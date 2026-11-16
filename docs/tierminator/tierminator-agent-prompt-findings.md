# Agent prompt findings: putting the whole task in the worker's prompt

Derived from `probes/evidence/tierminator-agent-prompt-results.json` (12 headless cells) and
`probes/evidence/tierminator-agent-context-size-results.json` (6 headless cells), made by
`probes/tierminator-agent-prompt/runner.js` and `context-size.js` on 2026-11-16 with Claude Code 2.1.325, and the
two auto-mode cells `r10` and `r11` added to `probes/evidence/tierminator-bash-timeout-results.json` by
`probes/tierminator-bash-timeout/runner.js` the same day. Every result below is in those files.

## Question

Until this change a worker's prompt was a pointer: `Tasks file:`, `Plan:` and `Task:` lines. The worker
read its task from the tasks file with the Read tool. In auto mode, users saw workers' innocuous actions
(copying a file, editing a `pom.xml`) refused as destructive or unwanted. Auto mode judges an action
against what the agent was asked to do, and a task the worker read from a file is tool output, not its
request. So the whole task has to be in the worker's prompt. There are two ways to put it there:

1. **A hook adds it.** Claude still dispatches the short pointer, and H4's `PreToolUse` hook on the Agent
   call returns `updatedInput` with the task text appended. That costs no model tokens and cannot be
   mistyped.
2. **Claude copies it.** The dispatch text the hooks give Claude holds the whole task, and H4 refuses any
   call whose prompt does not match it exactly.

Two questions decide between them. Does a hook's change to an Agent call's prompt reach the subagent, in
every permission mode? And how much hook text reaches Claude intact, since option 2 puts every task prompt
of a parallel wave into one hook message?

## Method

**Agent prompt** (`runner.js`). Headless `claude -p` on Haiku, with hooks only from `--settings`
(`--setting-sources project`, so no installed plugin loads) and `--max-turns 6`. The main session is told to
make one Agent call to `general-purpose` with a given prompt and to reply with what the subagent returned.
The probe hook (`hook.js`) has three roles: `inject` (`PreToolUse` Agent: `updatedInput` with a line appended
to the prompt, no `permissionDecision`), `post` (`PostToolUse` Agent: logs the prompt the tool ran with) and
`stop` (`SubagentStop`: logs the first user message of the subagent's transcript and its last message). The
`inject` line comes in two wordings:

- **contra**: the prompt says "reply APPLE" and the added line says "reply PINEAPPLE";
- **consistent**: the prompt is a pointer ("Task: T01. The text of task T01 follows this line") and the added
  line is that task ("reply with exactly the word PINEAPPLE"), the way tierminator would add it.

| Cell | Inject | Permission mode | Main prompt |
|---|---|---|---|
| `n0` | none | `bypassPermissions` | contra pointer |
| `i1` | contra | `bypassPermissions` | contra pointer |
| `i2` | contra | `manual`, `--allowedTools Agent` | contra pointer |
| `i3` | contra | `auto` | contra pointer |
| `c1` | consistent | `bypassPermissions` | consistent pointer |
| `c2` | consistent | `manual`, `--allowedTools Agent` | consistent pointer |
| `c3a`-`c3c` | consistent | `auto` | consistent pointer |
| `c4a`-`c4c` | consistent | `auto` | consistent pointer, told that a hook adds the task's text |

**Context size** (`context-size.js`). Same setup on Haiku in `bypassPermissions`. A hook returns text of
9,000, 20,000 or 40,000 characters, made of numbered filler lines with a START word first and an END word last.
It returns that text as `additionalContext` on `UserPromptSubmit` (the channel H1 and H3 use), or as a
`PreToolUse` deny reason for a marked Bash command (the channel H4's refusals use). The model is asked for
both words and told to use no tool unless it cannot see both.

**Bash timeout in auto mode** (`r10`, `r11`). The bash-timeout probe's `timeout` hook (`updatedInput` with
`timeout` 3000 on a Bash call, as H9 does for workers) in `auto` mode, in the main session (`r10`) and in a
subagent (`r11`).

## Results

### A hook's change to an Agent prompt reaches the subagent, except in auto mode

| Cell | Subagent's first message has the added line | Subagent replied | Agent call |
|---|---|---|---|
| `n0` | no (no hook) | APPLE | ran |
| `i1` | yes | PINEAPPLE | ran |
| `i2` | yes | APPLE (it followed the first of two contradictory lines) | ran |
| `i3` | no subagent | none | **refused** |
| `c1` | yes | PINEAPPLE | ran |
| `c2` | yes | PINEAPPLE | ran |
| `c3a`-`c3c` | no subagent | none | **refused, 3 of 3** |
| `c4a`-`c4c` | no subagent | none | **refused, 3 of 3** |

1. **Outside auto mode, `updatedInput` changes the prompt the subagent receives** (`i1`, `i2`, `c1`, `c2`). The
   subagent's first transcript message holds the added line, `PostToolUse` reports the changed prompt, and
   the model's own Agent call (in the stream) does not hold it. A consistent task is followed (`c1`, `c2`). A
   contradictory line is followed or not, as the subagent judges (`i1`, `i2`), which does not matter to
   tierminator.
2. **In auto mode, every Agent call a hook changed is refused, with no verdict** (`i3`, `c3a`-`c4c`: 7 of 7).
   This holds whether the added text agrees with the prompt or not, and whether or not Claude was told that a
   hook adds it. The tool result is:

   > The server-side auto mode classifier gave no verdict for Agent: a hook changed this call's input after auto
   > mode reviewed it, so the review does not cover what would run. This is not a judgment that the action is
   > unsafe. The hook produced this input: {...}. In your next response, issue the Agent call once more with
   > exactly that input so auto mode reviews it.

   So in auto mode a hook that adds the task makes Claude retype the whole prompt anyway, after one refused
   call per dispatch. Option 1 is option 2 plus a wasted call, and it only works if Claude follows the
   refusal's instruction.
3. **A hook's `timeout` on a Bash call is not refused in auto mode** (`r10`, `r11`). Both calls ran with the
   3 s timeout and moved to the background, in the main session and in a subagent. H9 is unaffected. Only the
   one harmless command was tried.

### Hook context over about 10,000 characters reaches Claude only as a file

| Cell | Channel | Size | Both words seen | Tools used |
|---|---|---|---|---|
| `ctx-9000` | `additionalContext` | 9,000 | yes | none |
| `ctx-20000` | `additionalContext` | 20,000 | yes | Read, Read |
| `ctx-40000` | `additionalContext` | 40,000 | yes | Read, Read |
| `deny-9000` | deny reason | 9,000 | yes | Bash (the marked call) |
| `deny-20000` | deny reason | 20,000 | yes | Bash (the marked call) |
| `deny-40000` | deny reason | 40,000 | yes | Bash (the marked call) |

4. **`additionalContext` arrives whole at 9,000 characters but not at 20,000.** At 20,000 and 40,000 the model
   read the text from a file under the session's `tool-results` directory (`hook-*` files) before it could
   answer. The cutoff lies between 9,000 and 20,000; it was not narrowed further.
5. **A `PreToolUse` deny reason arrives whole at 40,000 characters.**

## What tierminator does with this

- **Claude copies the task (option 2).** The dispatch prompt is the whole task, never a pointer: `Plan:`,
  `Task:` and `Title:` lines, a retry's `Retry:` and `Reason:` lines, a wave slot's `Parallel:`, `Worktree:` and
  `Setup:` lines, then a `Task prompt:` line and the task's prompt verbatim (`expectedPrompt()` in
  `lib/run.js`). The worker reads nothing from the tasks file. H4 still refuses any call that is not the
  expected one, and its refusal names the first line that differs, so a copying slip can be put right. Hook
  injection (option 1) was not built: result 2 rules it out in auto mode, the mode where the problem arises.
- **A wave's dispatch text holds at most 7,000 characters of calls** (`DISPATCH_BUDGET` in `lib/wave-run.js`),
  and always at least one call, which keeps it under the cutoff in result 4 with room for the text around it.
  The rest of the wave is given by H4's `post` once every call of that text has been sent. Joined notices
  drop the dispatch blocks that a newer notice replaces.
- **What this costs.** Claude writes each task prompt once per attempt. Across 1,242 task prompts in 104 saved
  plans, the median prompt was 2,325 characters, the 90th percentile 3,960 and the largest 25,360. A single
  task whose call alone exceeds the cutoff still reaches Claude, as a file it has to read. Before this change
  the dispatch was about 100 characters.

## Not measured

- Auto mode refusing an actual worker action because its task came from a file, the problem behind this
  change. That refusal was reported from real runs; the probe shows only how the fix behaves.
- The interactive Agent tool. Every cell here was headless.
- The size cutoff of a `Stop` hook's block reason (H5) and of `PostToolUse` `additionalContext`. These were
  assumed to match `UserPromptSubmit`'s.
- Whether Claude copies a 5,000-character prompt exactly every time. H4's exact-match check and its refusal
  catch any slip.
