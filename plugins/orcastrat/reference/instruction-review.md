# Instruction-file review

`plan` and `run` read this file only when `instructions-ack --check` printed `REVIEW`: an instruction file changed, was added or was removed since the user last chose Continue, or the files were never acknowledged. It is the full review. Orcastrat never edits an instruction file: the review reports, and what to change is up to the user.

You start with:

- **The files** the instruction-file check found, each relative to the repository root, with `/` between its parts.
- **The threshold.** For `run`, the value `<n>` of the plan header line `- Instructions max lines: <n>`: Grep `<plan dir>/plan.md` for `^- Instructions max lines:`. With no such line there is no threshold. `plan` never has one: its start checks run before plan.md exists.
- **`--yes`**, if the user gave it.

`<repository root>` is the directory `git rev-parse --show-toplevel` prints. Write the review and the fix prompt with the Write tool, in `<repository root>/.orcastrat/instructions/`. The toolchain check's exclude line keeps that directory out of `git status`, and `git clean -fd` never removes it. Never write inside `.git` yourself: the acknowledgement goes through the `instructions-ack` script.

## 1. Complete the file set

1. Read every file in full.
2. Add the files they import. An import is `@` followed by a path, such as `@docs/rules.md`, `@~/.claude/my-rules.md` or `@/etc/team-rules.md`, outside any backtick code span and outside any fenced code block. A relative path resolves from the directory of the file that holds the import, and `~` is your home directory. Add each imported file that exists to the set, read it in full, and resolve its own imports the same way, at most four hops from a file the check found. Write an imported path relative to the repository root, with `/` between its parts, when it is inside the repository, and otherwise as its absolute path with `/` between its parts.
3. Read `~/.claude/CLAUDE.md` if it exists. It is information only: it isn't in the set, gets no findings, and isn't acknowledged.

## 2. Find the findings

Every finding cites `path:line`, its file and the first line of the passage, and has a class and an action.

**Leanness**, content that every session and every worker pays for without needing it:

| Class | What it is | Action |
|---|---|---|
| Derivable content | File trees, file-by-file descriptions, content Claude can derive from the code | Run `/doctor`, which proposes these cuts. |
| API reference | Detailed API reference | Replace it with a link to the docs. |
| Sometimes relevant | Knowledge relevant only sometimes | Move it to a skill, which loads on demand. |
| Always required | A rule that must hold every time | Convert it to a hook. |
| Self-evident | Standard conventions, self-evident advice | Delete it. |
| Emphasis | Emphasis (`IMPORTANT`, capitals) on many lines | Keep it on the one rule Claude actually skips. |
| Imported content | Content moved into `@` imports | Imports load too. Move it to a skill instead. |

For derivable content, flag the location only: `/doctor` does the analysis, so don't repeat it.

**Conflicts**, rules that work against an Orcastrat run: pushing, switching branches or rewriting history; running the whole test suite after every change; skipping tests or verification. A rule to commit is not a conflict. Action: `Remove it, or scope it to work outside Orcastrat runs.`

**Size**, only with a threshold: when the files of the set hold more than `<n>` lines in total, one finding, citing the longest file at line 1: `<total> lines load, over the threshold of <n>.` Action: `Apply the other findings' actions until the total is under <n>.`

## 3. Write the review

Write `.orcastrat/instructions/review.md`, replacing any earlier one, in this shape:

```markdown
# Instruction-file review

Conflicts: <none, or the count, a colon, and each conflict's path:line>

Files reviewed: <count>, <total> lines.

## Findings

### <class> (<count>)

- `<path:line>`: <what the passage is, in a few words>. Action: <the class's action>

## General checks

- Run `/doctor`: it proposes cuts for file trees, file-by-file descriptions and content Claude can derive from the code.
- Run `/context` to confirm which instruction files actually loaded.
- For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it.

## User-level instructions (information only)

`~/.claude/CLAUDE.md`: <its line count> lines, loaded in every project. It isn't checked.
```

- The `Conflicts:` line is exactly one line: `Conflicts: none`, or `Conflicts: <count>: ` followed by each conflict's `path:line`, separated by `, `. `plan` and `run` show it on every later start while the files stay acknowledged.
- Give one `###` section per class that has findings: Conflicts first, then the leanness classes in the table's order, then Size. With no findings, `## Findings` holds the one line `None.`
- Without `~/.claude/CLAUDE.md`, the last section holds the one line `~/.claude/CLAUDE.md: not present.`

## 4. Write the fix prompt

Write `.orcastrat/instructions/fix-prompt.md`, replacing any earlier one. With findings, it is exactly this text:

```markdown
Clean up this repository's Claude Code instruction files, following the review in `.orcastrat/instructions/review.md`.

1. Re-read CLAUDE.md, AGENTS.md and `.orcastrat/instructions/review.md` in full, even if you think you know them.
2. Produce a plan with a detailed task list for the cleanup. Each task needs no new reasoning or design decisions, and is small and mechanical enough for Sonnet: it names the file and the lines it changes, and gives the exact text to remove, move or write.
3. Then execute the tasks, one at a time, in order.

Change only what the review lists. Where an action moves content into a skill or a hook, creating that skill or hook is a task of its own. For the file trees and derivable content the review flags, run `/doctor` and apply its cuts instead of repeating its analysis.
```

With no findings, it is the one line `No instruction-file findings: nothing to clean up.`

## 5. Acknowledge, report and ask

The acknowledgement records every file of the set, imports included and `~/.claude/CLAUDE.md` left out. Run it as one line, from the repository root: `cd "<repository root>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/instructions-ack" <choice> "<file>" ...`, passing each file in double quotes. If it exits 2, end before anything starts, quoting its `error:` line (for `run`, reason SETUP).

- **No findings:** acknowledge with choice `continue`, with or without `--yes`, and go on to the model check without a word.
- **Findings, under `--yes`:** don't ask and don't acknowledge, so the next start reviews the files again. Show one line, `Instruction files: <count> findings (<count> <class>, ...). Review: .orcastrat/instructions/review.md`, and go on to the model check.
- **Findings, otherwise:** show a summary of at most 10 lines. Its first line is `Instruction files: <count> findings (<count> <class>, ...)`. Then one line per finding, `<path:line> <class>: <action>`, conflicts first, at most 8 lines: with more than 8 findings, show 7 and then `... <count> more in .orcastrat/instructions/review.md`. Its last line is `Review: .orcastrat/instructions/review.md`. Then ask with the AskUserQuestion tool: one question, `The instruction files have <count> findings. Stop to fix them, or continue?`, header `Instructions`, single choice, with two options:
  - `Stop and fix it`, description `Exit now. Paste .orcastrat/instructions/fix-prompt.md into Claude Code, or run /doctor, then start again.`
  - `Continue`, description `Go on. You won't be asked again until these files change.`

  On `Continue`, acknowledge with choice `continue` and go on to the model check. On `Stop and fix it`, or any other answer, acknowledge with choice `stop`, then end before anything starts: tell the user `Stopped before anything started. To clean up, paste .orcastrat/instructions/fix-prompt.md into Claude Code, or run /doctor.` Write and commit nothing else: no plan files, no marker, no stop reason.
