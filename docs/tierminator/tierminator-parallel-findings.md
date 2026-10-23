# tierminator parallel: placing a subagent in a Git worktree

Probes P1 and P2 of [`tierminator-parallel-spec.md`](tierminator-parallel-spec.md#probes) and their re-runs
(M1 with four ways to fix the base, M2 with `cd` prefixes), a second round on the base mechanism (four single
runs and six repeat runs) and a third round on writing the setting during the session (six repeat runs), run on
2026-10-19 and 2026-10-20 (03:43 to 04:42 UTC and 18:05 to about 18:15 UTC on 2026-10-20) with Claude Code
2.1.304 on Windows, headless, 27 runs, $3.11 in all ($0.61 for the five P1 and P2 cells, $0.48 for the four M1
cells, $0.23 for the two M2 cells, $1.08 for the ten second-round runs, $0.72 for the six third-round runs), and
then a round on option C, tierminator making the worktrees (38 runs, about $5.4, one of them interactive; see
"Option C" below, which is what the design uses). The re-runs changed the runner's prompt:
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
- `probes/evidence/tierminator-parallel-m1-baseref-local.json`: M1 with `worktree.baseRef: "head"` in an
  untracked `.claude/settings.local.json`.
- `probes/evidence/tierminator-parallel-m1-baseref-shared.json`: M1 with the same setting in a committed
  `.claude/settings.json`.
- `probes/evidence/tierminator-parallel-m1-noremote.json`: M1 in a repo with no remote and no setting.
- `probes/evidence/tierminator-parallel-wt-decline.json`: a `WorktreeCreate` hook that exits 1 and creates nothing.
- `probes/evidence/tierminator-parallel-m1-substart-slow-r1.json`, `-r2.json`, `-r3.json`: three runs of the
  `SubagentStart` reset with a 5 s delay.
- `probes/evidence/tierminator-parallel-m1-worker-reset-r1.json`, `-r2.json`, `-r3.json`: three runs of the
  worker resetting itself to the `Base:` line.
- `probes/evidence/tierminator-parallel-m1-settings-midsession-r1.json`, `-r2.json`, `-r3.json`: three runs
  in which a hook writes the untracked `.claude/settings.local.json` (`worktree.baseRef: "head"`) in the
  `PreToolUse` call on Agent, about 0.5 s before the worktree is made.
- `probes/evidence/tierminator-parallel-m1-settings-early-r1.json`, `-r2.json`, `-r3.json`: three runs in
  which the hook writes the same file on `UserPromptSubmit`, 2.7 to 10.7 s before the worktree is made.

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

## Third round: writing the setting during the session

Two cells, six headless runs, run on 2026-10-20 (18:05 to about 18:15 UTC) with Claude Code 2.1.304 on Windows,
$0.72 in all (per run $0.11 to $0.14). The question: tierminator cannot pass `--settings` to the user's session, so
can it supply `worktree.baseRef: "head"` itself, by writing the untracked `.claude/settings.local.json` after the
session has started? Both cells use the `m1-baseref-local` repo (A on `origin/main`, A2 on local `main`, B at
`work`'s HEAD, `.claude/settings.local.json` and `.claude/worktrees/` listed in `.git/info/exclude`, so the
settings file does not exist until the hook writes it), the `m1-worker` agent, hook-added isolation and
`bypassPermissions`. They differ only in when the hook writes the file (`PROBE_WRITE_SETTINGS`). The checks are
the same six as in the second round.

| Cell | When the file is written | Runs | Worktree base (`HEAD_BEFORE` vs B; `B_TXT`) | Checks (true of six) | Evidence |
|---|---|---|---|---|---|
| `m1-settings-midsession` | In the `PreToolUse` hook on the Agent call, 521 to 533 ms before `SubagentStart` | 3 | **A in 3 of 3.** `HEAD_BEFORE` `835199e`, `eacfee6`, `7425404` = A; `B_TXT: missing`. | 4 of 6 in each run (`baseIsB`, `bTxtPresent` false) | `m1-settings-midsession-r1.json`, `-r2.json`, `-r3.json`: `summary.report`, `summary.base`, `summary.checks`, `hookLog` (`settings-written`, `sub-start`) |
| `m1-settings-early` | In the `UserPromptSubmit` hook, 2695, 10748 and 4361 ms before `SubagentStart` | 3 | **B in 3 of 3.** `HEAD_BEFORE` `2b9cb66`, `0b18682`, `6d79d3c` = B; `B_TXT: b`. | 6 of 6 in each run | `m1-settings-early-r1.json`, `-r2.json`, `-r3.json`: the same fields |

### Details

- **A settings file written during the session takes effect, if it is written early enough.** `settings-written`
  precedes the Agent call in every run of both cells (the file did not exist when the session started). Written
  2.7 s or more before the worktree is made, it takes effect in 3 of 3 runs; written about 0.5 s before, it does
  not (A in 3 of 3 runs). So Claude Code re-reads the file while the session runs, and the 0.5 s write
  was too late for it to be seen. **Inferred:** a file watcher with a delay between 0.5 s and 2.7 s; the
  threshold is not measured, and neither is any gap between those two. Only `bypassPermissions` headless runs were
  made: whether an interactive session re-reads settings the same way is **not determinable** here.
- **No control run.** There is no run of this repo without the file written. That the file caused B rests on P1
  (A in all three default cells), `m1-baseref-plugin` (A) and the `midsession` runs (A with the file written
  too late) (**inferred**).
- **Git state.** In all six runs the main tree stayed on `work` at B with empty status (the settings file is in
  `.git/info/exclude`), the worker's commit was the head of a `worktree-agent-*` branch, and the edit and
  `probe-abs.txt` were in the worktree only.
- **This corrects an earlier reading.** The `midsession` result alone looked like "Claude Code reads settings at
  session start". The `early` runs show it does not; the 0.5 s gap was the difference.
- **What it does not show.** That the user's own files are safe to write to: a real `.claude/settings.local.json`
  may already hold keys, and the key would have to be merged in and removed again after the run. That is a design
  question, not a measurement (see the decision in the Recommendation).

## Option C: tierminator makes the worktrees

The design review asked whether the base machinery of M1 (the `baseRef` setting, writing it, the pause, the gate,
the retry, the serial fallback) could go if tierminator made each task's worktree itself, as it already does for
the conflict resolver (M2), and the worker were an ordinary, non-isolated subagent. **Option C** is that: a hook
makes a worktree at the wave base for each slot before the Agent call, the worker is told its path on a
`Worktree:` line and works there with the M2 rules, and nothing sets `isolation` or `baseRef`. It was tested with
realistic work, 38 runs on 2026-10-20, about $5.4 in all ($3.07 for the 24 retained runs; the rest for a first
batch of 12 and a smoke run discarded for a flaw in the fixture, below, and one replaced run) with Claude Code 2.1.304 on Windows, by `probes/tierminator-parallel/c-runner.js`.

**The fixture.** A throwaway Node repo (three modules with tests, a `CLAUDE.md`, branch `work` at commit B) and a
tasks file outside the repo. The main session (`claude -p --model sonnet`) makes three Agent calls in one message,
one per task (`T01` `clamp` in `src/math.js`, `T02` `slugify` in `src/strings.js`, `T03` `chunk` in `src/list.js`,
each with its tests and a `Verify:` of `node --test`), to a probe copy of a real tierminator tier agent
(`haiku-high` or `sonnet-medium`, the real file with a Parallel section added; the agent text is in each evidence
file as `agentFile`). The message has the lines the work packages would send: `Parallel: yes`, `Tasks file:`,
`Plan:`, `Task:` and `Worktree:` (an absolute drive-letter path inside `.claude/worktrees/`, listed in
`.git/info/exclude`). The Agent calls carry no `isolation`. The Parallel section says: a `cd "<WT>" && ` prefix on
every Bash command and no PowerShell; absolute paths starting with WT for Write, Edit and Read; Glob and Grep with
`path` set to WT; no path built from `pwd`; commit on the branch already checked out in WT. Each task has 8 to 10
tool calls and takes 15 to 38 s. A run counts as done when each worktree holds exactly one commit since B with the
`Tierminator-Task` and `Tierminator-Plan` trailers, only the task's two files changed, a clean status, passing
tests and the right branch, no task's function exists in another worktree or in the main tree, and the main tree is
still on B with an empty status. A first batch of 12 runs was discarded: T02 said "letters or digits" without
saying ASCII or Unicode, and haiku followed tierminator's own rule for two materially different readings (report
`FAILED` with the question, change nothing) in 4 of its 6 runs. The wording was fixed and the batch rerun; no
evidence file of the first batch remains.

Evidence, one file per run in `probes/evidence/` (24 files, $3.07):
- `tierminator-parallel-c-haiku-r1.json` to `-r3.json`, `c-sonnet-r1.json` to `-r3.json`: the runner makes the
  worktrees; `bypassPermissions`; no guard hook.
- `c-haiku-guard-r1.json` to `-r3.json`, `c-sonnet-guard-r1.json` to `-r3.json`: a `PreToolUse` hook on the Agent
  call makes the worktrees (`git worktree add -b probe/<task> <path> <B>`), and a guard hook denies tool calls that
  would reach the main tree.
- `c-haiku-norules-r1.json`, `-r2.json`, `c-haiku-norules-guard-r1.json`, `-r2.json`: the worker has no Parallel
  section (it does not know what the `Worktree:` line means), without and with the guard.
- `c-haiku-interactive.json`: one interactive session in the default permission mode, answered by the user.
- `c-haiku-default.json`: the default permission mode, headless; a `PermissionRequest` hook answers "allow" and logs
  each request.
- `c-haiku-rules.json`: `acceptEdits` mode, headless, nobody answering, with the allow rules a user would add
  (`Bash(cd:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git status:*)`, `Bash(git rev-parse:*)`,
  `Bash(node --test:*)`, a `Read` of the tasks file).
- `c-haiku-gitc-rules.json`: the same with the worker told to run git as `git -C "<WT>" ...` and the rule
  `Bash(git -C:*)`.
- `c-haiku-m1-rules.json`: M1 for comparison, with the same allow rules and `worktree.baseRef: "head"` in the
  local settings (isolation `"worktree"`, no `Worktree:` line, no `cd` prefix).
- `c-haiku-auto-r1.json` to `-r3.json`: `--permission-mode auto`, no rules, nobody answering.

| Cell | Runs | Permission setup | Result |
|---|---|---|---|
| `c-haiku`, `c-sonnet` | 3 + 3 | `bypassPermissions` | **6 of 6 done.** Workers overlapped in time in every run. No Bash command without the `cd` prefix, no write outside the worktree, no Glob or Grep without a path, no PowerShell call, no guard involved. |
| `c-haiku-guard`, `c-sonnet-guard` | 3 + 3 | `bypassPermissions` | **6 of 6 done.** Hook-made worktrees: 18 of 18 created (`status` 0). The three hook processes ran one after another (62 to 109 ms each, never overlapping), so concurrent `git worktree add` was not exercised. The guard denied nothing. |
| `c-haiku-norules`, `c-haiku-norules-guard` | 2 + 2 | `bypassPermissions` | **4 of 4 done**, the main tree untouched. Without the guard one `cd "<wt>" 2>&1 && ...` call did not match the rule form (harmless). With it the guard denied 5 calls (a Grep aimed at the main tree's `src`; Bash `cd` and Grep paths in Git Bash's `/tmp/...` form), and each denial was followed by a compliant retry. |
| `c-haiku-interactive` | 1 | default mode, user answers | **done** (3 DONE, 3 commits, main tree clean). Not recorded by hand; hook timing shows 12 waits: every Bash call took 3.1 to 5.9 s (0.3 to 1.1 s headless), each worker's first Edit 1.8 to 3.5 s (the second 0.14 s), the Read of the tasks file outside the project 3.6 to 5.5 s. Reads inside the worktree were instant. |
| `c-haiku-default` | 1 | default, hook allows | **done**, with 15 permission requests: 3 Reads (the tasks file), 6 Edits, 6 Bash (every `cd "<wt>" && ...` command). The `cd ... && node --test` requests suggested the rule `Bash(node --test)`; the 3 `cd ... && git add ... && git commit` requests had **no suggested rule**. |
| `c-haiku-rules` | 1 | `acceptEdits` + allow rules, nobody answers | **0 of 3 committed (3 FAILED).** Edits and `cd ... && node --test` ran with no request; every `cd "<wt>" && git add -A && git commit ...` still needed approval (no suggestion), and the workers' `git -C "<wt>" ...` fallback was refused too (6 requests, suggestions only for the `git -C` forms). The work was done and uncommitted. (A first run with `--permission-mode default` denied the Edits instead, because the flag overrides the settings file's `defaultMode`; it was replaced.) |
| `c-haiku-gitc-rules` | 1 | `acceptEdits` + rules incl. `Bash(git -C:*)` | **3 of 3 done**, one commit each. Two workers first tried `cd ... && git add ... && git commit` (2 requests, refused) and then used `git -C`. |
| `c-haiku-m1-rules` | 1 | `acceptEdits` + the same rules | **3 of 3 done, 0 permission requests.** M1 needs no `cd` and no `git -C`; the ordinary rules cover `git add` and `git commit`. |
| `c-haiku-auto` | 3 | `--permission-mode auto`, no rules, nobody answers | **3 of 3 done, 0 permission requests**; 25 to 26 worker tool calls per run, none by the main session; the workers' hooks carried `permission_mode: auto`. |

### Details

- **Placement.** In every run that completed, each worker worked only in its own worktree. 18 of 18 headless
  bypass runs and the 3 auto runs left the main tree on B with an empty status and none of the three functions in
  it. Workers in `c-haiku-norules` worked in the worktrees from the `Worktree:` line alone.
- **Concurrency.** The three foreground workers overlapped in time in every headless run (3 tasks in 16 to 38 s of
  worker wall time). Hook-made worktrees: see the table. Whether background (interactive) dispatch overlaps the
  same way is not shown by these runs beyond the one interactive run.
- **The guard.** It works for a subagent's tool calls: `permissionDecision: "deny"` from a `PreToolUse` hook
  reached the worker, which corrected itself. It judges by path only (a root test on the worktrees directory), so
  it cannot stop a worker using another slot's worktree. It denies PowerShell outright.
- **Permissions.** This is why the permission-mode runs exist. The unlistable request is the compound
  `cd "<dir>" && git ...` form; why Claude Code treats it that way is not measured here. A person who answers
  every request can finish the run (`c-haiku-interactive`); a run with nobody to answer cannot commit.
  `bypassPermissions` and auto mode ask nothing.
- **Auto mode and `SubagentStop`.** In the 3 auto runs `SubagentStop` carried no `last_assistant_message` key at
  all (the bypass and default runs have it). Tierminator's serial hooks judge from the report; whether its
  existing paths (accept on the commit, ask once for the report) already cover this was not checked.
- **Cost.** A three-worker run is $0.08 to $0.09 on haiku-high and $0.25 to $0.29 on sonnet-medium, plus the
  main session. The runs differ from real plans: 8 to 10 tool calls per task against the 30 to 60 turns of real
  tasks, small files, no setup commands, no build.

## P3: several Agent calls in one message

Probe P3 of the spec: do three Agent calls made in one message run at the same time, and do their `PreToolUse`
hooks on the Agent call (where H4 `pre` makes the worktree) overlap? Two cells, six headless runs, run on
2026-10-20 (21:03:50 to 21:07:30 UTC) with Claude Code 2.1.305 on Windows, $0.57 in all ($0.26 for
`p3-slow-hooks`, $0.31 for `p3-bg`; per run $0.084 to $0.112). Both are `c-haiku-guard` of the option C round
(same fixture, same three tasks, `haiku-high` probe worker with the Parallel section, the guard hook, hook-made
worktrees, `bypassPermissions`), made by `probes/tierminator-parallel/c-runner.js`, with one change each:

- `p3-slow-hooks`: the worktree hook (`probe-plugin/scripts/mkwt.js`) waits 3 s (`PROBE_MKWT_DELAY_MS=3000`)
  **before** its `git worktree add`, so each hook process lasts about 3.1 s. The calls run in the foreground
  (`run_in_background false`).
- `p3-bg`: the same slow hook, with the main session told to pass `run_in_background true`, the headless stand-in
  for interactive dispatch, which is always in the background
  ([dispatch findings](tierminator-agent-dispatch-findings.md#interactive-sessions-always-in-the-background)).

The comparison is `c-haiku-guard-r1` to `-r3` (Claude Code 2.1.304, the same setup with the hook's own 62 to 109 ms).
The runner's `analysis.mkwt` holds each hook process's `pid`, `startedAt` and `endedAt` (the delay included);
`analysis.mkwtTiming` (written for the P3 cells only) holds the `durationsMs`, the `gapsMs` between one hook's end
and the next one's start (negative when they overlap), `overlap`, and `subagentStartAfterHookEndMs`;
`analysis.overlap` holds the workers' `allOverlap` (every `SubagentStart` before the first `SubagentStop`),
`wallSeconds` and `perAgentSeconds`; `analysis.postAgent` holds `status` and `isAsync` of each `PostToolUse` on
the Agent call; `analysis.prompts` holds every `UserPromptSubmit` with its kind. For `c-haiku-guard` the gaps and
the `SubagentStart` delays below are computed from `analysis.mkwt` and `analysis.agents`, which its files have.

Evidence:
- `probes/evidence/tierminator-parallel-p3-slow-hooks-r1.json`, `-r2.json`, `-r3.json`.
- `probes/evidence/tierminator-parallel-p3-bg-r1.json`, `-r2.json`, `-r3.json`.
- For comparison, `probes/evidence/tierminator-parallel-c-haiku-guard-r1.json`, `-r2.json`, `-r3.json`.

All nine runs ended with every task done and the main tree untouched (`verdicts.allDone` and
`verdicts.mainUntouched` true), and every `git worktree add` exited 0.

| Question | Answer | Evidence |
|---|---|---|
| Do the workers overlap in time, in the foreground? | **Yes, in 6 of 6 runs.** Every `SubagentStart` came before the first `SubagentStop`. `c-haiku-guard`: 15.9 to 17.6 s from the first start to the last stop, each worker 13.1 to 15.5 s. `p3-slow-hooks`: 17.1 to 25.2 s, each worker 13.9 to 22.6 s. | `c-haiku-guard-r*`, `p3-slow-hooks-r*`: `analysis.overlap` (`allOverlap`, `wallSeconds`, `perAgentSeconds`) |
| Do they overlap with headless background dispatch? | **Yes, in 3 of 3 runs**: 16.1 to 17.8 s from the first start to the last stop, each worker 12.8 to 15.4 s, about what the foreground runs took. | `p3-bg-r*`: `analysis.overlap` |
| Do the three `PreToolUse` hook processes overlap? | **Only when the hook is slow.** `c-haiku-guard`: three processes (three `pid`s per run) of 62 to 109 ms, one after another; each started 755 to 1262 ms after the previous one ended. `p3-slow-hooks` and `p3-bg`: three processes of 3067 to 3103 ms, a different `pid` each, and each started while the previous one was still running (`gapsMs` -1622 to -1995 ms, `overlap: true` in 6 of 6). For 0.5 to 0.8 s of each run all three ran at once. | `c-haiku-guard-r*`: `analysis.mkwt`; `p3-*`: `analysis.mkwt`, `analysis.mkwtTiming` |
| What spaces the hooks apart? | Not the hooks. The second and third hooks started 833 to 1330 ms after the one before in `c-haiku-guard`, and 1086 to 1469 ms after it with the 3 s hook, so a slow hook did not hold back the next call's hook. **Inferred:** Claude Code starts each call's `PreToolUse` as the model's message reaches that call, about a second apart here. | `analysis.mkwt` (`startedAt`), `hookLog` (`pre-agent`) |
| Does a slow hook delay its own worker? | **Yes, by its full length.** `SubagentStart` came 96 to 155 ms after the worker's own hook ended in all nine runs (101 to 143 ms in the P3 cells), so each worker waited for its hook. The runs took 33.3 to 37.6 s (`p3-slow-hooks`) against 28.6 to 29.7 s (`c-haiku-guard`): about 3 s more, not 9, because the hooks overlapped (**inferred**). | `analysis.mkwtTiming.subagentStartAfterHookEndMs`; `elapsedSeconds` |
| Does a slow hook delay the next call's hook? | **No**, as above: the next hook started about 1.1 to 1.5 s after the previous one started, while it was still running. | `analysis.mkwtTiming.gapsMs` |
| Did the `git worktree add` commands themselves run at once? | **No.** The delay is before the command, so each `git worktree add` ran in the last 67 to 103 ms of its hook, and those windows were about a second apart. Concurrent `git worktree add` is still not exercised. | `analysis.mkwt` (`startedAt`, `endedAt`, `delayMs`); `probe-plugin/scripts/mkwt.js` |
| What does `PostToolUse` on the Agent call return with background dispatch? | `status: "async_launched"`, `isAsync: true`, in 9 of 9 calls, with `agentId`, `description`, `resolvedModel`, `prompt`, `outputFile`, `canReadOutputFile` and `canContinueAgent: true`. It fired at the same time as that worker's `SubagentStart` (0 to 7 ms apart), right after the slow hook ended. In the foreground (`p3-slow-hooks`) it was `status: "completed"` with no `isAsync`, 110 to 167 ms after that worker's `SubagentStop`. | `p3-bg-r*`, `p3-slow-hooks-r*`: `analysis.postAgent`; `p3-bg-r1`: `hookLog` (`post-agent` `tool_response`) |
| Which prompts reached the main session in `p3-bg`? | The typed prompt, then **one `<task-notification>` per worker** (3 per run, no `<agent-message>`: no worker called `SubagentHandback`). Each names one task: `<task-id>` (the worker's `agent_id`, the same as `agentId` in `PostToolUse`), `<tool-use-id>`, `<output-file>`, `<status>completed</status>`, `<summary>Agent "task T01" finished</summary>` (the call's description), a `<note>`, the worker's report in `<result>`, and `<usage>`. The main session's first turn ended (`Stop`) 1.8 to 3.9 s after the last launch, while the workers ran. In r1 each notification started its own turn (four `Stop` events in all); in r2 and r3 two of them arrived 121 and 132 ms apart, with no `Stop` between them (three `Stop` events). | `p3-bg-r*`: `analysis.prompts`, `hookLog` (`ups`, `stop`, `sub-stop`) |

### Details

- **This qualifies an earlier statement.** The option C round said the three hook processes "ran one after
  another" and the first-release decisions drop P6 because "the hooks ran one after another in every probe". That
  held for a hook of about 0.1 s. A hook that runs longer than the gap between the model's calls runs alongside
  the next one, so H4 `pre` can run in two or three processes at once and its `git worktree add` must go through
  the state lock, as the spec already says. The probe's git commands did not collide, so what Git does when two
  `git worktree add` run at once in one repository is still unmeasured.
- **Foreground, the main session waits in one turn.** `p3-slow-hooks` had one prompt and one `Stop` per run,
  after the last `PostToolUse`; each `PostToolUse` came after its own worker's `SubagentStop`, in the order the
  workers finished.
- **Background, the first `Stop` comes before any worker is done.** In `p3-bg` the main session's dispatching
  turn ended while all three workers were running, then each finish arrived as a prompt. The notification carries
  the report itself, so a hook on `UserPromptSubmit` can read it from the prompt.
- **Version.** The P3 and P4 runs used Claude Code 2.1.305; the `c-haiku-guard` comparison used 2.1.304.

## P4: background workers finishing together

Probe P4 of the spec: when three background workers finish close together, how many prompts reach the main
session, of which kinds, and does one prompt carry several reports? Two cells, four headless runs, run on
2026-10-20 (21:07:58 to 21:09:19 UTC) with Claude Code 2.1.305 on Windows, $0.37 in all (per run $0.088 to
$0.095), made by `probes/tierminator-parallel/p4-runner.js`. The main session (`claude -p --model sonnet
--permission-mode bypassPermissions`) makes three Agent calls in one message with `run_in_background true` to the
probe agent `tierminator-parallel-probe:cmd-worker`, which runs one command, `barrier.js`: each worker waits until
all three are ready, then sleeps its stagger and ends. The main session is told to reply `GOT <worker>` for each
report in a message, end its turn, and add `ALL DONE` once it has all three. Cells:

- `p4-close`: stagger 0, 0, 0 ms, three runs.
- `p4-stagger`: stagger 0, 1000, 2000 ms, one run.

The runner's `analysis.summary` holds `prompts`, `byKind`, `promptsNamingSeveralWorkers` (prompts whose text
names more than one of W1 to W3; the typed prompt names all three, so 1 means no notification did),
`barrierSpreadMs` (the spread of the three `barrier.js` end times), `subagentStopSpreadMs`, `stops`,
`resultEvents` and `gotLines`; `analysis.timeline` orders every prompt, `Stop`, `SubagentStart`,
`SubagentStop`, `PostToolUse` and barrier end; `analysis.stream` is the session's own output.

Evidence:
- `probes/evidence/tierminator-parallel-p4-close-r1.json`, `-r2.json`, `-r3.json`.
- `probes/evidence/tierminator-parallel-p4-stagger.json`.

| Run | Finish spread: barrier, `SubagentStop` | Prompts after the first | Several reports in one prompt? | `GOT` replies (one line = one reply) | `Stop` events, `result` events |
|---|---|---|---|---|---|
| `p4-close-r1` | 39 ms, 580 ms | 3, all `task-notification` (W2, W3, W1) | **No**: each names one worker | `GOT W2`; `GOT W3 / GOT W1 / ALL DONE` | 3, 4 |
| `p4-close-r2` | 27 ms, 788 ms | 3, all `task-notification` (W2, W1, W3) | **No** | `GOT W2`; `GOT W1 / GOT W3 / ALL DONE` | 3, 4 |
| `p4-close-r3` | 44 ms, 732 ms | 3, all `task-notification` (W3, W1, W2) | **No** | `GOT W3`; `GOT W1 / GOT W2 / ALL DONE` | 3, 4 |
| `p4-stagger` | 1970 ms, 3139 ms | 3, all `task-notification` (W1, W2, W3) | **No** | `GOT W1 / GOT W2`; `GOT W3 / ALL DONE` | 3, 4 |

Every run has `byKind` `{"user": 1, "task-notification": 3}` and `promptsNamingSeveralWorkers: 1` (the typed
prompt). No `<agent-message>` prompt arrived (no worker called `SubagentHandback`). Every `SubagentStop` had
`last_assistant_message` with the worker's report, and every `PostToolUse` on the Agent call was
`async_launched` with `isAsync: true`, at its worker's `SubagentStart`.

**Timeline.** `p4-close-r1`, from `analysis.timeline` (UTC, 21:08):

| Time | Event |
|---|---|
| 07:57.992 | the typed prompt |
| 08:02.226 to 08:04.631 | three `SubagentStart`, each with its `PostToolUse` `async_launched` |
| 08:06.555 | `Stop`: the dispatching turn ends |
| 08:07.220 to 08:07.259 | the three barrier ends (39 ms) |
| 08:09.102 | `SubagentStop` W2 |
| 08:09.262 | prompt: notification W2 (160 ms later); a turn starts |
| 08:09.435, 08:09.682 | `SubagentStop` W3, W1, during that turn |
| 08:10.617 | `Stop` (reply `GOT W2`) |
| 08:10.755, 08:10.890 | prompts: notifications W3 and W1, 138 and 273 ms after the `Stop`, with no `Stop` between them |
| 08:12.937 | `Stop` (reply `GOT W3 / GOT W1 / ALL DONE`) |

`p4-close-r2` and `-r3` follow the same order: the dispatching turn's `Stop` before the first `SubagentStop`, the
first notification 249 and 187 ms after its `SubagentStop`, the other two `SubagentStop` events during that turn,
and their two notifications 144 and 126 ms apart after its `Stop`. In `p4-stagger` the dispatching turn ran
longer: its `Stop` (21:09:13.997) came after the `SubagentStop` of W1 (11.598) and W2 (13.081); their two
notifications arrived 181 and 319 ms after that `Stop` and were answered in one reply; W3's `SubagentStop`
(14.737) came during that turn, and its notification arrived 140 ms after the next `Stop` (17.176).

### Details

- **One prompt per worker, never combined.** In 4 of 4 runs each finish produced exactly one
  `<task-notification>` naming one worker, with that worker's report in `<result>`, whether the finishes were
  27 ms or 2 s apart.
- **A finish during a turn waits for that turn's `Stop`.** No notification of a worker that finished during a
  turn arrived before that turn's `Stop`. Each one either started a turn 160 to 249 ms after its `SubagentStop`,
  when the session was idle, or came 128 to 319 ms after the `Stop` of the turn it finished during.
- **Queued notifications arrive back to back and get one reply.** In all four runs two notifications were queued
  at once, and both fired `UserPromptSubmit` before the model replied, with no `Stop` between them; the next
  reply covered both (two `GOT` lines). The stream has four `result` events against three `Stop` hook events,
  one of them with an empty result, between the two queued prompts. How Claude Code turns two queued prompts into
  one reply (one turn with both, or an empty turn and then a turn that sees both) is **not determinable** from
  these files.
- **Order.** The notifications came in `SubagentStop` order in every run.
- **`SubagentStop` events can be close.** Two came 47 ms apart (`p4-close-r3`, W1 and W2) and 126 ms apart
  (`p4-close-r2`), each in its own hook process.

**What it means for the spec's [Notices](tierminator-parallel-spec.md#notices) rules (inferred).**

- **"Every hand-back or finish of a task yields a notice for that task" holds**: each finish is its own prompt,
  and the `<task-id>` (the `agent_id`) and the description in `<summary>` tie it to the slot, so H1 can judge per
  prompt, as it does for a serial hand-back.
- **Two notices can reach the model in one turn.** When two notifications are queued, H1 runs twice before the
  model answers, so the model sees both notices at once. The first, written when the other was not yet judged,
  may say "others still running: end your turn" while the second says what to do next. The rule "the notice
  says only what is true at that moment" is right but not enough: the notice must also say that a later notice
  supersedes an earlier one, or each notice must be built from the whole wave state at that moment so the last
  one is complete. The spec should say which.
- **A finish while the dispatching turn is still running is not lost**, only delayed to that turn's `Stop`
  (`p4-stagger`). H5's wait-states must let that turn end with workers in flight, and the judging (done in H4 at
  `SubagentStop` or in H1 on the prompt) must not assume the notification comes right after the `SubagentStop`.
- **The state lock is needed.** `SubagentStop` hooks of different workers ran 47 ms apart, which is the case the
  spec's `state.update` lock is for.
- **Not shown:** the `<agent-message>` hand-back path, which the real tier agents use interactively
  ([dispatch findings](tierminator-agent-dispatch-findings.md#a-hand-back-makes-the-finished-notification-transcript-only-claude-code-2-1-285)),
  and an interactive session, where the user can type between notifications.

## P5: how long a hook may run

Probe P5 of the spec: can a hook run for minutes with a raised `timeout`, does the session wait for it, is it
stopped at its timeout, and is there a maximum? Eleven headless cells, one run each, run on 2026-10-20 (21:09:38
to 21:44:20 UTC) with Claude Code 2.1.305 on Windows, $0.68 in all (per run $0.057 to $0.073), made by
`probes/tierminator-parallel/p5-runner.js`. Each cell builds a throwaway repo and a copy of the
`variant-slow-hook` plugin whose `hooks.json` registers, on one event, a **slow** hook (`slow-hook.js`, sleeping
S seconds under a timeout of T seconds) and a **fast** hook (the same timeout, no sleep), as two entries of one
matcher group. The slow hook logs `slow:start`, a `slow:beat` every 5 s and `slow:end`; on `UserPromptSubmit` it
then prints `additionalContext` `P5-MARKER-<name>`. A hook stopped at its timeout logs no more beats; one whose
process outlives the stop keeps beating, and for a cell whose sleep exceeds its timeout the runner waits until
10 s after the sleep would have ended before it reads the log. The main session (`claude -p --model sonnet
--permission-mode bypassPermissions`, with the probe plugin) is, on `UserPromptSubmit`, told to run `echo p5` and
reply with its output and every `P5-MARKER` line in its context (or `NONE`); on `SubagentStop`, to make one Agent
call to `tierminator-parallel-probe:cmd-worker` (which runs `echo p5-worker`), then run `echo after-agent` and
reply with the report. Cells (`ups` = `UserPromptSubmit`, `sas` = `SubagentStop`, `t` = timeout, `s` = sleep,
both in seconds):

- `p5-ups-t15-s20`, `-t600-s20`, `-t600-s120`, `-t600-s400`, `-t3600-s700`.
- `p5-sas-t15-s20`, `-t600-s20`, `-t600-s120`, `-t600-s400` (a foreground worker), and `p5-sas-bg-t600-s120`
  (the worker with `run_in_background true`).
- `p5-accept`: five `UserPromptSubmit` hooks with timeouts 600, 3600, 86400, 2147483 and 2147484, each sleeping
  3 s, and `claude plugin validate` on the generated plugin.

The runner's `analysis.hooks` holds, per hook, `startAt`, `endAt`, `beats`, `ranS` (start to the last log line),
`completed` (logged `slow:end`) and `ranPastTimeout` (`ranS` more than 2 s over the timeout);
`analysis.fastStartDelayMs` is the fast hook's start minus the slow hook's; `analysis.afterSlowStartS` gives, in
seconds after the slow hook's start, the main session's `PostToolUse` on Agent (`postAgent`), its first Bash
(`mainTool`), its `echo after-agent` (`afterAgentTool`) and the next `Stop`; `analysis.markers` are the
`P5-MARKER` strings in the final result; `analysis.timeoutMentions` are the session's stdout and stderr lines
that match `time[d ]?out`; `analysis.prompts` holds every `UserPromptSubmit` with its kind; each file's
`validate` holds the validator's exit status and output.

Evidence, one file per cell:
- `probes/evidence/tierminator-parallel-p5-ups-t15-s20.json`, `-p5-ups-t600-s20.json`, `-p5-ups-t600-s120.json`,
  `-p5-ups-t600-s400.json`, `-p5-ups-t3600-s700.json`.
- `probes/evidence/tierminator-parallel-p5-sas-t15-s20.json`, `-p5-sas-t600-s20.json`, `-p5-sas-t600-s120.json`,
  `-p5-sas-t600-s400.json`, `-p5-sas-bg-t600-s120.json`.
- `probes/evidence/tierminator-parallel-p5-accept.json`.
- For the worktree hook (H4 `pre`), `probes/evidence/tierminator-parallel-p3-slow-hooks-r1.json` to `-r3.json`
  (see "P3").

Every session exited 0, and every `validate` exited 0 ("Validation passed with warnings": no version, no README,
no icon; nothing about a timeout).

**`UserPromptSubmit`.** Fields: `analysis.hooks` (`completed`, `beats`, `ranS`, `ranPastTimeout`),
`analysis.fastStartDelayMs`, `analysis.afterSlowStartS` (`mainTool`, `stop`), `analysis.markers`,
`analysis.timeoutMentions`.

| Cell | Did the session wait for the hook? | Slow hook: ended or stopped at its timeout? | Fast hook's start after the slow one's | Session went on (first Bash; `Stop`) | Output reached the model (`markers`) | What the session showed for a timeout |
|---|---|---|---|---|---|---|
| `p5-ups-t15-s20` | **Yes, until the timeout**: the first Bash came 18.5 s after the hook started, after the stop at 15 s. | **Stopped at 15 s**: 3 beats, the last at 15.04 s, no `slow:end`, and no beat after it, though the runner watched to 30 s (`ranPastTimeout` false). | 0 ms | 18.5 s; 26.1 s | **None**: the result was `NONE`. Not even `P5-MARKER-fast`, whose hook ended 4 ms after it started. | Nothing: no matching line, exit 0. |
| `p5-ups-t600-s20` | **Yes**: the first Bash came 2.2 s after `slow:end`. | **Ended** at 20.0 s (3 beats). | 2 ms | 22.2 s; 27.4 s | `P5-MARKER-fast`, `P5-MARKER-slow` | Nothing |
| `p5-ups-t600-s120` | **Yes** (3.5 s after `slow:end`). | **Ended** at 120.0 s (23 beats). | 13 ms | 123.6 s; 128.8 s | `fast`, `slow` | Nothing |
| `p5-ups-t600-s400` | **Yes** (2.4 s after `slow:end`). | **Ended** at 400.0 s (79 beats). | 0 ms | 402.4 s; 406.6 s | `fast`, `slow` | Nothing |
| `p5-ups-t3600-s700` | **Yes** (3.1 s after `slow:end`). | **Ended** at 700.0 s (139 beats). | 2 ms | 703.1 s; 705.5 s | `fast`, `slow` | Nothing |

**`SubagentStop`.** Fields: `analysis.hooks`, `analysis.fastStartDelayMs`, `analysis.afterSlowStartS`
(`postAgent`, `afterAgentTool`, `stop`), `analysis.timeoutMentions`; for the background cell also
`analysis.postAgent`, `analysis.prompts` and `analysis.stop`. The hook prints nothing on this event, so there are
no markers.

| Cell | Did the session wait for the hook? | Slow hook: ended or stopped at its timeout? | Fast hook's start after the slow one's | Session went on (`PostToolUse` on Agent; `echo after-agent`; `Stop`) | What the session showed for a timeout |
|---|---|---|---|---|---|
| `p5-sas-t15-s20` | **Yes, until the timeout**: the Agent call returned (`PostToolUse`, `completed`) 15.2 s after the hook started. | **Stopped at 15 s**: 3 beats, the last at 15.03 s, no `slow:end`, no beat after it though the runner watched to 30 s (`ranPastTimeout` false). | 0 ms | 15.2 s; 16.3 s; 17.5 s | Nothing; the reply was the worker's report as usual. |
| `p5-sas-t600-s20` | **Yes**: the Agent call returned 0.14 s after `slow:end`. | **Ended** at 20.0 s. | -5 ms | 20.2 s; 21.3 s; 22.5 s | Nothing |
| `p5-sas-t600-s120` | **Yes** (0.14 s after `slow:end`). | **Ended** at 120.0 s. | -1 ms | 120.2 s; 121.4 s; 122.5 s | Nothing |
| `p5-sas-t600-s400` | **Yes** (0.14 s after `slow:end`). | **Ended** at 400.0 s. | 3 ms | 400.2 s; 401.8 s; 403.2 s | Nothing |
| `p5-sas-bg-t600-s120` | **The notification waited for it**: `PostToolUse` was `async_launched` at the worker's start (4.9 s before the hook) and the dispatching turn's `Stop` came 3.4 s before the worker's `SubagentStop`; the worker's `<task-notification>` prompt arrived 120.2 s after the hook started, 0.19 s after `slow:end`. | **Ended** at 120.0 s. | 0 ms | -4.9 s (`async_launched`); 122.4 s; 124.1 s | Nothing |

**`p5-accept`.** All five hooks ran to `slow:end` (3.00 to 3.01 s each, started within 18 ms of one another), and
all five markers reached the model (`P5-MARKER-t600`, `-t3600`, `-t86400`, `-t2147483`, `-t2147484`). The
validator accepted every value (status 0; its warnings name no timeout). The largest timeout tried, 2147484 s,
is therefore the largest accepted; the probe tried nothing larger. Fields: `analysis.hooks`, `analysis.markers`,
`validate`.

### Details

- **The two hooks of one event run at once.** The fast hook started 5 ms before to 13 ms after the slow one in
  every cell, with its own process, so Claude Code does not run the hooks of one matcher group one after
  another. On both events the session went on only when the slower hook had ended or been stopped.
- **A stopped hook is stopped.** In both 15 s cells the slow process logged its last beat at 15.0 s and nothing
  after, while the runner watched for 15 s more; the beat due at 20 s never came. So Claude Code ended the hook's
  process at its timeout, measured for a Node hook with no child processes. Whether it also ends processes that
  the hook started (git, a verify command) is **not determinable** here.
- **A timeout is silent.** No session line mentioned a timeout, every session exited 0, and the model's reply
  did not mention it either. On `UserPromptSubmit` a timeout lost the outputs of **both** hooks, including the
  fast hook's, which had ended at once (one run). **Inferred:** Claude Code passes the event's hook outputs on
  only when all of them are done, and drops them all when one times out; a hook that must reach the model
  should not share its event with a hook that may time out.
- **On `SubagentStop` the main session waits for the hook.** Foreground, the Agent call returned 0.14 to 0.15 s
  after the hook ended (or was stopped). In the background, the worker's notification came 0.19 s after it; the
  session sat idle meanwhile (its first `Stop` came before the worker ended). So a slow H4 `stop` delays the
  next model turn by its length on both paths.
- **On `UserPromptSubmit` the main session waits too**, 2.2 to 3.5 s more after `slow:end`, which is the
  model's own latency (the first Bash).
- **What ran to the end.** On `UserPromptSubmit`, 700 s under a timeout of 3600; on `SubagentStop`, 400 s under
  a timeout of 600. No cell ran a `SubagentStop` hook longer than 400 s or under a timeout above 600, and no
  `PostToolUse` or `PostToolUseFailure` hook was tried.

### Hook timeouts: recommendation

The rule: a cell **works** when its slow hook logged `slow:end` and the session went on after it (on
`UserPromptSubmit`, `P5-MARKER-slow` is in `markers`; on `SubagentStop`, the main session's `echo after-agent`
ran). Recommend 3600 if `p5-ups-t3600-s700` works; else 600 if `p5-ups-t600-s400` and `p5-sas-t600-s400` both
work; else the largest timeout of a cell that works on both events.

| Cell | `slow:end` | Went on after it | Works |
|---|---|---|---|
| `p5-ups-t3600-s700` | yes (700.0 s) | `P5-MARKER-slow` in `markers` | **yes** |
| `p5-ups-t600-s400` | yes (400.0 s) | `P5-MARKER-slow` in `markers` | yes |
| `p5-sas-t600-s400` | yes (400.0 s) | `echo after-agent` at 401.8 s | yes |

**`p5-ups-t3600-s700` works, so the recommendation is a timeout of 3600 s** for the hooks that settle a wave,
and so integrate and verify:

- **H1** (`UserPromptSubmit`, `h1-plan-rules.js`): 3600, measured on this event to 700 s.
- **H4 `stop`** (`SubagentStop`, `h4-dispatch.js stop`): 3600. Measured on this event to 400 s under a timeout
  of 600; that a timeout of 3600 holds there as it did on `UserPromptSubmit` is **inferred** (`p5-accept` shows
  the value is accepted and run, on `UserPromptSubmit` only).
- **H4 `post` and `failure`** (`PostToolUse` and `PostToolUseFailure` on Agent): the same 3600, **inferred**,
  since P5 did not measure either event.

The longest hook duration measured to work is **700 s on `UserPromptSubmit`** (`p5-ups-t3600-s700`) and **400 s
on `SubagentStop`** (`p5-sas-t600-s400`). No stopped hook kept beating past its timeout (`ranPastTimeout` false
in both 15 s cells), so Claude Code did stop the hook process at its timeout; that is measured for the hook's own
process only, and the integrate and verify hooks should not leave child processes running on the assumption that
they are stopped with it (**not determinable**, above). A timeout is silent and loses the event's hook outputs,
so a verify that may approach the timeout should bound itself below it and report its own failure.

**H4 `pre`** (makes the worktrees, 30 s today) **stays at 30**: in all three `p3-slow-hooks` runs every hook ran
its full 3 s delay (3072 to 3103 ms in all, `delayMs` 3000) and every `git worktree add` returned status 0
(`analysis.mkwt`, `analysis.mkwtTiming`).

**The largest timeout accepted** is 2147484 s, the largest value that `p5-accept` ran to `slow:end` (with a 3 s
hook, so not a hook that long) and that the validator passed.

## Pending: interactive P3 and P4

These runs are headless. Interactive dispatch has no `run_in_background` field and always runs in the background,
and in the default permission mode the workers ask for permission, so neither cell is covered by the runs above.

| Cell | Why it needs an interactive run | Steps |
|---|---|---|
| `p3-bg` | Whether interactive background dispatch overlaps the workers and the slow hooks as `p3-bg` did headless, and what `PostToolUse` and the prompts look like there. | 1. `node probes/tierminator-parallel/c-runner.js --prepare p3-bg` 2. Run the printed lines in a new pwsh terminal. 3. Paste the printed prompt. 4. Answer each permission prompt once (do not pick "always allow"). 5. When all three reports are printed, `/exit`. 6. `node probes/tierminator-parallel/c-runner.js --collect p3-bg` 7. Commit `probes/evidence/tierminator-parallel-p3-bg-interactive.json` and update this doc. |
| `p4-close` | Whether an interactive session gets one notification per worker, and queues them behind a running turn, as `p4-close` did headless. | 1. `node probes/tierminator-parallel/p4-runner.js --prepare p4-close` 2. Run the printed lines in a new pwsh terminal (it starts in `bypassPermissions`, so no permission prompt is expected; answer any once). 3. Paste the printed prompt. 4. Type nothing until the session prints `ALL DONE`, or two minutes pass. 5. `/exit`. 6. `node probes/tierminator-parallel/p4-runner.js --collect p4-close` 7. Commit `probes/evidence/tierminator-parallel-p4-close-interactive.json` and update this doc. |

## Pending: interactive cells

**Superseded 2026-10-20 by option C** (see "Recommendation"): these cells are all about M1 (an isolated worktree
and its base). None is needed for option C, and none was run except that `c-haiku-interactive` covered the
interactive question for C. They stay as the record of what M1 would have needed.

Interactive dispatch runs in the background and in the user's permission mode, and P2's outside placement
asks for permission for a path outside the project, so these cells are not covered by the headless runs:

| Cell | Why it needs an interactive run | Steps |
|---|---|---|
| `p1-isolation-commit` | Interactive Agent calls run in the background ([dispatch findings](tierminator-agent-dispatch-findings.md#interactive-sessions-always-in-the-background)). Unknown: whether `PostToolUse` (which returns `async_launched` at once) still carries `worktreePath`/`worktreeBranch`, and whether isolation behaves the same in the user's permission mode. | 1. `node probes/tierminator-parallel/p1-p2-runner.js --prepare p1-isolation-commit` 2. Run the printed lines in a new pwsh terminal. 3. Paste the printed prompt. 4. Wait for the background report. 5. `/exit`. 6. `node probes/tierminator-parallel/p1-p2-runner.js --collect p1-isolation-commit` 7. Commit `probes/evidence/tierminator-parallel-p1-isolation-commit-interactive.json` and update this doc. |
| `p1-hook-isolation` | Whether `updatedInput` with no `permissionDecision` still applies the isolation, and asks for no extra permission, outside `bypassPermissions`. | The same steps with `p1-hook-isolation`; commit `probes/evidence/tierminator-parallel-p1-hook-isolation-interactive.json`. |
| `p2-outside` | Writing to a worktree outside the project directory asks for permission in the default mode, which a headless `bypassPermissions` run cannot show. | The same steps with `p2-outside`; commit `probes/evidence/tierminator-parallel-p2-outside-interactive.json`. |
| `m1-baseref-user` | `worktree.baseRef: "head"` in the user's own `~/.claude/settings.json` is untested, and the key must be in that file, which the probe will not edit for you. | 1. `node probes/tierminator-parallel/p1-p2-runner.js --prepare m1-baseref-user` 2. Add `{"worktree":{"baseRef":"head"}}` to `~/.claude/settings.json` (merge it into the file's existing object). 3. Run the printed lines in a new pwsh terminal and paste the printed prompt. 4. Wait for the report. 5. `/exit`. 6. Remove the key again. 7. `node probes/tierminator-parallel/p1-p2-runner.js --collect m1-baseref-user` 8. Commit `probes/evidence/tierminator-parallel-m1-baseref-user-interactive.json` and update this doc (pass condition: all six checks true). |
| `m1-settings-early` | Whether an interactive session re-reads a settings file written during the session, as the headless runs showed, and under the user's permission mode. Needed now: tierminator writes the file (see the decision in the Recommendation). | The same steps as `p1-isolation-commit` with `m1-settings-early`; commit `probes/evidence/tierminator-parallel-m1-settings-early-interactive.json` and update this doc (pass condition: all six checks true). |

## Recommendation

**Decided 2026-10-20 (the user): option C. Tierminator makes each task's worktree itself, and the worker is not
isolated.** This replaces the M1 recommendation and the two decisions that followed it (the serial fallback and
writing the `baseRef` setting), which stay below as the record of what was measured; none of that machinery is
built. The evidence is the "Option C" section above. The rules for C:

1. **Placement.** H4's `PreToolUse` hook on the Agent call creates the slot's worktree before the worker starts,
   with `git worktree add -b <branch> <path> <wave base>`, serialized through the state lock. The path is
   `<repo>/.claude/worktrees/tierminator-<run>-<task>` (not a name starting with `agent-`, which Claude Code uses
   for its own) in drive-letter, forward-slash form, and the branch is `tierminator/<runId>/<task>`. The base is
   right by construction, so there is no `baseRef`, no `isolation`, no `updatedInput` and no start check of
   settings. A failed `git worktree add` denies the call with Git's message and is fatal for the wave.
2. **The worker's rules** (the tested Parallel section in `c-runner.js`, `PARALLEL`): the `Worktree:` path is WT;
   a `cd "<WT>" && ` prefix on every Bash command; no PowerShell; absolute paths starting with WT for Write, Edit
   and Read; Glob and Grep with `path` set to WT; no path built from `pwd` output; commit on the branch already
   checked out; setup commands run first, in WT.
3. **A guard hook** (the tested `guard.js`, a `PreToolUse` hook on Bash, PowerShell, Write, Edit, Glob and Grep)
   that, for tierminator's workers while a parallel wave is active, denies a Bash command without a `cd` into
   the worktrees directory, any PowerShell call, a Write or Edit outside it, and a Glob or Grep without a `path`
   inside it. It only denies; it never grants a permission and never rewrites a tool input (a rewrite would clash
   with `denoizinator-net`'s, where the later one wins). It cost nothing when the workers followed the rules and
   rescued all five violating calls when they did not.
4. **Judging** reads Git at the slot's known worktree path (one commit since the wave base, the two trailers, a
   clean tree, on its own branch), and also that the main tree is still on the wave base with an empty status; a
   dirty main tree is fatal for the wave, because the leaking slot cannot be told.
5. **Mapping a worker to its slot.** The slot comes from the `Task:` line in the first message of the worker's
   transcript (`agent_transcript_path` on `SubagentStop`), which the probe's `slotOfAgent` read correctly in
   every run; neither `SubagentStart` nor `SubagentStop` carries the task.
6. **Cleanup** removes only tierminator's own worktrees and `tierminator/<runId>/*` branches, with the git
   helpers; there is no Claude Code isolation leftover to attribute.
7. **Restriction (unattended runs).** In the default and `acceptEdits` permission modes every worker Bash command
   asks for approval, and a `cd "<dir>" && git ...` command offers no permanent rule, so a person must answer one
   request per commit for the life of the run. A run with nobody to answer (headless `claude -p`, Grindinator, an
   overnight run) must therefore use `--permission-mode auto` or `bypassPermissions`; in the default mode its
   workers finish the work and cannot commit. Auto and `bypassPermissions` ask nothing. The documentation states
   this as a restriction of unattended mode (the user's decision: unattended use is not the priority now). An
   alternative for default-mode users, measured on one run, is a user rule `Bash(git -C:*)` with workers using
   `git -C "<WT>" ...` for git, which is broader than the user may want and is not built into the Parallel section.

What stays from the earlier findings: the `.claude/worktrees/` entry in `.git/info/exclude`, drive-letter worktree
paths, and the check at judging that a worker stayed in its worktree.

**Decided 2026-10-20 (the user): simplifications and the first release.** Three design reviewers (opus, high
effort; architecture, base machinery, and the work packages) looked only for overcomplication, and the user adopted
these. None rests on a new measurement, except where noted:

1. **No conflict-resolver agent in the first release.** A pick that conflicts is aborted, the wave's other tasks
   are integrated, and the conflicting task runs again as a serial wave on the new HEAD, at the tier it last ran
   with no ladder step. A serial task cannot conflict, so this always resolves; the cost is one task done twice.
   The resolver (WP-12) stays written for later; the end summary counts the conflicts so that a later decision has
   data. (The reviewers argued this saved the M2 rules; after option C it no longer does, since the tasks use them
   too, so the reason is the removed agent, prompt, judge, spend row and probe P7.)
2. **Integration in the main tree.** By the time a wave closes every worker is done and the main tree is idle, so
   the picks go straight onto the run branch (after checking the main tree is on the wave base and clean). No
   integration worktree or branch, no fast-forward step. A run halted mid-wave keeps its clean picks, which resume
   skips by their trailers. P6 (concurrent `git worktree add`) is dropped as a probe: the hooks ran one after
   another in every probe, and WP-06's real-repository tests cover Git on Windows.
3. **Waves stay.** A ready-queue would be faster and drop the wave state, but it would redo the plan format and
   the engine, and waves give a plan-order history and one base per wave, which is what makes the main-tree check
   possible. It remains a possible later optimization.
4. **Plan-level verify halts on failure and nothing repairs it.** It still guards against picks that apply cleanly
   and break together. `TIERMINATOR_VERIFY_TIMEOUT` is dropped in favor of the hook timeout (P5). Decided
   (spec O8, the user delegated the call): the picks stay on the run branch, since each passed its own `Verify:`;
   the alternative, a `reset --hard` to the wave base, would need the slot branches re-picked on resume.
5. **The overlap review flag is deferred** (WP-05): with item 1 a missed overlap costs one redo.
6. **First release:** WP-01 to WP-04, WP-06 to WP-11, WP-14, and a trimmed WP-17 (eight scenarios). Deferred: WP-05,
   WP-12, WP-13's repair half, WP-15 (the limit rule for other slots, the result fields, P8) and WP-16's display
   half. Also dropped as probes: P3b (WP-07's concurrent test proves the race) and P6.
7. **An audit the reviewers found, added to WP-09.** Six files read `state.current` and assume a serial run:
   `h1-plan-rules.js`, `h4-dispatch.js`, `h5-guard.js`, `h7-limit.js` (through `lib/result.js`), `lib/result.js`
   and `lib/spend.js`. In `lib/spend.js`, `recordAttempt` and `outcomeOf` read `prev.current` and a `safe()`
   wrapper would swallow the error, silently dropping a wave's attempts (read from the source on 2026-10-20; the
   behavior with a wave state is not run). Spend already attributes by each worker's own transcript and agent id,
   so the attribution change the spec had planned is not needed.

**Superseded (kept as the record): M1 with `worktree.baseRef: "head"` in a settings file the user owns.** Both M1 and M2 pass their rules, and the
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
| R6 | A settings file written just before the Agent call works: all three `m1-settings-midsession` runs have all six checks true | **FAIL** (0 of 3 runs): base A in each, written about 0.5 s before the worktree | `m1-settings-midsession-r1.json`, `-r2.json`, `-r3.json` |
| R7 | A settings file written a few seconds earlier works: all three `m1-settings-early` runs have all six checks true | **PASS** (3 of 3 runs): base B, written 2.7 to 10.7 s before the worktree; headless only | `m1-settings-early-r1.json`, `-r2.json`, `-r3.json` |

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
(`~/.claude/settings.json`) is **not determinable**: no cell with evidence tried it. A settings file that appears
while the session runs is picked up (R7), so a user who adds the key after a run has started does not need to
restart Claude Code, if it is in place a few seconds before the next worktree is made (headless only; see
"Third round"). What tierminator does when the setting is absent is the decision below (it writes the setting).
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

**Superseded by option C (it was decided earlier on 2026-10-20): without a working `baseRef`, the run is serial.** The base must be the run
branch's HEAD, never `origin/main`, because a worker based on A lacks the earlier tasks' commits. Tierminator
therefore never relies on the setting for correctness. Parallel is an optimization that applies only when the
base is known to be right:

1. **A start check** (graph plans only; serial plans never reach it). It passes silently when the repo has no
   remote (R2). Otherwise it reads the user, project and local settings files, and passes when one holds
   `worktree.baseRef: "head"` as the effective value (local over project over user). A headless caller that
   supplied the setting another way, such as `--settings` (`m1-baseref-flag`), says so with an environment
   variable, because tierminator cannot read a process argument. If no file holds it, **tierminator writes it**
   (see "Decided: tierminator writes the setting" below) and the first-slot check confirms it took effect.
   If the setting cannot be written (the file is not valid JSON, is not writable, or a higher-precedence source
   such as managed settings sets another value), the run does not stop: **every wave runs as a serial wave** in
   the main tree through today's code (the spec already runs a wave of one that way), no worktree is made, and
   the base is the run branch by construction. The user is told once, in the start notice, why and what to add
   and where, and that the plan resumes in parallel with `/tierminator:execute`. The result file records the run
   as degraded to serial, with the reason.
2. **A first-slot base check.** The static check cannot see everything it should (a `--settings` flag it was not
   told of, managed settings, a file that was edited too recently to be live). So the first parallel wave of a
   run starts one slot only, verifies that its worktree's merge-base with the wave base is the wave base, and
   releases the rest only then. A worktree not at the wave base before any slot was verified is not a task
   failure: the slot is discarded without a ladder step. If tierminator wrote the setting during this run and
   this is the first such failure, the task is dispatched once more (the file may have been written too close to
   the worktree's creation: R6 failed at 0.5 s and R7 passed from 2.7 s); otherwise, or if that second slot also
   fails, the task goes to the serial path and the rest of the run is serial, with the reason recorded. Once one
   slot is verified the rest of the run is not gated again.
3. **The fatal `WORKTREE BASE:` judgment stays** for a worktree that is not at the wave base after a slot was
   verified (nothing in a run changes the setting, so this means something else is wrong), and it is never
   retried a tier up.

The `SubagentStart` reset and the worker's self-reset (R3, R4) are **not used**: they rest on undocumented
ordering or on the worker obeying an instruction, and a late `reset --hard` would discard a worker's edits
silently. They stay recorded here as measured fallbacks, to build only if users find the setting a burden and only
after `m1-substart-reset` passes interactively. The user-level settings file stays pending (`m1-baseref-user`):
until it passes, the start check reads that file but the notice names only the two project files.

**Superseded by option C (it was decided earlier on 2026-10-20): tierminator writes the setting.** R7 shows a settings file written a few
seconds before the first worktree is made takes effect, so the start check writes `worktree.baseRef: "head"` into
`.claude/settings.local.json` itself when no file holds it, and parallel needs no setup step. The rules for the
write:

- **Where and how.** The untracked `.claude/settings.local.json`, created if absent, otherwise the key merged into
  the existing JSON object without touching any other key. An existing file that is not valid JSON is never
  overwritten: the run goes serial instead. The file is kept out of the commit with `.git/info/exclude`, unless
  `git check-ignore` already says it is ignored; the entry for `.claude/worktrees/` (WP-06) is added the same way.
- **When, and the pause.** At the start of the run, before the first dispatch, in the hook or command that starts
  the run. After a write (never when the setting was already there), that same hook or command **sleeps 3 s**
  before it returns, so the first Agent call cannot come sooner than 3 s plus the model's own latency after the
  write. Why 3 s: a write 2.7 s or more before `SubagentStart` worked in 3 of 3 runs (R7) and one 0.5 s before
  failed in 3 of 3 (R6), and those gaps already included the model's latency, so 3 s plus that latency is above
  everything measured to work. The minimum working gap itself is not measured (between 0.5 s and 2.7 s), a sleep
  inside the writing hook was not measured, and neither was an interactive session, which is why the first-slot
  check and its one retry (above) stay. The hook or command needs a timeout above 3 s.
- **Undo.** What tierminator changed is recorded in the run state (file created, or key added, with any prior
  value) and put back when the run ends by completing, halting or being stopped by a typed prompt: the key is
  removed, and the file is deleted only if tierminator created it and it is now empty. A run that dies without an
  end hook leaves the key in an excluded file, which is harmless and is rewritten or removed by the next run.
- **Rule change.** This is an exception to this repo's `CLAUDE.md` rule ("nothing is ever written into a
  consuming repository", written for `denoizinator-net`; `decidinator` already lists its own exceptions). The rule
  is the user's to change: `CLAUDE.md` should name this write as tierminator's exception, and the plugin README
  must say it does it. Tierminator's own docs state no such rule today.
- **Not yet shown.** An interactive session re-reading the file (`m1-settings-early` is now needed, see Pending),
  and the shortest working gap.

**The M2 worker rules, if M2 is used.** Both placements passed, **inside** and **outside**. The worker rules to
copy are the `m2-worker` agent's (`tierminator-parallel-probe:m2-worker`, quoted in the M2 re-run section): a
`cd "<Worktree>" && ` prefix on every Bash command, an absolute drive-letter path that starts with the worktree
for every file tool (relative paths land in the main tree), and never a path built from Git Bash's `/tmp/…`
form of `pwd`. Inside (`<repo>/.claude/worktrees/…`, with that directory in `.git/info/exclude`) needs no
permission for a path outside the project, which outside has not been shown to avoid (the interactive cells are
pending).

**Where the conflict resolver would run (deferred, WP-12).** A resolver needs an existing worktree with a pick in
progress. It would use M2, which passes, through a `Worktree:` line under the `m2-worker` rules; the first release
has no resolver (see "Decided 2026-10-20: simplifications" above).

**Spec assumptions the evidence refutes**, and the packages to edit (see [`parallel/README.md`](parallel/README.md)):

- **M1 places the worker at the wave base.** [The dispatch of one task](tierminator-parallel-spec.md#the-dispatch-of-one-task)
  and [Concepts](tierminator-parallel-spec.md#concepts) (wave base) assume it; by default Claude Code bases the
  worktree on `origin/main` (A), so M1 would need a setting. Option C (decided) does not use M1 for tasks: the
  spec's own M2 is the mechanism, with the corrections below. Edit WP-08 (`expectedCall`), WP-09 (H4 `pre` makes
  the worktree; the guard) and WP-10.
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
  permission prompts for an outside worktree. None of the M1 or M2 re-run cells ran interactively, and neither
  did the P3 and P4 cells.
- **The user-level settings file** (`~/.claude/settings.json` with `worktree.baseRef: "head"`): pending above
  as `m1-baseref-user`.
- **How often independent-looking tasks conflict.** Nothing measured; the first release re-runs a conflicting task
  serially and counts the conflicts.
- **Option C, under real conditions.** Tasks of 30 to 60 turns (the probes' took 8 to 10), setup commands, builds
  (including `denoizinator-net`'s rewrite of a `dotnet` command after a `cd ... &&` prefix), opus workers,
  sonnet and haiku in the default and auto modes (haiku only was run there), workers that use the PowerShell tool,
  and a worker that uses another slot's worktree (the guard cannot tell).
- **Whether Claude Code's periodic sweep of `.claude/worktrees/` leaves worktrees that tierminator made**
  (named `tierminator-<run>-<task>`, not `agent-*`). Not tried; the packages name them to avoid Claude Code's
  pattern.
- **Concurrent `git worktree add`.** P3 shows the hook processes that make the worktrees overlap when they are
  slow (three at once, `p3-slow-hooks`, `p3-bg`), but the probe's delay came before the git command, and the git
  commands themselves still ran about a second apart, so two `git worktree add` in one repository at the same
  moment never happened; the state lock covers it regardless.
- **Interactive background dispatch of option C beyond one run**, and the exact prompts of that run (inferred from
  hook timing; the `PermissionRequest` hook was added afterwards and used in headless runs). Headless background
  dispatch is now measured (P3 `p3-bg`, P4): the workers and slow hooks overlap, `PostToolUse` returns
  `async_launched`, and each finish arrives as its own `<task-notification>`. The interactive runs of `p3-bg` and
  `p4-close` are pending (see "Pending: interactive P3 and P4").
- **The `<agent-message>` hand-back with several workers.** No P3 or P4 worker called `SubagentHandback`, so how
  several hand-backs and their notifications arrive together is unmeasured.
- **Prompts typed by the user between notifications**, and more than three workers finishing at once.
- **Auto mode on anything but small haiku tasks**, and whether the mode ever asks.
- **Why `cd ... && git ...` offers no permanent rule**, and whether other forms (for example a `git` alias or a
  script) would.
- **The shortest gap at which a settings file written during the session takes effect.** 0.5 s failed and 2.7 s
  worked (third round); nothing between was tried. Interactive sessions were not tried either.
- **A control run for the third round**: the same repo without the file written at all, in this round's setup.
- **A user-level key that changes after the session starts**, and a `baseRef` key removed during a session.
- **A project settings file that Claude Code treats as untrusted.** Headless runs under `bypassPermissions` skip
  any trust prompt, so no cell could show it.
- **How the start check sees a `--settings` flag a headless caller passed.** Tierminator cannot read a process
  argument, so a caller must say so, for example with an environment variable. That is a design point for
  WP-10, not measured.
- **`fresh` fetching `origin/HEAD`** when it was last fetched over 24 hours ago: documented, not measured.
- **PowerShell-tool workers.** Every worker ran its commands through the Bash tool. The Claude Code documentation
  says the `cd` reset applies to the PowerShell tool too, but no cell used it.
- **The `SubagentStart` cwd of non-isolated agents.** In the M2 cells the worker was not isolated and the hook's
  `cwd` was the main tree; that this holds for every non-isolated agent was not tried.
- **The `WorktreeRemove` hook.** It was registered in `m1-worktree-hook` and did not fire, so whether it would on
  cleanup is unknown.
- **Whether Claude Code removes an isolated worktree that has no changes at all**; the no-commit worker left an
  untracked file.
- **Several isolated Agent calls at once** (Claude Code making several `isolation: "worktree"` worktrees
  concurrently). P3 answers several Agent calls in one message with hook-made worktrees (option C): the workers
  overlap in the foreground and in the background, and their `PreToolUse` hooks overlap when slow. No cell made
  several Claude Code worktrees at once, which option C does not use.
- **Platforms other than Windows**: the `/tmp` path mismatch is Git Bash's, and may not occur elsewhere.
- **Hook durations on `PostToolUse` and `PostToolUseFailure`** (H4 `post` and `failure`). P5 measured
  `UserPromptSubmit` and `SubagentStop` only; the recommended 3600 s for those two events is inferred.
- **Long hooks in an interactive session.** Every P5 cell was headless; whether an interactive session waits the
  same way, and what the user sees meanwhile, was not tried.
- **Hook timeouts and durations between those tried.** The timeouts were 15, 600 and 3600 s (and the five
  `p5-accept` values with a 3 s hook), the sleeps 20, 120, 400 and 700 s; a `SubagentStop` hook longer than
  400 s or under a timeout above 600, and a hook running for longer than 700 s, were not tried. Each cell ran once.
- **Whether a hook's child processes are stopped with it at its timeout.** The slow hook started none.
