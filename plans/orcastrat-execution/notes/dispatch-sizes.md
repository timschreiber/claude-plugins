# Dispatch sizes (D14)

Characters, counted with `LC_ALL=C.UTF-8 wc -m`. Files are counted as committed (`git show HEAD:<path>`), so working-tree line endings don't change the count. M06 adds the "after" sizes for the same tasks, counted the same way.

## Before (M04)

Before = dispatch message + milestone file + `plan.md` (D14). The dispatch message is the three lines `run` sent before M04, each ending in a newline: `Plan: plans/orchestratinator-robustness`, then `Milestone:` and `Task:` with the task's IDs.

| Tier | Task | Dispatch message | Milestone file | plan.md | Total |
|---|---|---|---|---|---|
| worker-light | M01-T01 | 69 | 6224 | 25155 | 31448 |
| worker | M04-T06 | 69 | 24256 | 25155 | 49480 |

The tasks are the first `worker-light` task and the first `worker` task of `plans/orchestratinator-robustness`, in milestone table order and then task order: M01-T01 in `M01-format-versioning.md` and M04-T06 in `M04-fails-first.md`. No plan in the repository has a task planned at `worker-heavy` or `specialist`, so those tiers have no row (D69).

## After (M06)

After = dispatch message + brief (D14). The dispatch message is the two lines `run` sends a task's first attempt from M06 on, each ending in a newline: `Brief:` with the path `task-brief` printed, and `Report:` with the report file's absolute path (D100). Both paths are this machine's, so the message's length depends on where the repository is. The brief is the file `task-brief` wrote for the task; the worker reads it instead of the milestone file and `plan.md`. `task-brief` strips carriage returns, so working-tree line endings don't change its size.

| Tier | Task | Dispatch message | Brief | Total |
|---|---|---|---|---|
| worker-light | M01-T01 | 261 | 26520 | 26781 |
| worker | M04-T06 | 261 | 30789 | 31050 |
