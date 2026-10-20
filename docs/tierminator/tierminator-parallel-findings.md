# tierminator parallel: placing a subagent in a Git worktree

Probes P1 and P2 of [`tierminator-parallel-spec.md`](tierminator-parallel-spec.md#probes) and their re-runs
(M1 with four ways to fix the base, M2 with `cd` prefixes), run on 2026-10-19 and 2026-10-20 (03:43 to 04:15 UTC
on 2026-10-20) with Claude Code 2.1.304 on Windows, headless, eleven cells, $1.32 in all ($0.61 for the five P1
and P2 cells, $0.48 for the four M1 cells, $0.23 for the two M2 cells). The re-runs changed the runner's prompt:
the main session is now told to pass the prompt that sits between two lines of three dashes exactly, which the P1
and P2 cells did not have (`p2-outside` shows the main session adding a line).

Each cell is made by `probes/tierminator-parallel/p1-p2-runner.js`. It builds a throwaway repo in the temp
directory with a bare `origin`: `main` at commit A is pushed to `origin`, then local `main` moves on to A2 and
branch `work` is checked out at B (so A, A2 and B tell apart the remote default branch, local `main` and the
current HEAD). The repo's `CLAUDE.md` says `CLAUDE-MARKER: main-tree`. For P2 the runner also makes a worktree
on branch `probe/p2` from B and commits W in it, whose `CLAUDE.md` says `CLAUDE-MARKER: worktree`. The main
session (`claude -p --model sonnet --permission-mode bypassPermissions`, with
`probes/tierminator-parallel/probe-plugin` loaded) makes one Agent call to the plugin agent
`tierminator-parallel-probe:sonnet-low`. That agent runs fixed steps, one tool call each (`pwd`; a lone `cd`
to the `Worktree:` path, P2 only; `pwd`; `git rev-parse` for the toplevel, branch and HEAD; a Write with a
relative path and one with an absolute path; a commit; `pwd`, branch and status), and is told never to put
`cd` in any other command and never to use `git -C`. The plugin's hooks log every hook input; in
`p1-hook-isolation` the `PreToolUse` hook on Agent adds `isolation: "worktree"` through `updatedInput`. After
the session the runner records the repo's worktrees, branches and status.

Evidence, one file per cell:
- `probes/evidence/tierminator-parallel-p1-isolation-commit.json`: the call passes `isolation: "worktree"`,
  the worker commits.
- `probes/evidence/tierminator-parallel-p1-isolation-nocommit.json`: the same, the worker does not commit.
- `probes/evidence/tierminator-parallel-p1-hook-isolation.json`: no `isolation` on the call; the hook adds it.
- `probes/evidence/tierminator-parallel-p2-inside.json`: no isolation; the runner's worktree is at
  `repo/.claude/worktrees/p2` (listed in `.git/info/exclude`).
- `probes/evidence/tierminator-parallel-p2-outside.json`: the same with the worktree beside the repo,
  at `<base>/wt-p2`.
- `probes/evidence/tierminator-parallel-m1-baseref-flag.json`: M1 with `worktree.baseRef: "head"` in a
  `--settings` file.
- `probes/evidence/tierminator-parallel-m1-baseref-plugin.json`: M1 with the same setting in a plugin's
  `settings.json`.
- `probes/evidence/tierminator-parallel-m1-worktree-hook.json`: M1 with a `WorktreeCreate` hook that makes the
  worktree from B.
- `probes/evidence/tierminator-parallel-m1-substart-reset.json`: M1 with a `SubagentStart` hook that resets the
  worktree to B.
- `probes/evidence/tierminator-parallel-m2-cd-inside.json`: M2 with a `cd` prefix on every Bash command, the
  worktree at `repo/.claude/worktrees/p2`.
- `probes/evidence/tierminator-parallel-m2-cd-outside.json`: the same with the worktree at `<base>/wt-p2`.

Each file holds the hook log, a `summary` (the Agent call, the hook output, `SubagentStart` and
`SubagentStop`, every tool call's `cwd`, the agent's report, the base commits and the Git state afterwards)
and the session's final result. Every claim below is measured unless it says **inferred**.

## P1: the Agent tool's isolation

| Question | Answer | Evidence |
|---|---|---|
| Does isolation apply to a plugin agent (`tierminator-parallel-probe:sonnet-low`)? | **Yes.** In all three P1 cells the worker ran in a new worktree, `repo/.claude/worktrees/agent-<agent_id>`, on a new branch `worktree-agent-<agent_id>`. | all three `p1-*` files: `summary.report`, `summary.after.worktrees` |
| Can a `PreToolUse` hook add it through `updatedInput`, with no `permissionDecision`? | **Yes.** The hook emitted only `hookSpecificOutput.updatedInput` (the call's input plus `isolation: "worktree"`). `PostToolUse` on Agent then showed `tool_input.isolation: "worktree"`, and the worker ran in a worktree exactly as when the model passed the parameter. Measured headless under `bypassPermissions` only. | `p1-hook-isolation.json`: `summary.hookEmitted`, `summary.agentCall`, `post-agent` in `hookLog` |
| Must the model pass it? | **No**, either works: the model passing it (`p1-isolation-*`) or the hook adding it (`p1-hook-isolation`). | as above |
| Where do the worktree path and branch appear? | **`PostToolUse` on Agent**: `tool_response.worktreePath` (Windows form, `C:\…\.claude\worktrees\agent-<id>`) and `tool_response.worktreeBranch` (`worktree-agent-<id>`). **`SubagentStart`** and **`SubagentStop`**: `cwd` is the worktree path, beside `agent_id`. **The worker's own `PreToolUse`/`PostToolUse`**: `cwd` is the worktree path, with `agent_id`. The branch is not in any field except `PostToolUse`'s, but it is `worktree-agent-` plus `agent_id` in all three cells (**inferred** to be the rule). `PreToolUse` on Agent has neither, since the worktree does not exist yet. | all three `p1-*` files: `summary.worktreeMentions`, `summary.subagentStart`, `summary.subagentStop`, `summary.toolCwds` |
| Which commit is the worktree based on? | **A, `origin/main`**: not B (the main tree's HEAD on `work`) and not A2 (local `main`). `HEAD_BEFORE` equals A in all three cells, and the worktree's log is A then the probe commit. **Inferred:** Claude Code bases the worktree on the remote's default branch (`origin/HEAD`). | all three `p1-*` files: `summary.base.basedOn`, `summary.after.worktrees[1].log` |
| What is left when the worker committed? | The worktree stays (clean, HEAD at the worker's commit), and so does its branch `worktree-agent-<id>` at that commit. `PostToolUse` has `canContinueAgent: true`. The main tree stays on `work` at B, but shows `?? .claude/`: the worktrees directory is untracked in it. | `p1-isolation-commit.json`, `p1-hook-isolation.json`: `summary.after` |
| What is left when it did not commit? | The worktree stays, with its branch at A and `?? probe-rel.txt` untracked in it; the main tree again shows `?? .claude/`. Whether Claude Code removes a worktree with **no** changes is **not determinable**: this worker left an untracked file, so that case did not occur. | `p1-isolation-nocommit.json`: `summary.after` |
| Where did the writes land? | The relative Write (`probe-rel.txt`) landed in the worktree. The absolute Write did **not**: the worker took the directory from Bash `pwd`, which Git Bash prints as `/tmp/…`, and the Write tool got `\tmp\…\probe-abs.txt`. The file is in no worktree and not in the main tree. **Inferred:** it resolved to `C:\tmp\…` on the current drive. | all three `p1-*` files: `summary.toolCwds` (the Write targets), `summary.after.worktrees[*].probeFiles`, `summary.after.mainProbeFiles` |
| Which `CLAUDE.md` was it given? | `MARKER: main-tree`. **Not determinable** which file that came from, because the worktree is at A, whose own `CLAUDE.md` also says `main-tree`. | all three `p1-*` files: `summary.report.MARKER` |

### Details

- **`p1-isolation-commit`.** The model passed `isolation: "worktree"` and `run_in_background: false`. Every
  worker tool call ran with `cwd` in `.claude/worktrees/agent-a65ec6a66c416832c`; toplevel and branch were
  that worktree and `worktree-agent-a65ec6a66c416832c`; the commit `c8a682e` went onto that branch, and the
  main tree's `work` stayed at B. `SubagentStop` fired with the report in `last_assistant_message`.
  `PostToolUse` on Agent had `status: "completed"` plus `worktreePath` and `worktreeBranch`.
- **`p1-isolation-nocommit`.** The same placement (`agent-ac435601ec3b21c4a`). The worker noticed that
  `probe-abs.txt` was missing from `git status` and said so in its report.
- **`p1-hook-isolation`.** The model made the call without `isolation`; the hook's `updatedInput` added it.
  The placement, base, commit (`5d194a5` on `worktree-agent-a007666a493b9b56d`) and leftovers were the same
  as in `p1-isolation-commit`.
- In every P1 cell the Bash `cwd` stayed in the worktree from the first call to the last, with no `cd`.

## P2: a worktree made by tierminator

The runner's worktree was on `probe/p2` at W (based on B), and the prompt carried
`Worktree: <absolute path, drive-letter form>`. The worker's only move into it was a lone `cd` (step 3).

| Question | Inside (`repo/.claude/worktrees/p2`) | Outside (`<base>/wt-p2`) | Evidence |
|---|---|---|---|
| The worker's initial Bash `cwd` | The main tree, `repo` (`SubagentStart` `cwd` and the first `pwd`). | The main tree, `repo`. | `p2-inside.json`, `p2-outside.json`: `summary.subagentStart`, `summary.report.PWD_INITIAL` |
| Does a lone `cd` persist to the next Bash call? | **No.** The `pwd` after `cd "<worktree>"` printed `repo`, and every later tool call's `cwd` is `repo`. | **No**, the same. | both: `summary.toolCwds`, `summary.report.PWD_NOW` |
| Git toplevel and branch | `repo` and `work` (the main tree's), HEAD B. | `repo` and `work`, HEAD B. | both: `summary.report.TOPLEVEL`, `BRANCH`, `HEAD_BEFORE` |
| Where the relative Write landed | The main tree (`repo/probe-rel.txt`). | The main tree. | both: `summary.toolCwds`, `summary.after.mainProbeFiles` |
| Where the absolute Write landed | **The worktree** (`.claude/worktrees/p2/probe-abs.txt`), from the drive-letter path in the `Worktree:` line. It stayed untracked there. | **The worktree** (`wt-p2/probe-abs.txt`), untracked. | both: `summary.after.worktrees[1].probeFiles` and `.status` |
| Which `CLAUDE.md` it was given | The main tree's (`MARKER: main-tree`), not the worktree's (`worktree`). | The main tree's. | both: `summary.report.MARKER` |
| Which branch the commit landed on | **`work`**, the main tree's branch (`e78af77`), not `probe/p2`, which stayed at W. | **`work`** (`254ec0e`); `probe/p2` stayed at W. | both: `summary.after.branches`, `summary.after.worktrees[*].log` |
| Did the main tree stay clean and on B? | **Clean, but not on B**: `work` moved to the probe commit, which holds `probe-rel.txt`. | **Clean, but not on B**, the same. | both: `summary.after.main` |

### Details

- **Inside and outside behaved the same** headless under `bypassPermissions`. With the inside path listed in
  `.git/info/exclude`, the main tree's status was empty after the run.
- **`SubagentStart` and `SubagentStop`** had `cwd` = the main tree, and `PostToolUse` on Agent had no
  `worktreePath` or `worktreeBranch`, so no hook input names the worktree except the prompt itself.
- **The main session added a line to the worker's prompt** in `p2-outside`: the call's `prompt` carried the
  main prompt's closing instruction ("Do not do the steps yourself…") after the `Worktree:` line. It did not
  change what the worker did. Tierminator's H4 checks the dispatch text, so it would deny such a call.

## M1 re-run: fixing the base

Four more headless cells, run on 2026-10-20 (04:13 to 04:15 UTC) with Claude Code 2.1.304 on Windows, $0.48 in
all, each one try to give the M1 worktree the base B. They use the same throwaway repo as P1 and P2 (A on
`origin/main`, A2 on local `main`, B at `work`'s HEAD), the same main-session prompt, and a new probe agent,
`tierminator-parallel-probe:m1-worker`, whose fixed steps report the toplevel, the branch and HEAD, whether
`b.txt` (committed at B only) exists and what it holds, then do an Edit of `README.md`, a Write of
`probe-abs.txt` with the drive-letter worktree path, a commit, and the closing branch and status. In every cell
the runner added `.claude/worktrees/` to `.git/info/exclude`, so a clean main tree here does not show what the
main tree looks like without that entry. The four mechanisms: `worktree.baseRef: head` in a `--settings` file
(`m1-baseref-flag`, with a `PreToolUse` hook adding `isolation`), the same setting in a plugin's `settings.json`
(`m1-baseref-plugin`), a `WorktreeCreate` hook that makes the worktree itself from B with `git worktree add`
(`m1-worktree-hook`), and a `SubagentStart` hook that runs `git reset --hard B` in the worktree
(`m1-substart-reset`). The documentation ([worktrees](https://code.claude.com/docs/en/worktrees) and
[hooks](https://code.claude.com/docs/en/hooks)) says `worktree.baseRef` accepts `fresh` (the default) or `head`,
and that a `WorktreeCreate` hook replaces Claude Code's own worktree creation. That is documentation, not
evidence: only the table's measured rows below count as evidence. Each cell ran once.

Evidence, one file per cell, each with the same fields as the P1 files:
`probes/evidence/tierminator-parallel-m1-baseref-flag.json`,
`probes/evidence/tierminator-parallel-m1-baseref-plugin.json`,
`probes/evidence/tierminator-parallel-m1-worktree-hook.json` and
`probes/evidence/tierminator-parallel-m1-substart-reset.json`.

| Cell | Mechanism | Worktree base (`HEAD_BEFORE` vs B; `B_TXT`) | Did the mechanism's own hook or setting fire | Where the path and branch reached a hook | Edit and write in the worktree | Main tree | Commit on a branch | Evidence |
|---|---|---|---|---|---|---|---|---|
| `m1-baseref-flag` | `--settings` file with `worktree.baseRef: "head"`; a `PreToolUse` hook added `isolation: "worktree"` (the call had none) | **B.** `HEAD_BEFORE` `b1b7113` = B; `B_TXT: b`. | The setting **took effect** (base B where P1 gave A). The hook fired: `pre-agent:emit` carries `updatedInput.isolation`, and `PostToolUse` shows `tool_input.isolation: "worktree"`. | `PostToolUse` on Agent: `tool_response.worktreePath` and `worktreeBranch`. `SubagentStart`/`SubagentStop` and the worker's tool hooks: `cwd` is the worktree. The branch is in no other field. | Both worked (`EDIT: ok`, `WRITE: ok`); `README.md` edited and `probe-abs.txt` present in the worktree, neither in the main tree. | On `work` at B, status empty. | Yes: `b760188` on `worktree-agent-abdce773db87913e5`, directly on B; worktree clean. | `m1-baseref-flag.json`: `summary.checks` (all true), `summary.report`, `summary.variantEvents` (empty, no variant hook), `summary.worktreeMentions`, `summary.after` |
| `m1-baseref-plugin` | A plugin (`variant-settings`) whose `settings.json` has `worktree.baseRef: "head"`; the call passed `isolation` | **A, not B.** `HEAD_BEFORE` `128a792` = A; `B_TXT: missing`. | The setting **did not take effect**: base A as in P1. No hook was involved (`variantEvents` empty). | `PostToolUse` on Agent: `worktreePath` and `worktreeBranch`; `cwd` on `SubagentStart`/`SubagentStop` and tool hooks. | Both worked in the worktree; neither landed in the main tree. | On `work` at B, status empty. | Yes: `69ee844` on `worktree-agent-a02ba60c55720769b`, on A. | `m1-baseref-plugin.json`: `summary.checks` (`baseIsB` and `bTxtPresent` false), `summary.report`, `summary.base`, `summary.after` |
| `m1-worktree-hook` | A `WorktreeCreate` hook that ran `git worktree add -b tierminator/probe/<name> <dir>/<name> B`, printing the path; the call passed `isolation` | **B.** `HEAD_BEFORE` `cae6410` = B; `B_TXT: b`. | The hook **fired** and made the worktree (`wt-create`, `wt-create:made`). No `.claude/worktrees/` directory and no `worktree-agent-*` branch exist afterwards, so Claude Code's own creation did not run. | `PostToolUse` on Agent: `tool_response.worktreePath` (the path the hook printed) but **no `worktreeBranch`**. `cwd` on `SubagentStart`/`SubagentStop` and tool hooks. The branch (hook-chosen) appears only in the worker's output and report. | Both worked in the worktree; neither landed in the main tree. | On `work` at B, status empty. | Yes: `6d8fd98` on `tierminator/probe/agent-ace6abff5404281e8`, directly on B; worktree clean. | `m1-worktree-hook.json`: `summary.checks` (all true), `summary.variantEvents`, `summary.worktreeMentions`, `summary.agentResult`, `summary.after` |
| `m1-substart-reset` | A `SubagentStart` hook that ran `git reset --hard B` in the worktree; the call passed `isolation` | **B.** `HEAD_BEFORE` `0b96fe4` = B; `B_TXT: b`. | The hook **fired**: `sub-reset` records `before` A (`0ae6f80`), `after` B, `status` 0, empty stderr. The worktree was therefore first made at A and then moved. | `PostToolUse` on Agent: `worktreePath` and `worktreeBranch` (Claude Code's naming). `SubagentStart` input has `cwd` = the worktree, with `agent_id`. | Both worked in the worktree; neither landed in the main tree. | On `work` at B, status empty. | Yes: `6d9891a` on `worktree-agent-a6119904d256b385d`, on B. | `m1-substart-reset.json`: `summary.checks` (all true), `summary.variantEvents`, `summary.report`, `summary.after` |

### Details

- **`m1-baseref-flag`.** No `Agent` error (`summary.agentError` is null). The setting was supplied with
  `--settings <file>`, so this shows the flag's file works. It does not show that `worktree.baseRef` works from
  a project or user `settings.json`, which no cell tried (**not determinable**). The worktree stayed at
  `repo/.claude/worktrees/agent-abdce773db87913e5`, and the main tree's status was empty only because of the
  `.git/info/exclude` entry (**inferred**, as in P1 where `?? .claude/` showed without it).
- **`m1-baseref-plugin`.** No `Agent` error. The plugin loaded by `--plugin-dir` (`summary.plugins` lists it)
  and nothing in the log reports a rejected setting. Why the setting had no effect is **not determinable**
  from the evidence: it could be that plugin `settings.json` does not accept this key, or that the plugin's
  settings are not read for this purpose; neither was tested. The worker's `Read` of `b.txt` failed
  (`post-fail`: "File does not exist"), the expected result at A, and the worker reported `B_TXT: missing`
  and went on to the commit.
- **`m1-worktree-hook`.** No `Agent` error. The `WorktreeCreate` hook's stdin had the keys `session_id`,
  `transcript_path`, `cwd`, `prompt_id`, `hook_event_name` and `name` (`agent-ace6abff5404281e8`): no base, no
  branch, no isolation flag, no agent type. Its `cwd` field and the hook process's own working directory were
  both the main tree (`hookCwd` equals `inputCwd`). The hook created the worktree 86 ms after it started
  (`wt-create` 04:14:13.731, `wt-create:made` 04:14:13.817), `SubagentStart` fired 277 ms later, and the
  worker's first tool call came at 04:14:15.475. The worktree sits beside the repo (`<base>/wt-hook/<name>`),
  outside the project, and the run needed no permission prompt (`bypassPermissions`; a default-mode prompt is
  **not determinable** headless). The hook used the same name for the worktree directory, as given in `name`;
  the branch name is whatever the hook chose, and no hook field gives it to later hooks, so a caller would have
  to compute it (**inferred**). `PostToolUse` on Agent has `worktreePath` but, unlike the other three cells,
  no `worktreeBranch`. `canContinueAgent` is true. The `WorktreeRemove` hook, also registered, did not fire in
  this run (no `wt-remove` entry), and whether it would on cleanup is **not determinable**.
- **`m1-substart-reset`.** No `Agent` error. Timing, from the hook log: `SubagentStart` at 04:14:35.850, the
  reset from 04:14:35.891 to 04:14:35.945 (54 ms), and the worker's first tool call (`pre-tool`) at
  04:14:37.768, 1.82 s after the reset ended. The worker's own `HEAD_BEFORE` was B, so in this run the reset
  finished before the worker's first command. Whether Claude Code waits for a `SubagentStart` hook before the
  worker's first turn is **not determinable** from one run: the gap here is much longer than the reset, and
  a slower reset was not tried. The reset moved the worktree's branch `worktree-agent-<id>` from A to B, and
  the branch's log afterwards starts with the probe commit, then B.

## M2 re-run: the cd-prefix rules

Two more headless cells, run on 2026-10-20 (04:15 UTC) with Claude Code 2.1.304 on Windows, $0.23 in all, each
one try to make the worker's commit land on `probe/p2` with the main tree left alone. They use the same
throwaway repo, runner-made worktree (on `probe/p2` at W, based on B; `inside` at `repo/.claude/worktrees/p2`,
`outside` at `<base>/wt-p2`) and main-session prompt as P2, with a new probe agent,
`tierminator-parallel-probe:m2-worker`. What changed from the first P2: the worker may now put a `cd` in front of
Bash commands, where P2 forbade any `cd` but one lone `cd`. The agent's rules:

```
- Start every Bash command with `cd "<WT>" && ` followed by the command. No Bash command may run without it.
- Every file-tool call (Read, Write, Edit) takes an absolute path that starts with WT. Never a relative path.
- Never build a path from `pwd` output: on this machine `pwd` prints `/tmp/...` paths that the file tools resolve to the wrong place.
```

The fixed steps are: (0) `MARKER_GIVEN`, the `CLAUDE-MARKER:` text of the `CLAUDE.md` the worker was given at the
start, read from no file; (1) one Bash `cd "<WT>" && pwd && git rev-parse --show-toplevel && …` for `PWD_CD`,
`TOPLEVEL`, `BRANCH` and `HEAD_BEFORE`; (2) a Read of `<WT>/CLAUDE.md` for `READ_MARKER`; (3) a Read of
`<WT>/b.txt` (committed at B only) for `B_TXT`; (4) a Read and then an Edit of `<WT>/README.md`, replacing the line
`probe` with `probe edited`; (5) a Write of `<WT>/probe-abs.txt`; (6) a Bash `cd "<WT>" && git add -A && git
commit …`; (7) a Bash `cd "<WT>" && git rev-parse --abbrev-ref HEAD && git status --porcelain`. The prompt is fenced:
the `Probe cell:`, `Commit: yes` and `Worktree: <drive-letter path>` lines sit between two lines of three dashes,
and the main session is told to pass them exactly. The call has no `isolation` parameter. In both cells the runner
added `.claude/worktrees/` to `.git/info/exclude`, so a clean main tree in `inside` does not show what it looks
like without that entry. Each cell ran once.

Evidence, one file per cell, each with the same fields as the P1 files:
`probes/evidence/tierminator-parallel-m2-cd-inside.json` and
`probes/evidence/tierminator-parallel-m2-cd-outside.json`.

| Question | Inside (`repo/.claude/worktrees/p2`) | Outside (`<base>/wt-p2`) | Evidence |
|---|---|---|---|
| Did every Bash command's cwd and `pwd` end in the worktree (`PWD_CD`, `TOPLEVEL`)? | **Yes for what each command saw.** `PWD_CD` is `/tmp/…/repo/.claude/worktrees/p2` (Git Bash's form of the worktree) and `TOPLEVEL` is the worktree (`C:/…/repo/.claude/worktrees/p2`). The later `git rev-parse --abbrev-ref HEAD` and `git status` ran after the same `cd` prefix and reported `probe/p2` and clean. **No** for the hook's `cwd` field: it is the main tree `repo` on all eight tool calls, because the shell never kept a `cd`. | **Yes**, the same: `PWD_CD` `/tmp/…/wt-p2`, `TOPLEVEL` `C:/…/wt-p2`. The hook `cwd` is `repo` on all eight tool calls. | both: `summary.report.PWD_CD`, `TOPLEVEL`, `BRANCH_END`, `summary.toolCwds` |
| Which `CLAUDE.md` was the worker given at the start (`MARKER_GIVEN`), and which one did a Read of the worktree's showed (`READ_MARKER`)? | `MARKER_GIVEN: main-tree`; `READ_MARKER: worktree`. The two differ, so the worker's start-of-run instructions come from the main tree and the Read reached the worktree's file. | The same: `main-tree` and `worktree`. | both: `summary.report.MARKER_GIVEN`, `READ_MARKER`; `post-tool` `tool_response.file.content` (`CLAUDE-MARKER: worktree`) |
| `B_TXT` | `b`. The worktree has the file that exists only at B. | `b`. | both: `summary.report.B_TXT`, `summary.checks.bTxtPresent` (true) |
| Did Read and Edit work with absolute paths, and where did the edit land? | **Yes.** Reads of `CLAUDE.md`, `b.txt` and `README.md` and the Edit all used `C:\…\.claude\worktrees\p2\…` and none failed (`EDIT: ok`, no `post-fail` event). `README.md` is edited in the worktree (`readmeEdited: true`) and not in the main tree (`readmeEdited: false`). | **Yes**, with `C:\…\wt-p2\…`; `EDIT: ok`. `README.md` edited in the worktree, not in the main tree. | both: `summary.report.EDIT`, `summary.toolCwds` (the targets), `summary.after.worktrees[*].readmeEdited`, `summary.after.main.readmeEdited`, `summary.checks.editInWorktree`, `mainEditFree` |
| Where the written file landed | **The worktree** (`probe-abs.txt` in `worktrees[1].probeFiles`, committed: worktree status empty). Not in the main tree (`mainProbeFiles` empty). `WRITE: ok`. | **The worktree**, the same. | both: `summary.report.WRITE`, `summary.after.worktrees[1].probeFiles`, `summary.after.mainProbeFiles` |
| The branch the commit landed on, and is it the head of `probe/p2`? | **`probe/p2`.** The commit `6155431` is the head of `probe/p2` (`worktrees[1].head`, `branches`), directly on W (`170ac9b`); `BRANCH_END: probe/p2`. | **`probe/p2`.** The commit `3d2d487` is its head, directly on W (`ce2254e`). | both: `summary.report.COMMIT`, `BRANCH_END`, `summary.after.branches`, `summary.after.worktrees[1].log`, `summary.checks.commitIsBranchHead` (true) |
| Main tree: branch and status | `work` at B (`d5ab082`), status empty; `work`'s log is B, A2, A (no probe commit). | `work` at B (`eaf4cd8`), status empty; the same log. | both: `summary.after.main`, `summary.checks.mainOnBAndClean` (true) |
| Permission or path errors? | **None recorded.** No `post-fail` event; the hook log has 8 `pre-tool` and 8 `post-tool` events and no failed tool call; `agentError` is null. Headless under `bypassPermissions` only, so a default-mode permission prompt for the outside path is **not determinable**. | **None recorded**, the same. | both: `hookLog` tag counts (`pre-tool`, `post-tool`), `summary.agentError` |

### Details

- **Every Bash command had the prefix.** Each cell has three Bash calls (`toolCwds`: steps 1, 6 and 7), and all
  three begin with `cd "C:/…/<worktree>" && `, in drive-letter form with forward slashes. No Bash call ran
  without it, and no `git -C` was used. The other five calls were Read (three), Edit and Write, each with a
  backslashed absolute drive-letter path that starts with the worktree path.
- **`HEAD_BEFORE` is W, not B.** The worktree was made by the runner on W (based on B), so the cell's
  `summary.checks.baseIsB: false` only says the worktree's HEAD is not B itself. `HEAD_BEFORE` equals W in both
  cells (`170ac9b`, `ce2254e`), which is the expected state for this setup and not a failure.
- **`pwd` was reported in the `/tmp/…` form and was not used.** `PWD_CD` is the Git Bash path, as in P1 and P2.
  The worker built none of its file-tool paths from it: every Read, Edit and Write target in `toolCwds` is the
  drive-letter path from the `Worktree:` line.
- **The hook `cwd` is the main tree throughout.** `SubagentStart` and `SubagentStop` `cwd`, and `cwd` on all
  eight tool-hook events in each cell, are the main tree `repo`, as in P2. No hook input names the worktree
  except the prompt, so a hook that needs the worktree reads it from the `Worktree:` line (**inferred** from the
  same absence as in P2).
- **The main session added no extra line to the worker's prompt.** `summary.agentCall.prompt` is exactly the
  fenced three lines in both cells, unlike `p2-outside`.
- **Inside's clean main tree depends on the exclude entry.** The runner listed `.claude/worktrees/` in
  `.git/info/exclude`; without it the main tree would show `?? .claude/` as in P1 (**inferred**). `outside` has no
  such directory (`claudeWorktreesDir: null`).
- **Cost.** $0.116 (`inside`) and $0.111 (`outside`); each cell ran once, so nothing here shows run-to-run
  variation.

## Base mechanism: second round

Six more cells, ten headless runs, run on 2026-10-20 (04:38 to 04:42 UTC) with Claude Code 2.1.304 on Windows,
$1.08 in all (per run $0.06 to $0.14). They use the same throwaway repo (A on `origin/main`, A2 on local `main`,
B at `work`'s HEAD), the same fenced main-session prompt, `bypassPermissions`, and the `m1-worker` probe agent,
except `m1-worker-reset`, which uses `m1-reset-worker`. Round one left four gaps. First, `worktree.baseRef: head`
was tried only as a `--settings` flag file (`m1-baseref-flag`), never as a project settings file. Second, each
mechanism ran once, so one run could not show a pattern. Third, the hook ordering is not documented: whether
Claude Code waits for a `SubagentStart` hook before the worker's first turn was **not determinable** from
`m1-substart-reset`, where a 54 ms reset ended 1.82 s before the first tool call. Fourth, a `WorktreeCreate` hook
replaces Claude Code's own creation, and a plugin that registers one cannot step aside for a given call,
so what Claude Code does when such a hook fails was unknown. The documentation
([worktrees](https://code.claude.com/docs/en/worktrees) and [hooks](https://code.claude.com/docs/en/hooks)) says
settings files can carry `worktree.baseRef`, that a `WorktreeCreate` hook replaces the default creation, and
describes hook events; that is documentation, not evidence. Only the measured rows below count.

Evidence, one file per run, each with the same fields as the P1 files (the cells with three runs have `-r1` to
`-r3` files): `probes/evidence/tierminator-parallel-m1-baseref-local.json`, `-m1-baseref-shared.json`,
`-m1-noremote.json`, `-m1-substart-slow-r1.json` to `-r3.json`, `-m1-worker-reset-r1.json` to `-r3.json` and
`-wt-decline.json`. The six checks are `summary.checks` without `resetFinishedBeforeFirstTool`, which only the
`m1-substart-slow` cell evaluates (it is `null` in the others): `baseIsB`, `bTxtPresent`, `mainOnBAndClean`,
`editInWorktree`, `mainEditFree` and `commitIsBranchHead`.

| Cell | Mechanism | Runs | Worktree base (`HEAD_BEFORE` vs B; `B_TXT`) | Checks (true of six) | Notes | Evidence |
|---|---|---|---|---|---|---|
| `m1-baseref-local` | `.claude/settings.local.json` in the repo (untracked, listed in `.git/info/exclude`) with `worktree.baseRef: "head"`; no `--settings` flag; a `PreToolUse` hook added `isolation: "worktree"`; `origin` exists | 1 | **B.** `HEAD_BEFORE` `a5407b3` = B; `B_TXT: b`. | 6 of 6 | The setting took effect from a project-local file (base B where P1 gave A). Commit `9b311f4` on `worktree-agent-af9e59b2f2424640f`, directly on B; main tree on `work` at B, status empty. | `m1-baseref-local.json`: `summary.checks`, `summary.report`, `summary.settingsSource`, `summary.after` |
| `m1-baseref-shared` | A committed `.claude/settings.json` (in A, so in every commit) with `worktree.baseRef: "head"`; no `--settings` flag; hook-added isolation; `origin` exists | 1 | **B.** `HEAD_BEFORE` `89cde58` = B; `B_TXT: b`. | 6 of 6 | The setting took effect from a committed project file. Commit `379684c` on `worktree-agent-a6564d74c75364cc9`, directly on B; main tree on `work` at B, status empty. | `m1-baseref-shared.json`: `summary.checks`, `summary.report`, `summary.settingsSource`, `summary.after` |
| `m1-noremote` | Hook-added isolation in a repo with no remote at all; no `baseRef` setting anywhere | 1 | **B.** `HEAD_BEFORE` `ee6121d` = B; `B_TXT: b`. | 6 of 6 | Not A2 (local `main`) either. Commit `ec3044d` on `worktree-agent-a10265bd7a277361d`, directly on B; main tree on `work` at B, status empty. | `m1-noremote.json`: `summary.remote` (false), `summary.settingsSource` ("none"), `summary.checks`, `summary.after.branches` |
| `m1-substart-slow` | The `SubagentStart` reset hook of `m1-substart-reset`, with `PROBE_RESET_DELAY_MS=5000` so the reset ends about 5.1 s after it starts; call-passed isolation | 3 (r1 to r3) | **B in 3 of 3.** `HEAD_BEFORE` `77b02c1`, `dace028`, `9cb850d` = B in each run; `B_TXT: b`. | 6 of 6 in each run | `resetFinishedBeforeFirstTool` is true in 3 of 3. The reset took 5071, 5098 and 5086 ms and moved the worktree from A to B each time (`before` A, `after` B, `status` 0). The first worker tool call came 1.41 s, 2.49 s and 1.54 s after the hook ended (6.52 s, 7.63 s and 6.66 s after `SubagentStart`). | `m1-substart-slow-r1.json`, `m1-substart-slow-r2.json`, `m1-substart-slow-r3.json`: `summary.checks`, `summary.resetTimings`, `summary.firstWorkerToolDelayMs`, `summary.report` |
| `m1-worker-reset` | Hook-added isolation; the `m1-reset-worker` agent gets `Base: <B>` on a prompt line and runs `git reset --hard <Base>` as its first step | 3 (r1 to r3) | **B in 3 of 3.** `HEAD_BEFORE` `93dfc4f`, `c801a65`, `8f20ea4` = B; `B_TXT: b`. The worker reads `HEAD_BEFORE` after its reset, so the base before the reset is not in the report. | 6 of 6 in each run | `RESET: ok` in 3 of 3. Each worktree branch then holds the probe commit, B, A2 (the reset moved it onto B). Main tree on `work` at B, status empty in each. | `m1-worker-reset-r1.json`, `m1-worker-reset-r2.json`, `m1-worker-reset-r3.json`: `summary.report`, `summary.checks`, `summary.agentCall`, `summary.after` |
| `wt-decline` | `isolation: "worktree"` with a `WorktreeCreate` hook that exits 1 with stderr `probe: declining to create a worktree` and creates nothing | 1 | **No worktree.** No worker ran, so `HEAD_BEFORE` and `B_TXT` do not exist. | 0 of 6 (all `null`: nothing was evaluated) | The Agent call returned an error. See Details. | `wt-decline.json`: `summary.agentError`, `summary.agentResult` (null), `summary.after`, `hookLog` |

### Details

- **`m1-baseref-local`.** No `Agent` error. `PostToolUse` on Agent carries `worktreePath` and `worktreeBranch`,
  and `cwd` is the worktree on `SubagentStart` and on the worker's tool hooks, as in `m1-baseref-flag`. Without a
  control run in this repo that has the file removed, that the setting caused B rests on P1 (A in all three cells
  with the default) and on `m1-baseref-plugin` (A) (**inferred**). Together with `m1-baseref-flag`, this answers
  the earlier "not determinable" for a project settings file: it works from `.claude/settings.local.json` here.
- **`m1-baseref-shared`.** No `Agent` error; the same hook fields as `m1-baseref-local`. The settings file is a
  tracked file, committed in A, and the main tree's status was empty at the end. The same caveat: no control run
  without the file in this repo (**inferred** from P1). A user-level settings file was not tried in any cell
  with evidence (the runner marks `m1-baseref-user` interactive only), so whether it works is **not
  determinable**.
- **`m1-noremote`.** No `Agent` error. The repo has no `origin` and no `origin/*` ref (`summary.after.branches`
  lists `main`, `work` and the worktree branch only), and no setting was supplied. The worktree started at the
  current HEAD, B, not at local `main` (A2). **Inferred:** with no remote default branch to base on, Claude
  Code falls back to HEAD, which would fit P1's inference that the default base is the remote's default branch.
  The cell did not run with a remote and without a setting, so it cannot say which of the two inputs decides.
- **`m1-substart-slow`.** No `Agent` error in any run. In all three runs the worker's first tool call came after the
  hook had ended and the worker's own `HEAD_BEFORE` was B, so Claude Code held the worker back until the 5 s hook
  was done: a first tool call at 6.5 to 7.6 s after `SubagentStart` fits a wait for the hook and is far above the
  1.5 to 1.7 s of the cells without a delay (`m1-baseref-local`, `-shared`, `-noremote`). That is measured for one
  hook, one delay length (5 s), a synchronous command hook and `bypassPermissions`; a longer delay, an async hook,
  and the hook's `timeout` setting were not tried. Whether Claude Code waits for the hook before the worker's
  first model turn, or only before its first tool call, is **not determinable**: the log records the first tool
  call only. Run r2 has 7 `pre-tool` events and r1 and r3 have 9; every run reports `COMMIT` and a clean status.
- **`m1-worker-reset`.** No `Agent` error. The worker's step 0 is the reset, so `HEAD_BEFORE` (step 2) is read after
  it; the worktree's base before the reset is not recorded in these files, so it is **not determinable** here
  (P1 and the `m1-substart-slow` `before` field give A, in cells with a remote). The prompt's `Base:` line was
  written by the runner from the repo's B, as `summary.agentCall.prompt` shows; the call had no `isolation`
  parameter, because the hook added it (`pre-agent:emit` in each log). The three runs took 2.5 to 3.2 s from
  `SubagentStart` to the first tool call and 13.5 to 14.7 s in all.
- **`wt-decline`.** The Agent call carried `isolation: "worktree"` and returned an **error**: `summary.agentError`
  and the main session's final result are both `WorktreeCreate hook failed: node "${CLAUDE_PLUGIN_ROOT}/scripts/wt.js"
  wt-create: probe: declining to create a worktree`, that is, the hook's stderr behind a fixed prefix. The tool
  result was a failure (`PostToolUseFailure`, `is_interrupt: false`, `duration_ms: 111`), so `PostToolUse` did not
  fire and there is no `tool_response`. **No worker ran**: `SubagentStart` and `SubagentStop` did not fire, no
  worker tool call was logged (`toolCwds` empty), and `agentResult` is null. **No worktree exists afterwards**: the
  repo has only its main worktree, `claudeWorktreesDir` is null (no `.claude/worktrees/` directory) and there is no
  `worktree-agent-*` branch, so Claude Code did not fall back to its own creation. The main tree stayed on `work`
  at B with empty status. **Hook events that fired**, in order: `UserPromptSubmit`, `PreToolUse` on Agent,
  `WorktreeCreate` (stdin keys `session_id`, `transcript_path`, `cwd`, `prompt_id`, `hook_event_name`, `name`;
  `name` was `agent-a88308cca16dedcc1`), `PostToolUseFailure` on Agent (111 ms after the call started) and `Stop`.
  The `WorktreeRemove` hook, also registered, did not fire. The main prompt told the session to reply with the
  error verbatim if the call failed, so a retry by the main session is **not determinable** from this cell; there
  was exactly one `PreToolUse` on Agent and one `WorktreeCreate`. The run cost $0.059 and the process exited 0.

## Pending: interactive cells

Interactive dispatch runs in the background and in the user's permission mode, and P2's outside placement
asks for permission for a path outside the project, so these cells are not covered by the headless runs:

| Cell | Why it needs an interactive run | Steps |
|---|---|---|
| `p1-isolation-commit` | Interactive Agent calls run in the background ([dispatch findings](tierminator-agent-dispatch-findings.md#interactive-sessions-always-in-the-background)). Unknown: whether `PostToolUse` (which returns `async_launched` at once) still carries `worktreePath`/`worktreeBranch`, and whether isolation behaves the same in the user's permission mode. | 1. `node probes/tierminator-parallel/p1-p2-runner.js --prepare p1-isolation-commit` 2. Run the printed lines in a new pwsh terminal. 3. Paste the printed prompt. 4. Wait for the background report. 5. `/exit`. 6. `node probes/tierminator-parallel/p1-p2-runner.js --collect p1-isolation-commit` 7. Commit `probes/evidence/tierminator-parallel-p1-isolation-commit-interactive.json` and update this doc. |
| `p1-hook-isolation` | Whether `updatedInput` with no `permissionDecision` still applies the isolation, and asks for no extra permission, outside `bypassPermissions`. | The same steps with `p1-hook-isolation`; commit `probes/evidence/tierminator-parallel-p1-hook-isolation-interactive.json`. |
| `p2-outside` | Writing to a worktree outside the project directory asks for permission in the default mode, which a headless `bypassPermissions` run cannot show. | The same steps with `p2-outside`; commit `probes/evidence/tierminator-parallel-p2-outside-interactive.json`. |

## Recommendation

**M1, with `worktree.baseRef: "head"` in a settings file the user owns.** Both M1 and M2 pass their rules, and the
spec prefers M1, so the recommendation is M1. The chosen mechanism is the documented `worktree.baseRef: "head"`
key in a project settings file (`m1-baseref-local`, `m1-baseref-shared`); the plugin `settings.json` mechanism,
which would need no user action, did not take effect (`m1-baseref-plugin`). M2 also passes and is the conflict
resolver's route. All of this was measured headless under `bypassPermissions`; the first-round cells ran once,
the second-round fallback cells three times each.

The rules. An M1 mechanism passes when all hold: `HEAD_BEFORE` is B and `B_TXT` is `b`; the README edit and
`probe-abs.txt` are in the worktree and not in the main tree; the worker's commit is the head of a branch in the
worktree; the main tree is on B with empty status; and a hook sees the worktree path. M2 passes when all hold:
`PWD_CD` and `TOPLEVEL` are the worktree; `READ_MARKER` is `worktree`; the commit is the head of `probe/p2`; the
main tree is on B with empty status; and the edit and `probe-abs.txt` are in the worktree.

| Mechanism and cell | Base is B (`HEAD_BEFORE`, `B_TXT`) | Edit and write in the worktree only | Commit is the head of a branch in the worktree | Main tree on B, status empty | A hook sees the worktree path | Verdict |
|---|---|---|---|---|---|---|
| M1 `m1-baseref-flag` (`--settings`) | PASS: B, `b` | PASS | PASS | PASS | PASS: `PostToolUse` on Agent `tool_response.worktreePath`; `cwd` on `SubagentStart` | **PASS** |
| M1 `m1-baseref-plugin` (plugin `settings.json`) | **FAIL**: A, `B_TXT` missing | PASS | PASS | PASS | PASS: same fields | **FAIL** |
| M1 `m1-worktree-hook` (`WorktreeCreate`) | PASS: B, `b` | PASS | PASS | PASS | PASS: `tool_response.worktreePath` and `cwd` on `SubagentStart` (no `worktreeBranch`) | **PASS** |
| M1 `m1-substart-reset` (`SubagentStart` reset) | PASS: B, `b` | PASS | PASS | PASS | PASS: `tool_response.worktreePath` and `worktreeBranch`; `cwd` on `SubagentStart` | **PASS** |

| Mechanism and cell | `PWD_CD`, `TOPLEVEL` are the worktree | `READ_MARKER` is `worktree` | Commit is the head of `probe/p2` | Main tree on B, status empty | Edit and `probe-abs.txt` in the worktree only | Verdict |
|---|---|---|---|---|---|---|
| M2 `m2-cd-inside` (`repo/.claude/worktrees/p2`) | PASS | PASS | PASS (`6155431`) | PASS | PASS | **PASS** |
| M2 `m2-cd-outside` (`<base>/wt-p2`) | PASS | PASS | PASS (`3d2d487`) | PASS | PASS | **PASS** |

For the M1 cells the hook field that carries the worktree path is `tool_response.worktreePath` on `PostToolUse`
for the Agent call, and `cwd` on `SubagentStart` and `SubagentStop`. The three passing M1 cells also pass in the
earlier P1 sense (isolation applies to the plugin agent, and the call parameter or a `PreToolUse` hook's
`updatedInput` applies it), so H4 can add `isolation: "worktree"` and need not deny a call without it. In the M2
cells no hook field names the worktree (`cwd` is the main tree throughout), so it comes from the `Worktree:` line.

**The second-round rules.** Each rule is applied to the table in "Base mechanism: second round". The six checks
are `baseIsB`, `bTxtPresent`, `mainOnBAndClean`, `editInWorktree`, `mainEditFree` and `commitIsBranchHead`.

| Rule | Question | Result | Evidence |
|---|---|---|---|
| R1 | A settings file works: `m1-baseref-local` or `m1-baseref-shared` has all six checks true | **PASS**, both cells (6 of 6 each); the user-level file is still pending | `m1-baseref-local.json`, `m1-baseref-shared.json` |
| R2 | No remote needs nothing: `m1-noremote` has all six checks true | **PASS** (6 of 6, no `baseRef` setting, no remote) | `m1-noremote.json` |
| R3 | The `SubagentStart` reset is reliable: all three `m1-substart-slow` runs have all six checks true and `resetFinishedBeforeFirstTool` true | **PASS** (3 of 3 runs) | `m1-substart-slow-r1.json`, `-r2.json`, `-r3.json` |
| R4 | The worker's self-reset is reliable: all three `m1-worker-reset` runs have all six checks true | **PASS** (3 of 3 runs) | `m1-worker-reset-r1.json`, `-r2.json`, `-r3.json` |
| R5 | A `WorktreeCreate` hook is viable: not viable if `wt-decline` shows the Agent call failing, because a plugin hook would take over every worktree creation in every session and cannot step aside; viable only if Claude Code fell back to its own creation | **FAIL**: the Agent call returned an error (`WorktreeCreate hook failed: ...`), no worker ran and no worktree exists, so Claude Code did not fall back | `wt-decline.json` |

**The primary mechanism: `worktree.baseRef: "head"` in a settings file the user owns (R1).** R1 holds, so the
documented key is the primary route. The user adds this to a settings file of their own:

```json
{
  "worktree": {
    "baseRef": "head"
  }
}
```

in `.claude/settings.json` in the repo (committed and shared; `m1-baseref-shared`) or in
`.claude/settings.local.json` (untracked, kept out of the commit with `.git/info/exclude`; `m1-baseref-local`).
The worktree is then based at the current HEAD, B, instead of `origin/main`, A. A user-level file
(`~/.claude/settings.json`) is **not determinable**: no cell with evidence tried it. The safety net is
tierminator's start check, which reads the user, project and local settings and the repo's remote, together with
the fatal `WORKTREE BASE:` judgment: a worker whose base is not the wave base is judged a failure, never accepted.
The second case needs no setting: with no remote at all, Claude Code based the worktree on HEAD (R2,
`m1-noremote`), so a repo without a remote runs parallel M1 without `baseRef`. Which of the two inputs decides
(no remote or no setting) is not separated by that cell, since it did not run with a remote and without a setting
(**inferred** from P1). Both routes keep the preconditions the earlier cells showed:

- **`.git/info/exclude`.** Every re-run cell listed `.claude/worktrees/` in `.git/info/exclude`, so the main
  tree's empty status depends on it; without it the main tree shows `?? .claude/` as in P1 and fails
  tierminator's clean-tree check (**inferred** from `git.problem`).
- **The hook-added isolation.** The `PreToolUse` hook adds `isolation: "worktree"` through `updatedInput` with
  no `permissionDecision`, as in `p1-hook-isolation`.

**Fallbacks for a user who sets nothing (R3 and R4).** Both passed, and both are weaker than the setting.

- **R3, the `SubagentStart` reset** (`m1-substart-slow`). A hook that resets the worktree to B finished before the
  worker's first tool call in 3 of 3 runs, even with a 5 s delay (5071, 5098 and 5086 ms), and the worker's own
  `HEAD_BEFORE` was B each time. Residual risk: the hook ordering is undocumented, and it is measured in 3 runs
  for one hook, one delay length, a synchronous command hook and `bypassPermissions`; whether Claude Code waits
  for the hook before the worker's first model turn, or only before its first tool call, is not determinable.
- **R4, the worker's self-reset** (`m1-worker-reset`). The worker ran `git reset --hard <Base>` as its first step
  in 3 of 3 runs, with `RESET: ok` and base B in each. Residual risk: it depends on the worker obeying the
  instruction, and the worktree's base before the reset is not recorded in these files.

**Not viable: the `WorktreeCreate` hook (R5).** `m1-worktree-hook` passed its cell in round one, but a plugin
hook replaces Claude Code's own creation for every worktree in every session and cannot step aside for a given
call, and `wt-decline` shows that when it fails the Agent call fails with no fallback. It is not recommended.

**Open decision:** whether a fallback (R3 or R4) runs automatically when the start check finds no `baseRef`
setting and a remote exists, or the run refuses and tells the user to add the setting. This is not decided here.

**The M2 worker rules, if M2 is used.** Both placements passed, **inside** and **outside**. The worker rules to
copy are the `m2-worker` agent's (`tierminator-parallel-probe:m2-worker`, quoted in the M2 re-run section): a
`cd "<Worktree>" && ` prefix on every Bash command, an absolute drive-letter path that starts with the worktree
for every file tool (relative paths land in the main tree), and never a path built from Git Bash's `/tmp/…`
form of `pwd`. Inside (`<repo>/.claude/worktrees/…`, with that directory in `.git/info/exclude`) needs no
permission for a path outside the project, which outside has not been shown to avoid (the interactive cells are
pending).

**Where the conflict resolver runs.** The resolver needs an existing worktree with a pick in progress. It uses M2
if M2 passes, and M2 does, so it runs in the integration worktree through a `Worktree:` line under the
`m2-worker` rules. (Had M2 failed, there would have been no resolver route: the `WorktreeCreate` hook fails R5.)

**Spec assumptions the evidence refutes**, and the packages to edit (see [`parallel/README.md`](parallel/README.md)):

- **M1 places the worker at the wave base.** [The dispatch of one task](tierminator-parallel-spec.md#the-dispatch-of-one-task)
  and [Concepts](tierminator-parallel-spec.md#concepts) (wave base) assume it; by default Claude Code bases the
  worktree on `origin/main` (A). It holds only with `worktree.baseRef: "head"` in a settings file the user owns
  (or in a repo with no remote, or one of the fallbacks R3 and R4), which tierminator must check. Edit WP-08 (`expectedCall` placement) and WP-09
  (H4 `pre`, the slot's recorded head).
- **A `Worktree:` line is enough for M2.** [The dispatch of one task](tierminator-parallel-spec.md#the-dispatch-of-one-task)
  says the worker "must treat it as its working directory"; a lone `cd` does not persist, Bash and relative
  file paths stay in the main tree, and the commit lands on the run branch. The `m2-worker` rules (a `cd` prefix
  on every Bash command, absolute drive-letter file paths) fix that. This also breaks
  [Setup](tierminator-parallel-spec.md#setup) (setup would run in the main tree) and
  [Judging a task](tierminator-parallel-spec.md#judging-a-task) (the "worker still on its own branch" check
  must read the worktree's HEAD, not the main tree's). Edit WP-09 (the tier agents' Parallel section must
  state the `cd` prefix and absolute-path rules) and WP-08 (the `Worktree:` line in drive-letter form).
- **The main tree stays clean for the whole run.** [Concepts](tierminator-parallel-spec.md#concepts) (run
  branch) and [Integration](tierminator-parallel-spec.md#integration) step 5 rely on it; under M1 the
  `.claude/worktrees/` directory shows as untracked unless it is excluded. Edit WP-06 (worktree helpers: add
  the exclude entry) and WP-10 (starting waves).
- **Not refuted, but to keep in mind:** under M2 the worker is given the main tree's `CLAUDE.md`, not the
  worktree's, and under M1 `SubagentStop`'s `cwd` is the worktree, not the project. H4 already prefers the
  state's recorded `cwd` (`s.cwd ?? input.cwd`), so it is not misled (**inferred** from
  `plugins/tierminator/scripts/h4-dispatch.js`); WP-09 must keep that for slot judging.

## Not measured

- **The interactive cells** (see Pending above): background dispatch, the user's permission mode, and
  permission prompts for an outside worktree. None of the M1 or M2 re-run cells ran interactively.
- **PowerShell-tool workers.** Every worker ran its commands through the Bash tool. The Claude Code documentation
  says the `cd` reset applies to the PowerShell tool too, but no cell used it.
- **The `SubagentStart` cwd of non-isolated agents.** In the M2 cells the worker was not isolated and the hook's
  `cwd` was the main tree; that this holds for every non-isolated agent was not tried.
- **The `WorktreeRemove` hook.** It was registered in `m1-worktree-hook` and did not fire, so whether it would on
  cleanup is unknown.
- **Whether Claude Code removes an isolated worktree that has no changes at all**; the no-commit worker left an
  untracked file.
- **Several isolated Agent calls at once** (concurrent worktree creation), which belongs to P3 and P6.
- **Platforms other than Windows**: the `/tmp` path mismatch is Git Bash's, and may not occur elsewhere.
