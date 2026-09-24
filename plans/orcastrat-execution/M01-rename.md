# M01: Rename to Orcastrat (Change 24)

- Status: in-progress
- Format: 2
- Goal: The plugin lives at `plugins/orcastrat/` with name `orcastrat`, the marketplace catalog lists it (with a `renames` entry), and every skill, agent, reference, and README says Orcastrat and uses `orcastrat` identifiers. The only exceptions are the compatibility points: recovery also matches the old `Orchestratinator-Task:` trailer, `ORCHESTRATINATOR_MAIN` is still set, `run` reports old `orchestratinator/` directories, and the README has the "Formerly" note and the upgrade steps. `./scripts/Validate-All.ps1` passes.
- Depends on: none
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && ! grep -rin orchestratinator plugins/orcastrat | grep -v -e 'Orchestratinator-Task' -e 'ORCHESTRATINATOR_MAIN' -e 'orchestratinator/' -e 'Formerly Orchestratinator' -e 'Upgrading from Orchestratinator' -e 'was called Orchestratinator' -e 'orchestratinator@timschreiber'`

## Context

Governing sources: spec §25 (Change 24), and Decisions D10, D17, D18, D19, D20, D25, D26.

Rename rules for every text edit in this milestone:
- `Orchestratinator` becomes `Orcastrat`, and `orchestratinator` becomes `orcastrat`. Replacements are case-sensitive. `ORCHESTRATINATOR_MAIN` is uppercase, so these replacements don't touch it; the steps handle it explicitly.
- The only places the old name may remain are the ones the Steps list: the old trailer matched in recovery greps, `ORCHESTRATINATOR_MAIN` set alongside `ORCASTRAT_MAIN`, the leftover `orchestratinator/` directory check, the README's "Formerly" note, name history and upgrade section, and the two existing CHANGELOG lines (D20).

Don't touch `docs/`, `plans/` (except this plan's own notes), `shared/`, or `plugins/denoizinator-net/` (D19).

This milestone is Markdown and JSON only. No test harness exists yet (bats arrives in M02, D03), so Verify commands are grep checks run from the repo root in bash, plus `./scripts/Validate-All.ps1`.

The run executing this plan is the installed, pre-rename plugin, so this plan's own commits carry `Orchestratinator-Task:` (D37). That is expected.

Waves: 4 (widths 1, 1, 2, 2)

## Coverage

- `docs/orcastrat-execution-spec.md` §25 item 1: `git mv` the plugin directory; `name` is `orcastrat` in `plugin.json` and `marketplace.json` → M01-T02
- `docs/orcastrat-execution-spec.md` §25 item 2: every explicit mention of the namespaced names updated (skills, agents, README, CHANGELOG, repo CLAUDE.md) → M01-T02, M01-T03, M01-T04, M01-T05, M01-T06
- `docs/orcastrat-execution-spec.md` §25 item 3: paths inside `.git` use `orcastrat/` → M01-T04, M01-T05, M01-T06
- `docs/orcastrat-execution-spec.md` §25 item 4: new commits use `Orcastrat-Task:`, and recovery accepts both trailers → M01-T03, M01-T04, M01-T05, M01-T06
- `docs/orcastrat-execution-spec.md` §25 item 5: preflight prunes and reports old `orchestratinator/` directories, never deletes them → M01-T04
- `docs/orcastrat-execution-spec.md` §25 item 6: all text says Orcastrat; README keeps "Formerly Orchestratinator" and the name history → M01-T03, M01-T04, M01-T05, M01-T06
- `docs/orcastrat-execution-spec.md` §25 item 7: mascot file names and alt text → out of scope (D10)
- `docs/orcastrat-execution-spec.md` §25 item 8: CHANGELOG *Changed* entry with the migration steps → M01-T06
- `docs/orcastrat-execution-spec.md` §25 Migration: README "Upgrading from Orchestratinator" carries the migration steps → M01-T06
- `docs/orcastrat-execution-spec.md` §25 Acceptance: no `orchestratinator` identifier remains except the compatibility points; `claude plugin validate` passes → M01-T02, M01-T03, M01-T04, M01-T05, M01-T06
- D25: `renames` map entry, validated; README says whether Claude Code migrates automatically → M01-T01, M01-T02, M01-T06
- D17: `ORCASTRAT_MAIN`, with `ORCHESTRATINATOR_MAIN` also set → M01-T04, M01-T05
- D18: task branches `orcastrat/<plan-slug>/<task-id>` → M01-T04
- D19: root README renamed → M01-T02
- D26: CLAUDE.md plugin name → M01-T02

## Review Focus

None found: M01 edits only Markdown and JSON, and no test harness exists until M02 (D03). Checked three things. The old-trailer match in recovery is pinned by the Verify greps of M01-T03 and M01-T04; behavior tests for `recover` with both trailers come in M03. The `ORCHESTRATINATOR_MAIN` compatibility is pinned by the Verify greps of M01-T04 and M01-T05. The catalog's acceptance of the `renames` entry is checked by M01-T02's Verify, which runs `claude plugin validate` through `Validate-All.ps1`.

## Tasks

### M01-T01: Research how Claude Code handles the marketplace `renames` map

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orcastrat-execution/notes/M01-T01.md`
- Verify: review
- Commit: `docs(plan): research marketplace renames behavior`

**Objective**

`plans/orcastrat-execution/notes/M01-T01.md` records the documented shape of `marketplace.json`'s `renames` field and whether Claude Code migrates existing installs automatically, with cited URLs.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 (the rename and its migration steps)
- `CLAUDE.md`, the bullet starting "**`name` is permanent**" (the renames rule)

**Steps**

1. Fetch `https://code.claude.com/docs/en/plugin-marketplaces` and `https://code.claude.com/docs/en/plugins-reference`. If either has moved, web-search `claude code marketplace.json renames` and use the official docs page it finds.
2. In the note, under `## Shape`, quote the documented definition of the `renames` field and one documented example, with the URL.
3. Under `## Existing installs`, quote what the docs say happens to an installed plugin under the old name when the marketplace is updated with a `renames` entry: whether it is migrated automatically, and what happens to `enabledPlugins` keys. Give the URL. If the docs say nothing, write `Not documented.`
4. Under `## Validation`, quote anything the docs say about `claude plugin validate` checking `renames`, with the URL, or write `Not documented.`
5. End the note with exactly these two lines:
   - `RENAMES-SHAPE: <the documented example as one line of JSON>`
   - `AUTO-MIGRATE: yes`, `AUTO-MIGRATE: no`, or `AUTO-MIGRATE: unknown`. Use `yes` or `no` only when the docs state it; otherwise use `unknown`.

**Done when**

- The note has the three sections, each quoting the docs with a URL or saying `Not documented.`
- The note ends with a `RENAMES-SHAPE:` line and an `AUTO-MIGRATE:` line with one of the three values.

### M01-T02: Move the plugin directory and rename it in the catalog, root README, and CLAUDE.md

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M01-T01
- Files: `plugins/orchestratinator/.claude-plugin/plugin.json`, `plugins/orchestratinator/README.md`, `plugins/orchestratinator/agents/milestone-reviewer.md`, `plugins/orchestratinator/agents/plan-reviewer.md`, `plugins/orchestratinator/agents/planner.md`, `plugins/orchestratinator/agents/reviewer.md`, `plugins/orchestratinator/agents/scout-heavy.md`, `plugins/orchestratinator/agents/scout.md`, `plugins/orchestratinator/agents/specialist.md`, `plugins/orchestratinator/agents/worker-heavy.md`, `plugins/orchestratinator/agents/worker-light.md`, `plugins/orchestratinator/agents/worker.md`, `plugins/orchestratinator/reference/plan-format.md`, `plugins/orchestratinator/skills/plan/SKILL.md`, `plugins/orchestratinator/skills/run/SKILL.md`, `plugins/orchestratinator/skills/status/SKILL.md`, `plugins/orcastrat/.claude-plugin/plugin.json`, `plugins/orcastrat/README.md`, `plugins/orcastrat/agents/milestone-reviewer.md`, `plugins/orcastrat/agents/plan-reviewer.md`, `plugins/orcastrat/agents/planner.md`, `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/specialist.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/reference/plan-format.md`, `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/skills/run/SKILL.md`, `plugins/orcastrat/skills/status/SKILL.md`, `.claude-plugin/marketplace.json`, `README.md`, `CLAUDE.md`
- Verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && test -f plugins/orcastrat/.claude-plugin/plugin.json && test ! -e plugins/orchestratinator && grep -q '"name": "orcastrat"' plugins/orcastrat/.claude-plugin/plugin.json && grep -q '"source": "./plugins/orcastrat"' .claude-plugin/marketplace.json && grep -q '"orchestratinator": "orcastrat"' .claude-plugin/marketplace.json && grep -q 'claude plugin install orcastrat@timschreiber' README.md && grep -q '`orcastrat`: skills' CLAUDE.md`
- Fails first: no (a move and JSON/Markdown renames with no tests; Verify fails until the move and renames are done)
- Commit: `refactor(orcastrat): move the plugin to plugins/orcastrat and rename it in the catalog`

**Objective**

The plugin lives at `plugins/orcastrat/` with `name` `orcastrat`, the catalog lists it with a `renames` entry, and the root README and CLAUDE.md name it `orcastrat`.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 items 1–2
- `plans/orcastrat-execution/notes/M01-T01.md` (its `RENAMES-SHAPE:` line)

**Interfaces**

- Consumes: `"source": "./plugins/orchestratinator"` (existing, `.claude-plugin/marketplace.json:27`)
- Produces: `plugins/orcastrat/`
- Produces: `"name": "orcastrat"`
- Produces: `"renames": {"orchestratinator": "orcastrat"}`

**Steps**

1. Read the `RENAMES-SHAPE:` line of `plans/orcastrat-execution/notes/M01-T01.md`. If it is not a JSON object that maps an old plugin name string to a new plugin name string, stop and report a GAP quoting that line.
2. Run `git mv plugins/orchestratinator plugins/orcastrat`.
3. In `plugins/orcastrat/.claude-plugin/plugin.json`, set `"name": "orcastrat"` and `"displayName": "Orcastrat"`, and set `"homepage"` to `"https://github.com/timschreiber/claude-plugins/tree/main/plugins/orcastrat"`. Change nothing else.
4. In `.claude-plugin/marketplace.json`, in the `plugins` entry whose `"name"` is `"orchestratinator"` (lines 24–38), set `"name": "orcastrat"`, `"displayName": "Orcastrat"`, `"source": "./plugins/orcastrat"`, and `"homepage": "https://github.com/timschreiber/claude-plugins/tree/main/plugins/orcastrat"`. Replace `"renames": {}` with `"renames": {"orchestratinator": "orcastrat"}`. Change nothing else.
5. In the root `README.md`, change line 10's `[orchestratinator](plugins/orchestratinator/README.md)` to `[orcastrat](plugins/orcastrat/README.md)`, and line 22's `claude plugin install orchestratinator@timschreiber` to `claude plugin install orcastrat@timschreiber`.
6. In `CLAUDE.md`, change line 13's `` - `orchestratinator`: skills `` to `` - `orcastrat`: skills ``. Change nothing else in CLAUDE.md (D26).
7. Run Verify.

**Done when**

- `plugins/orchestratinator/` no longer exists, and `git status` shows the 16 files as renames to `plugins/orcastrat/`.
- `plugin.json` and the catalog entry say `orcastrat` / `Orcastrat`, and the catalog has the `renames` entry.
- `Validate-All.ps1` passes (only the expected missing-`version` warnings).

### M01-T03: Rename Orchestratinator in the ten agent files

- Kind: change
- Tier: worker-light
- Batch: yes
- Status: todo
- Wave: 3
- Depends on: M01-T02
- Files: `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`, `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/planner.md`, `plugins/orcastrat/agents/plan-reviewer.md`, `plugins/orcastrat/agents/milestone-reviewer.md`
- Verify: `! grep -rni orchestratinator plugins/orcastrat/agents | grep -v -F '(Orcastrat|Orchestratinator)-Task' && grep -qF -e '-E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"' plugins/orcastrat/agents/milestone-reviewer.md`
- Fails first: no (text replacement with no tests; the Verify grep fails until every replacement is made)
- Commit: `refactor(orcastrat): rename Orchestratinator in agent files`

**Objective**

No agent file names Orchestratinator, except `milestone-reviewer`'s re-review grep, which matches both trailers.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 items 2, 4 and 6

**Interfaces**

- Consumes: `plugins/orcastrat/` (M01-T02)
- Produces: `git log --format=%H -E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"`

**Steps**

1. `plugins/orcastrat/agents/worker.md`: on lines 3 and 10, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
2. `plugins/orcastrat/agents/worker-light.md`: on lines 3 and 9, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
3. `plugins/orcastrat/agents/worker-heavy.md`: on lines 3 and 10, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
4. `plugins/orcastrat/agents/specialist.md`: on lines 3 and 10, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
5. `plugins/orcastrat/agents/scout.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
6. `plugins/orcastrat/agents/scout-heavy.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
7. `plugins/orcastrat/agents/reviewer.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
8. `plugins/orcastrat/agents/planner.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
9. `plugins/orcastrat/agents/plan-reviewer.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`.
10. `plugins/orcastrat/agents/milestone-reviewer.md`: on line 3, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`. On line 53, replace `git log --format=%H --grep="^Orchestratinator-Task: <task ID>$"` with `git log --format=%H -E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"`.

**Done when**

- Verify passes: the only remaining `orchestratinator` text in `plugins/orcastrat/agents/` is the two-trailer grep on `milestone-reviewer.md` line 53.

### M01-T04: Rename Orchestratinator in the run skill, keeping old-trailer and old-variable compatibility

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M01-T02
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `test "$(grep -ci orchestratinator plugins/orcastrat/skills/run/SKILL.md)" = 3 && grep -qF -e '-m "Orcastrat-Task: <task ID>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF -e '-E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"' plugins/orcastrat/skills/run/SKILL.md && grep -qF -e 'ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF -e '**Pre-rename leftovers.**' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text edits with no tests; the Verify greps fail until the edits are made)
- Commit: `refactor(orcastrat): rename Orchestratinator in the run skill`

**Objective**

The run skill uses `orcastrat` names, paths, branches and the `Orcastrat-Task:` trailer. Its recovery also matches the old trailer, its Worktree setup sets both variables, and its preflight reports old `orchestratinator/` directories.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 items 2–6
- `plugins/orcastrat/skills/run/SKILL.md` lines 25–62 (definitions and preflight 2a) and line 186

**Interfaces**

- Consumes: `plugins/orcastrat/` (M01-T02)
- Produces: `Orcastrat-Task: <task ID>`
- Produces: `ORCASTRAT_MAIN`
- Produces: `orcastrat/<plan-slug>/<task-id>`
- Produces: `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`, case-sensitively, everywhere in the file. This covers lines 3, 32, 33, 36, 38, 40, 61, 99, 106, 111, 113, 119, 158, 178, 204, 213, 222, 230 and 276. It turns the WT_ROOT path into `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>`, the task branch into `orcastrat/<plan-slug>/<task-id>`, the verify logs into `.orcastrat-verify.log` and `orcastrat-verify.log`, and the trailer written on line 40 into `Orcastrat-Task: <task ID>`.
2. In preflight item 6 (line 61), replace `git log <branch> --format=%H --grep="^Orcastrat-Task: <task ID>$"` with `git log <branch> --format=%H -E --grep="^(Orcastrat|Orchestratinator)-Task: <task ID>$"`, and append this sentence to the end of the item: ` Both trailers are matched, so plans started before the rename recover.`
3. On line 186, replace `` `cd "<worktree>" && ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`. `` with `` `cd "<worktree>" && ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`; the old name is set too, for setup commands in plans written before the rename. ``
4. In section 2a, after item 6, add this new item as its own line:
   ``7. **Pre-rename leftovers.** If a directory named `orchestratinator/` exists in the directory `git rev-parse --git-dir` prints or in the one `git rev-parse --git-common-dir` prints, run `git worktree prune` (the one write in these checks) and tell the user in one line that the old `orchestratinator/` directory can be deleted. Never delete it yourself. This check never stops the run.``
5. Run Verify.

**Done when**

- Exactly three lines of the file contain `orchestratinator` in any case: the two-trailer recovery grep, the Worktree setup line, and the Pre-rename leftovers item.
- The commit trailer the skill writes is `Orcastrat-Task: <task ID>`.

### M01-T05: Rename Orchestratinator in the plan and status skills and the plan format

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M01-T04
- Files: `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/skills/status/SKILL.md`, `plugins/orcastrat/reference/plan-format.md`
- Verify: `! grep -qi orchestratinator plugins/orcastrat/skills/plan/SKILL.md plugins/orcastrat/skills/status/SKILL.md && test "$(grep -ci orchestratinator plugins/orcastrat/reference/plan-format.md)" = 2 && grep -qF '$ORCASTRAT_MAIN' plugins/orcastrat/skills/plan/SKILL.md && grep -qF '`ORCASTRAT_MAIN` (and, for plans written before the rename, also `ORCHESTRATINATOR_MAIN`)' plugins/orcastrat/reference/plan-format.md && grep -qF 'Orcastrat-Task: <task ID>' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (skill and reference text edits with no tests; the Verify greps fail until the edits are made)
- Commit: `refactor(orcastrat): rename Orchestratinator in the plan and status skills and plan format`

**Objective**

The plan and status skills name nothing Orchestratinator, and the plan format documents `ORCASTRAT_MAIN` and the `Orcastrat-Task:` trailer, with the old names noted for compatibility.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 items 2–4 and 6

**Interfaces**

- Consumes: `Orcastrat-Task: <task ID>` (M01-T04)
- Consumes: `ORCASTRAT_MAIN` (M01-T04)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat` (lines 3, 36, 37, 175, 195). On line 67, replace `$ORCHESTRATINATOR_MAIN` with `$ORCASTRAT_MAIN`.
2. In `plugins/orcastrat/skills/status/SKILL.md`, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat` (lines 3, 26, 32).
3. In `plugins/orcastrat/reference/plan-format.md` line 76 (the Worktree setup row), replace ``the environment variable `ORCHESTRATINATOR_MAIN` `` with ``the environment variable `ORCASTRAT_MAIN` (and, for plans written before the rename, also `ORCHESTRATINATOR_MAIN`)``.
4. In `plugins/orcastrat/reference/plan-format.md` line 230 (the Commit row), replace `Orchestratinator-Task: <task ID>` with `Orcastrat-Task: <task ID>`, and insert the sentence ``Recovery also matches the pre-rename `Orchestratinator-Task:` trailer.`` at the end of that row's text, just before the closing ` |`.
5. Run Verify.

**Done when**

- `plan/SKILL.md` and `status/SKILL.md` contain no `orchestratinator` in any case.
- `plan-format.md` contains exactly two such lines: the Worktree setup row and the Commit row.

### M01-T06: Rename the plugin README and add the "Formerly" note, upgrade steps, and CHANGELOG entry

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M01-T01, M01-T02, M01-T04
- Files: `plugins/orcastrat/README.md`, `CHANGELOG.md`
- Verify: `grep -q '^# Orcastrat' plugins/orcastrat/README.md && grep -q '^## Upgrading from Orchestratinator' plugins/orcastrat/README.md && grep -qF 'Formerly Orchestratinator. Name history: phase-runner → Deligatinator → Optimizinator → Orchestratinator → Orcastrat.' plugins/orcastrat/README.md && grep -qF 'claude plugin install orcastrat@timschreiber' plugins/orcastrat/README.md && ! grep -ni orchestratinator plugins/orcastrat/README.md | grep -v -e 'Formerly Orchestratinator' -e 'Upgrading from Orchestratinator' -e 'was called Orchestratinator' -e 'orchestratinator@timschreiber' -e 'Orchestratinator-Task:' && grep -q '^### Changed' CHANGELOG.md && grep -qF 'orcastrat: renamed from Orchestratinator' CHANGELOG.md` + review
- Fails first: no (README and CHANGELOG prose with no tests; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): rename the README, add upgrade steps and the rename changelog entry`

**Objective**

The plugin README says Orcastrat throughout, has the "Formerly Orchestratinator" note with the name history and an "Upgrading from Orchestratinator" section, and the CHANGELOG has a *Changed* entry for the rename with the migration steps.

**Read first**

- `docs/orcastrat-execution-spec.md` §25 items 6 and 8, and "Migration"
- `plans/orcastrat-execution/notes/M01-T01.md` (its `AUTO-MIGRATE:` line)

**Interfaces**

- Consumes: `plugins/orcastrat/` (M01-T02)
- Consumes: `Orcastrat-Task: <task ID>` (M01-T04)
- Consumes: `orcastrat/<plan-slug>/<task-id>` (M01-T04)
- Produces: `## Upgrading from Orchestratinator`

**Steps**

1. In `plugins/orcastrat/README.md`, replace every `Orchestratinator` with `Orcastrat` and every `orchestratinator` with `orcastrat`, case-sensitively (lines 1, 5, 11, 14, 19, 20, 21, 51, 53, 106, 108).
2. Replace the whole "**Recoverable.**" bullet (line 108) with: ``- **Recoverable.** Every task commit carries an `Orcastrat-Task:` trailer, so an interrupted run recovers its progress from git history on the next start. Commits from before the rename carry `Orchestratinator-Task:`, which recovery also matches.``
3. After line 3 (`Big asks. Small tasks. Right-sized models.`), insert a blank line and then this line: `Formerly Orchestratinator. Name history: phase-runner → Deligatinator → Optimizinator → Orchestratinator → Orcastrat.`
4. Directly before the `## How to use` heading, insert this section, followed by a blank line:

   ```markdown
   ## Upgrading from Orchestratinator

   Orcastrat was called Orchestratinator. To move an existing install to the new name:

   1. Finish or pause any active runs.
   2. `claude plugin uninstall orchestratinator@timschreiber`
   3. `claude plugin marketplace update timschreiber`
   4. `claude plugin install orcastrat@timschreiber`
   5. Restart Claude Code. Repeat on every machine where the plugin is installed.
   ```

5. Read the `AUTO-MIGRATE:` line of `plans/orcastrat-execution/notes/M01-T01.md`. If it is `AUTO-MIGRATE: yes`, add this paragraph after the numbered list in the new section, separated by a blank line: ``Claude Code applies the marketplace's `renames` entry to existing installs, so after `claude plugin marketplace update timschreiber` an installed `orchestratinator@timschreiber` becomes `orcastrat@timschreiber` on its own. The steps above are the fallback if it doesn't.`` If it is `no` or `unknown`, add nothing.
6. In `CHANGELOG.md`, after line 11 (the last `### Added` entry), insert a blank line, the heading `### Changed`, and then this entry: ``- orcastrat: renamed from Orchestratinator (plugin `orchestratinator` is now `orcastrat`, with a `renames` entry in the marketplace catalog). Migration: finish or pause any active runs; `claude plugin uninstall orchestratinator@timschreiber`; `claude plugin marketplace update timschreiber`; `claude plugin install orcastrat@timschreiber`; restart Claude Code, on every machine where the plugin is installed.`` Leave lines 10 and 11 unchanged (D20).
7. Run Verify.

**Done when**

- The README's only remaining old-name text is the "Formerly" line, the "Upgrading from Orchestratinator" section (its heading, its first sentence, and its uninstall step, plus the optional auto-migration paragraph), and the old-trailer sentence.
- The CHANGELOG has a `### Changed` section with the rename entry, and its two existing `orchestratinator:` lines are unchanged.
