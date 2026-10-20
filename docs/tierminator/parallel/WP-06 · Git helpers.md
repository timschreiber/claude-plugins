# WP-06 · Git helpers

```text
Work package WP-06 · Git helpers
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md from WP-01 and WP-02, plugins/tierminator/scripts/lib/git.js and tests/tierminator for how Git tests make real repositories.

Goal: git.js can create and remove worktrees and branches, cherry-pick with conflict reporting and abort, and add the exclude entry, all tested against real repositories on Windows.

Depends on: WP-01.
Spec sections: Integration; The dispatch of one task (option C); Resuming (cleanup).

Scope:
- New functions in lib/git.js, in its existing style (they swallow errors and return a nothing-happened value; lock-type errors are retried with gitPatiently): worktreeAdd(cwd, path, branch, base); worktreeRemove(cwd, path) (forced, retried on locks); worktreePrune; branchDelete; branchesMatching(prefix) and worktreesMatching(prefix) for finding what an earlier run left; worktreeList; cherryPick(cwd, sha) returning ok or the list of conflicting files, leaving the pick in progress on a conflict and never using -x; cherryPickAbort(cwd) (git cherry-pick --abort, leaving the tree as it was); pickInProgress(cwd) (CHERRY_PICK_HEAD present); commitsSince accepts any worktree path as cwd. Callers serialize worktreeAdd through the state lock later; say so in a comment.
- Added by the WP-01 findings (read their Recommendation): excludeWorktrees(cwd) adds `.claude/worktrees/` to the repository's info/exclude once (find the file with `git rev-parse --git-path info/exclude`, so it works from a linked worktree; a second call changes nothing) and reports whether the entry is present, because otherwise the main tree shows `?? .claude/` as soon as Claude Code makes an isolated worktree, and that fails the clean-tree check. toWorktreePath(p) returns an absolute path in drive-letter form with forward slashes (`C:/Users/...`), which is what a `Worktree:` line carries and what file tools resolve correctly; it is never the `/tmp/...` form Git Bash prints for `pwd`, which sent a write to the wrong place in P1. worktreeRemove also copes with a worktree that is locked or holds a locked file. branchesMatching and worktreesMatching find tierminator's own (branches `tierminator/<runId>/*`, worktrees `.claude/worktrees/tierminator-*`) and nothing else, so the user's own worktrees and branches are never matched.
- Tests in tests/tierminator/git-worktree.test.js with real temporary repositories (the tests need git): every function above, including a conflict, a clean pick, a pick of a commit whose message has the Tierminator trailers (kept), a conflicting pick aborted and the tree restored, a concurrent worktree add from two processes (the probes never ran the hooks concurrently), a long worktree path, removal of a worktree with a dirty tree, removal of a locked worktree, excludeWorktrees (adds once, idempotent, works from a linked worktree, leaves the main tree's status empty), toWorktreePath (a Windows temp path becomes `C:/...`; a path already in that form is unchanged) and the leftover finders (tierminator's branches and worktrees found, a user's own worktree and branch left unmatched).

Out of scope: hooks, state, anything that decides when these run.

Acceptance criteria:
- The tests above pass on Windows and are written without POSIX assumptions.
- node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
