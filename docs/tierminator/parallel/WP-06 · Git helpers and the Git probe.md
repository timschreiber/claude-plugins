# WP-06 · Git helpers and the Git probe

```text
Work package WP-06 · Git helpers and the Git probe
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md from WP-01 and WP-02, plugins/tierminator/scripts/lib/git.js and tests/tierminator for how Git tests make real repositories.

Goal: git.js can create and remove worktrees and branches, cherry-pick with conflict reporting, and fast-forward the run branch, all tested against real repositories, with the Git behavior on Windows measured.

Depends on: WP-01, WP-02.
Spec sections: Integration; The dispatch of one task (M2); Resuming (cleanup); Probes (P6).

Scope:
- New functions in lib/git.js, in its existing style (they swallow errors and return a nothing-happened value; lock-type errors are retried with gitPatiently): worktreeAdd(cwd, path, branch, base); worktreeRemove(cwd, path) (forced, retried on locks); worktreePrune; branchDelete; branchesMatching(prefix) and worktreesMatching(prefix) for finding what an earlier run left; worktreeList; cherryPick(cwd, sha) returning ok or the list of conflicting files, leaving the pick in progress on a conflict and never using -x; pickInProgress(cwd) (CHERRY_PICK_HEAD present); fastForward(cwd, branch) using merge --ff-only; commitsSince accepts any worktree path as cwd. Callers serialize worktreeAdd through the state lock later; say so in a comment.
- P6, a probe script under probes/tierminator-parallel/ with evidence probes/evidence/tierminator-parallel-p6-*.json, run on this machine: concurrent git worktree add from two processes, a long worktree path, trailers surviving a cherry-pick without -x, one index.lock per worktree, removing a worktree that holds a locked file, a conflicting pick's exit code and status. Add a P6 section to docs/tierminator/tierminator-parallel-findings.md.
- Tests in tests/tierminator/git-worktree.test.js with real temporary repositories (the tests need git): every function above, including a conflict, a clean pick, a pick of a commit whose message has the Tierminator trailers (kept), a fast-forward that is refused when the branch has moved, and removal of a worktree with a dirty tree.

Out of scope: hooks, state, anything that decides when these run.

Acceptance criteria:
- The tests above pass on Windows and are written without POSIX assumptions.
- The findings answer each question in the spec's P6 row with evidence, and say what the helpers do about any limit found (for example a path length cap).
- node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
