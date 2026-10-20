# tierminator parallel: placing a subagent in a Git worktree

Probes P1 and P2 of [`tierminator-parallel-spec.md`](tierminator-parallel-spec.md#probes), run on
2026-10-19 (03:43 to 03:45 UTC on 2026-10-20) with Claude Code 2.1.304 on Windows, headless, five cells, $0.61
in all.

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

## Pending: interactive cells

Interactive dispatch runs in the background and in the user's permission mode, and P2's outside placement
asks for permission for a path outside the project, so these cells are not covered by the headless runs:

| Cell | Why it needs an interactive run | Steps |
|---|---|---|
| `p1-isolation-commit` | Interactive Agent calls run in the background ([dispatch findings](tierminator-agent-dispatch-findings.md#interactive-sessions-always-in-the-background)). Unknown: whether `PostToolUse` (which returns `async_launched` at once) still carries `worktreePath`/`worktreeBranch`, and whether isolation behaves the same in the user's permission mode. | 1. `node probes/tierminator-parallel/p1-p2-runner.js --prepare p1-isolation-commit` 2. Run the printed lines in a new pwsh terminal. 3. Paste the printed prompt. 4. Wait for the background report. 5. `/exit`. 6. `node probes/tierminator-parallel/p1-p2-runner.js --collect p1-isolation-commit` 7. Commit `probes/evidence/tierminator-parallel-p1-isolation-commit-interactive.json` and update this doc. |
| `p1-hook-isolation` | Whether `updatedInput` with no `permissionDecision` still applies the isolation, and asks for no extra permission, outside `bypassPermissions`. | The same steps with `p1-hook-isolation`; commit `probes/evidence/tierminator-parallel-p1-hook-isolation-interactive.json`. |
| `p2-outside` | Writing to a worktree outside the project directory asks for permission in the default mode, which a headless `bypassPermissions` run cannot show. | The same steps with `p2-outside`; commit `probes/evidence/tierminator-parallel-p2-outside-interactive.json`. |

## Recommendation

**Neither, as measured.** By the rule set for this probe, M1 and M2 both fail one condition each, and the
spec's [Probes](tierminator-parallel-spec.md#probes) section says the feature does not proceed when both fail.
WP-02 to WP-17 should not be run until one of the re-runs below passes.

M1 (the Agent tool's `isolation: "worktree"`):

| Condition | Result |
|---|---|
| Isolation applies to the plugin agent | Holds (all three `p1-*` files). |
| The call parameter or the hook applies it | Holds: **both** do (`p1-isolation-*`, `p1-hook-isolation`), so H4 could add it with `updatedInput` and need not deny a call without it. |
| The path or branch reaches a hook | Holds: `PostToolUse` on Agent, `tool_response.worktreePath` and `tool_response.worktreeBranch`; and `SubagentStart`/`SubagentStop` `cwd`, from which the branch `worktree-agent-<agent_id>` can be derived (**inferred** naming rule). |
| The base is B | **Fails.** The worktree was based on A, `origin/main`, in all three cells. A wave's base is the run branch's local HEAD, which is usually not pushed, so every worker would start from stale code. |
| A worktree holding a commit survives with its branch | Holds (`p1-isolation-commit`, `p1-hook-isolation`). |

M2 (worktrees made by tierminator, with a `Worktree:` line):

| Condition | Result |
|---|---|
| Absolute-path writes land in the worktree | Holds, inside and outside, when the path is in drive-letter form (`p2-*`). |
| The commit lands on `probe/p2` with the main tree clean | **Fails.** The commit landed on `work`, the main tree's branch, which moved off B, in both cells, because the lone `cd` did not persist and the probe forbade `cd` prefixes and `git -C`. |

**What would change it.** Both failures have a likely fix that this run did not test (**inferred**):

- **M2 with a `cd` prefix.** A P2 cell whose worker puts `cd "<Worktree path>" &&` in front of every Bash
  command (or uses `git -C "<Worktree path>"`) and writes only drive-letter absolute paths. If its commit lands
  on `probe/p2` and the main tree stays on B, M2 holds with these worker rules: a `cd "<Worktree>" &&` prefix
  on every Bash command, absolute drive-letter paths for every file tool (relative paths land in the main
  tree), and never a path built from Git Bash's `/tmp/…` form of `pwd`. Placement would be **inside**
  (`<repo>/.claude/worktrees/…`, with that directory in `.git/info/exclude`): it behaved the same as outside
  headless and needs no permission for a path outside the project, which outside has not been shown to avoid.
- **M1 with the base fixed.** Either a first worker step `git reset --hard <wave base>` in its worktree
  (checked by the judge against the slot's recorded base), or a `WorktreeCreate` hook that makes the worktree
  from the wave base itself (not tried, see below). M1 would also need `.claude/worktrees/` in
  `.git/info/exclude`, since the main tree otherwise shows `?? .claude/` and fails tierminator's clean-tree
  check (**inferred** from `git.problem`).

Because M2's failure is a direct result of the probe's own ban on `cd` prefixes, the M2 re-run is the cheaper
and more likely route; the spec prefers M1, so the M1 re-run decides whether the preference can stand.

**Where the conflict resolver runs.** P2 did not hold, so, by the spec's rule, the resolver cannot be pointed
at the integration worktree by a `Worktree:` line alone. With M1 also failing, it has no place as measured.
If the M2 re-run passes, it runs in the integration worktree through a `Worktree:` line under the same worker
rules (a `cd` prefix on every Bash command, so `git add` and `git cherry-pick --continue` run there). If only
M1 passes, it runs in its own M1 worktree and the hook fast-forwards the integration branch to its result.

**Spec assumptions the evidence refutes**, and the packages to edit (see [`parallel/README.md`](parallel/README.md)):

- **M1 places the worker at the wave base.** [The dispatch of one task](tierminator-parallel-spec.md#the-dispatch-of-one-task)
  and [Concepts](tierminator-parallel-spec.md#concepts) (wave base) assume it; Claude Code bases the worktree on
  `origin/main` (A). Edit WP-08 (`expectedCall` placement) and WP-09 (H4 `pre`, the slot's recorded head).
- **A `Worktree:` line is enough for M2.** [The dispatch of one task](tierminator-parallel-spec.md#the-dispatch-of-one-task)
  says the worker "must treat it as its working directory"; a lone `cd` does not persist, Bash and relative
  file paths stay in the main tree, and the commit lands on the run branch. This also breaks
  [Setup](tierminator-parallel-spec.md#setup) (setup would run in the main tree) and
  [Judging a task](tierminator-parallel-spec.md#judging-a-task) (the "worker still on its own branch" check
  must read the worktree's HEAD, not the main tree's). Edit WP-09 (the tier agents' Parallel section must
  state the `cd` prefix and absolute-path rules) and WP-08 (the `Worktree:` line in drive-letter form).
- **The main tree stays clean for the whole run.** [Concepts](tierminator-parallel-spec.md#concepts) (run
  branch) and [Integration](tierminator-parallel-spec.md#integration) step 5 rely on it; under M1 the
  `.claude/worktrees/` directory shows as untracked unless it is excluded. Edit WP-06 (worktree helpers: add
  the exclude entry) and WP-10 (starting waves).
- **The resolver can work in the integration worktree.** [The conflict resolver](tierminator-parallel-spec.md#the-conflict-resolver)
  ("Where") holds only with the `cd`-prefix rule. Edit WP-12.
- **Not refuted, but to keep in mind:** under M2 the worker is given the main tree's `CLAUDE.md`, not the
  worktree's, and under M1 `SubagentStop`'s `cwd` is the worktree, not the project. H4 already prefers the
  state's recorded `cwd` (`s.cwd ?? input.cwd`), so it is not misled (**inferred** from
  `plugins/tierminator/scripts/h4-dispatch.js`); WP-09 must keep that for slot judging.

## Not measured

- **The interactive cells** above: background dispatch, the user's permission mode, and permission prompts for
  an outside worktree.
- **`WorktreeCreate` and `WorktreeRemove` hooks.** The probe plugin registers neither on purpose (a
  `WorktreeCreate` hook replaces Claude Code's own worktree creation, which P1 measured), so whether one could
  set the base or the path is unknown.
- **M2 with a `cd` prefix or `git -C`**, and M1 with a reset to the wave base: the re-runs the recommendation
  depends on.
- **Whether Claude Code removes an isolated worktree that has no changes at all**; the no-commit worker left an
  untracked file.
- **Several isolated Agent calls at once** (concurrent worktree creation), which belongs to P3 and P6.
- **Platforms other than Windows**: the `/tmp` path mismatch is Git Bash's, and may not occur elsewhere.
