## Blocking

None.

## Advisory

- `plugins/orcastrat/scripts/recover:106` — trailers are matched across the whole history reachable from the Branch, including commits from earlier plans that reuse the same task IDs. For example, `main` already holds `e3fa35d` with `Orchestratinator-Task: M01-T01` from `plans/orchestratinator-robustness`. So a plan whose Branch already exists when `run` starts, and which still has M01-T01 `todo`, gets a false `done M01-T01`, and `run` marks that task `done` in 2c without running it. The same applies to the `interrupted` list's "newest trailer commit" cut-off. This matches D57 and the preflight check it replaced, so M03 didn't introduce it. It is still a way for work to be skipped silently (D57, spec §7 `recover`).
- `plugins/orcastrat/scripts/verify:40` — if `cd` fails while resolving the git common dir, bash prints its own `cd:` message on stderr before the `error:` line. So stderr gets two lines, not the single `error: <message>` line that D55 and `run`'s **Scripts** definition promise (D55, M03-T04).
- `plugins/orcastrat/scripts/verify:43` — the same problem when `mkdir -p` fails: mkdir's own message comes before the `error:` line (D55, M03-T04).
- `plugins/orcastrat/skills/run/SKILL.md:258` — the Retry section commits `chore(plan): <task ID> attempt 1 failed` and then says only "dispatch again". That the serial scope check's base must be re-recorded after this commit depends on the reader treating "dispatch" as 3d item 1, which records HEAD. If the old recorded HEAD were reused, `scope-check` would report the milestone file as out of scope. Saying explicitly "record HEAD again (3d item 1)" would remove the doubt (D60, D64, M03-T08).
- `tests/orcastrat/verify.bats:110` — the Review Focus test passes the quoted command to `verify` directly as one argv element. It never goes through the one-line, single-quoted `'\''` form that `run` actually writes, so the D65 quoting rule itself is not exercised (Review Focus item 1, D65, M03-T04).
