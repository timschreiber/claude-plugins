## Blocking

None.

## Advisory

- `scripts/run-bats.sh:13` — the clone runs only when `.tools/bats-core` is missing as a directory, so an interrupted first clone (directory created, `bin/bats` absent) makes every later run fail at `exec "$bats_dir/bin/bats"` until the directory is deleted by hand, and a future `BATS_TAG` bump never refreshes an existing clone; testing for `$bats_dir/bin/bats` (and removing a partial directory before cloning) would make it self-healing (M02-T03, D02)
- `scripts/Validate-All.ps1:42` — `Get-ChildItem` without `-Force` skips hidden items, and on Linux/macOS PowerShell treats every dot-prefixed file and directory as hidden, so a `.ps1` under a dot directory of `plugins/orcastrat/` (or a dot-file under `scripts/`/`hooks/` with `pwsh`) is caught by the bats check (`find`/`grep -r`) but not by the local gate; the two D11 implementations can disagree (M02-T04, D11, §20 item 9 "so the local gate matches CI")
- `scripts/Validate-All.ps1:43` — `.Extension -ceq '.ps1'` and `tests/orcastrat/no-powershell.bats:12` (`find -name '*.ps1'`) are both case-sensitive, so a `Helper.PS1` file passes both checks although D11 says "fails on any `.ps1` file" (M02-T04, M02-T07, D11)
- `plugins/orcastrat/agents/plan-reviewer.md:49` — check 11 lists the `-and`, `-or` and `-not` operators as non-bash syntax, but they are valid `find` operators in bash (`find . -name x -not -path y`), so a correct bash Verify can draw an advisory false positive; qualifying them as PowerShell comparison operators (for example `$a -and $b`) would avoid it (M02-T10, D45)
- `plans/orcastrat-execution/notes/M02-T02.md:59` — the inventory row cites `plugins/orcastrat/skills/plan/SKILL.md:163`, but M02-T09 later inserted a bullet at line 101, so that `git status --porcelain` is now at line 164; M15 copies this inventory into the CHANGELOG (M02-T02, M02-T09, §20 item 1)
