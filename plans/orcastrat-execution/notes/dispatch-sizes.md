# Dispatch sizes (D14)

Characters, counted with `LC_ALL=C.UTF-8 wc -m`. Files are counted as committed (`git show HEAD:<path>`), so working-tree line endings don't change the count. M06 adds the "after" sizes for the same tasks, counted the same way.

## Before (M04)

Before = dispatch message + milestone file + `plan.md` (D14). The dispatch message is the three lines `run` sent before M04, each ending in a newline: `Plan: plans/orchestratinator-robustness`, then `Milestone:` and `Task:` with the task's IDs.

| Tier | Task | Dispatch message | Milestone file | plan.md | Total |
|---|---|---|---|---|---|
| worker-light | M01-T01 | 69 | 6224 | 25155 | 31448 |
| worker | M04-T06 | 69 | 24256 | 25155 | 49480 |

The tasks are the first `worker-light` task and the first `worker` task of `plans/orchestratinator-robustness`, in milestone table order and then task order: M01-T01 in `M01-format-versioning.md` and M04-T06 in `M04-fails-first.md`. No plan in the repository has a task planned at `worker-heavy` or `specialist`, so those tiers have no row (D69).
