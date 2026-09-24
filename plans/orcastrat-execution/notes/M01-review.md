## Blocking

None.

## Advisory

- `plugins/orcastrat/skills/run/SKILL.md:54` — The 2a intro still says "These only read. Stop and report to the user if any fails." The new item 7 (line 62) runs `git worktree prune` and never stops the run. Item 7 states its own exception, but the intro no longer describes every check. (M01-T04, §25 item 5)
- `plugins/orcastrat/skills/run/SKILL.md:62` — `git worktree prune` removes only registrations whose directories are missing. A worktree an interrupted pre-rename run left under `.git/orchestratinator/<slug>/` stays registered with its work in place. Item 4 now checks only the `orcastrat/` WT_ROOT, so that worktree is no longer listed, yet the user is told the old directory "can be deleted". This follows §25 item 5 word for word, so it is not a deviation, but deleting that directory could lose work the user never inspected. (M01-T04, §25 item 5)
- `plugins/orcastrat/README.md:28` — The auto-migration paragraph says an install "becomes `orcastrat@timschreiber` on its own" after `marketplace update`, with no conditions. The docs quoted in `notes/M01-T01.md` say it needs Claude Code v2.1.193 or later, that earlier versions report `plugin-not-found`, and that the migration happens when Claude Code starts with the old name in settings. The paragraph is the plan's literal text, so the fix belongs in the plan wording. (M01-T06, D25)
