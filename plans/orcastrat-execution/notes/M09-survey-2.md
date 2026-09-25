# M09 survey 2 — Claude Code docs research

## 1. Instruction-file locations and load timing

Source: https://code.claude.com/docs/en/memory

### (a) Locations and when loaded

Table ("Choose where to put CLAUDE.md files", in load order broadest→most specific):

> | Scope | Location | Purpose |
> | **Managed policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md` · Linux/WSL: `/etc/claude-code/CLAUDE.md` · Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | Organization-wide instructions |
> | **User instructions** | `~/.claude/CLAUDE.md` | Personal preferences for all projects |
> | **Project instructions** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared instructions |
> | **Local instructions** | `./CLAUDE.local.md` | Personal project-specific preferences; add to `.gitignore` |

Load timing:

> "CLAUDE.md and CLAUDE.local.md files in the directory hierarchy above the working directory are loaded at launch. Files in subdirectories load on demand when Claude reads files in those directories."

> "Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from your current working directory and every directory above it. Run Claude Code in `foo/bar/` and it loads instructions from `foo/bar/CLAUDE.md`, `foo/CLAUDE.md`, and any `CLAUDE.local.md` files alongside them."

> "All discovered files are concatenated into context rather than overriding each other. Across the directory tree, content is ordered from the filesystem root down to your working directory... Within each directory, `CLAUDE.local.md` is appended after `CLAUDE.md`, so your personal notes are the last thing Claude reads at that level."

> "Claude also discovers `CLAUDE.md` and `CLAUDE.local.md` files in subdirectories under your current working directory. Instead of loading them at launch, they are included when Claude reads files in those subdirectories."

`.claude/rules/**/*.md` and `paths:` frontmatter:

> "Rules without [`paths` frontmatter](#path-specific-rules) are loaded at launch with the same priority as `.claude/CLAUDE.md`."

> "Rules can be scoped to specific files using YAML frontmatter with the `paths` field. These conditional rules only apply when Claude is working with files matching the specified patterns... Rules without a `paths` field are loaded unconditionally and apply to all files. Path-scoped rules trigger when Claude reads files matching the pattern, not on every tool use."

> "`paths` is the only field Claude Code reads from a rule; any other field is ignored without an error."

User-level rules `~/.claude/rules/`:

> "Personal rules in `~/.claude/rules/` apply to every project on your machine... Claude Code loads user-level rules before project rules, so a project rule appears later in Claude's context than a user rule. Neither set overrides the other: if a user rule and a project rule conflict, Claude may follow either one, so keep the two consistent."

Managed policy:

> "**Precedence**: same as a managed CLAUDE.md file. Loads before user and project CLAUDE.md." / "**Where it's honored**: managed and policy settings only." / "Managed policy CLAUDE.md files cannot be excluded."

### (b) AGENTS.md — native or import-only

Native, conditionally (requires Claude Code v2.1.277+):

> "By default, Claude reads `AGENTS.md` only when you have no `CLAUDE.md` in your working directory or above it."

Table:

> | Your repository has | Claude reads |
> | An `AGENTS.md`, and no `CLAUDE.md` or `CLAUDE.local.md` in your working directory or above it | Your `AGENTS.md` |
> | An `AGENTS.md` and a `CLAUDE.md` or `CLAUDE.local.md` in your working directory or above it | Your `CLAUDE.md` files only |
> | A `CLAUDE.md` that already imports `AGENTS.md` | Your `CLAUDE.md`, with `AGENTS.md` included through the import |

Counting rule:

> "**Count, so Claude reads them instead of `AGENTS.md`**: a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` in your working directory or any directory above it" / "**Don't count, and keep loading alongside `AGENTS.md`**: your `~/.claude/CLAUDE.md`, your organization's managed `CLAUDE.md`, and `.claude/rules/` files"

When no CLAUDE.md counts:

> "**At session start**: every `AGENTS.md` and `.claude/AGENTS.md` in your working directory and the directories above it... **As Claude works in subdirectories**: a subdirectory's `AGENTS.md`, when Claude opens a file there with the Read tool and that subdirectory has none of the three `CLAUDE.md` files of its own... **Not read**: `AGENTS.local.md`, `AGENTS.override.md`, or anything under a `.agents/` directory"

This behavior is user-configurable via `/config` → **Project instructions**: `claude-md-or-agents-md` (default), `claude-md-and-agents-md`, `claude-md`, `managed-only`.

### (c) `@` import syntax

> "CLAUDE.md files can import additional files using `@path/to/import` syntax. Imported files are expanded and loaded into context at launch alongside the CLAUDE.md that references them."

> "Both relative and absolute paths are allowed. Relative paths resolve relative to the file containing the import, not the working directory. Imported files can recursively import other files, with a maximum depth of four hops."

> "Import parsing skips Markdown code spans and fenced code blocks. To mention a path in your CLAUDE.md without importing it, wrap it in backticks: writing `` `@README` `` keeps the text literal, while `@README` outside backticks imports the file."

`~` home paths example:

> ```
> # Individual Preferences
> - @~/.claude/my-project-instructions.md
> ```

External-import approval:

> "An import in a project-level memory file is external when its path resolves outside your working directory, like the home directory import above. The first time Claude Code encounters external imports in a project, it shows an approval dialog listing the files. If you decline, the imports stay disabled and the dialog doesn't appear again."

> "User-scope memory files, such as `~/.claude/CLAUDE.md` and `~/.claude/rules/`, are files you wrote yourself. Except in Cowork sessions on your desktop, Claude Code loads their imports without the dialog and trusts them like the rest of your personal configuration."

## 2. Writing inside `.git/` — Write/Edit and Bash

Sources: https://code.claude.com/docs/en/permission-modes , https://code.claude.com/docs/en/permissions

### Protected paths table (permission-modes.md, "Protected paths")

> "Writes to a small set of paths are never auto-approved, except in `bypassPermissions` mode and in interactive terminal sessions in plan mode with bypass permissions available. This prevents accidental corruption of repository state and Claude's own configuration."

> | Mode | Protected-path writes |
> | `default`, `acceptEdits` | Prompted |
> | `plan` | Allowed in interactive terminal sessions with bypass permissions available. Otherwise, routed to the classifier when auto mode is available during planning, and prompted when it isn't |
> | `auto` | Routed to the classifier |
> | `dontAsk` | Denied |
> | `bypassPermissions` | Allowed |

> "In a session started with `--restricted` ... the classifier can't approve protected-path writes."

> "[`permissions.allow`](/docs/en/permissions#manage-permissions) rules in settings files do not pre-approve protected-path writes. The safety check runs before Claude Code evaluates allow rules from settings, so an entry such as `Edit(.claude/**)` in `~/.claude/settings.json` or `.claude/settings.json` does not change the per-mode outcome in the table above."

Protected directories list (includes `.git` — matches the example path `.git/orcastrat/instructions/review.md`):

> "Protected directories: `.git`, `.config/git`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn`, `.claude` (except for `.claude/worktrees` where Claude stores its own git worktrees)"

`bypassPermissions` mode explicitly:

> "`bypassPermissions` mode disables permission prompts and safety checks so tool calls execute immediately, including writes to protected paths."

> "In `bypassPermissions` mode, Claude Code skips permission prompts, including for writes to protected paths such as `.git` and `.claude`." (permissions.md)

**Answer for `.git/orcastrat/instructions/review.md`**: `default` and `acceptEdits` → prompted (not silently refused, not silently allowed); `bypassPermissions` → allowed with no prompt.

### Bash commands writing inside `.git/`

The docs only document checks on **redirect and `tee` targets** inside Bash commands, treated the same as a direct Write/Edit against protected paths:

> "**Output redirects**: for `> file`, `>> file`, or `2> file`, the check covers your `Edit` allow and deny rules, [protected paths], and the [working directories]. A rule such as `Bash(git commit *)` allows the command, not the target."

> "Claude Code also checks the files a `tee` command writes, including in a pipeline such as `make | tee build.log`. The check covers your `Edit` allow and deny rules, protected paths, and the working directories."

No statement was found describing a general check on every Bash command that might write inside `.git/` by other means (e.g., a script or `mkdir`/`cp`) — only redirect and `tee` targets are documented as checked against protected paths.

## 3. AskUserQuestion tool

Source: https://code.claude.com/docs/en/agent-sdk/user-input (the Claude Code CLI "tools reference" page at https://code.claude.com/docs/en/tools-reference only has a short behavioral blurb, quoted below; the parameter schema lives on the Agent SDK page, which the CLI's `-p`/`--allowedTools` docs also point to).

### tools-reference.md blurb

> "## AskUserQuestion tool behavior
> Claude uses `AskUserQuestion` to ask you multiple-choice questions when it needs a decision or a clarification. Answer by picking an option, or type your own text through the `Other` row or the notes field."

> "Questions stay open until you answer them. If you want a question you leave unanswered to eventually close ... set the `askUserQuestionTimeout` setting to `60s`, `5m`, or `10m`."

### Parameter schema (agent-sdk/user-input.md, "Question format")

> | Field | Description |
> | `question` | The full question text to display |
> | `header` | Short label for the question (max 12 characters) |
> | `options` | Array of 2-4 choices, each with `label` and `description`. TypeScript: optionally `preview`. |
> | `multiSelect` | If `true`, users can select multiple options |

Example structure quoted verbatim:

```json
{
  "questions": [
    {
      "question": "How should I format the output?",
      "header": "Format",
      "options": [
        { "label": "Summary", "description": "Brief overview of key points" },
        { "label": "Detailed", "description": "Full explanation with examples" }
      ],
      "multiSelect": false
    }
  ]
}
```

### Limits (agent-sdk/user-input.md, "Limitations")

> "**Subagents**: `AskUserQuestion` is not currently available in subagents spawned via the Agent tool"
> "**Question limits**: each `AskUserQuestion` call supports 1-4 questions with 2-4 options each"

### Non-interactive (`claude -p`) behavior

Source: https://code.claude.com/docs/en/headless

> "With `--permission-prompts none`, Claude Code removes the tools that need an answer from a person, such as [`AskUserQuestion`](/docs/en/tools-reference#askuserquestion-tool-behavior), so Claude can't call them."

> "**`dontAsk`**: Claude Code denies every call that would otherwise prompt... `AskUserQuestion`, connector tools your organization set to `ask`, and MCP tools marked `requiresUserInteraction` are denied even when an allow rule matches"

No text was found stating what happens to a plain `claude -p` run in default Manual mode (no `--permission-mode`/`--permission-prompts` flag) when `AskUserQuestion` is called and no `canUseTool` callback/`--permission-prompt-tool` is registered — the headless doc only documents the `dontAsk` mode and `--permission-prompts none` cases explicitly.

## 4. Glob/Grep and `.gitignore`/`.git/`

Source: https://code.claude.com/docs/en/tools-reference (note: `https://code.claude.com/docs/en/glob-grep` returns HTTP 404 — not a valid page)

### Glob

> "Glob doesn't respect `.gitignore` by default, so it finds gitignored files alongside tracked ones. This differs from Grep, which skips gitignored files. To make Glob respect `.gitignore`, set `CLAUDE_CODE_GLOB_NO_IGNORE=false` before launching Claude Code."

> "Results are sorted by modification time and capped at 100 files."

### Grep

> "Grep respects `.gitignore`, so gitignored files are skipped. To search a gitignored file, Claude passes its path directly."

> "Grep is built on ripgrep and uses ripgrep's regex syntax, not POSIX grep."

### `.git/` directory specifically

No statement in `tools-reference.md` addresses whether Glob or Grep skip the `.git/` directory itself (as distinct from `.gitignore`-listed files). This is unconfirmed by the docs — not stated either way.

Implication for `CLAUDE.local.md` (typically `.gitignore`d): under default settings, **Grep skips it** (respects `.gitignore`); **Glob still finds it** (ignores `.gitignore` by default) unless `CLAUDE_CODE_GLOB_NO_IGNORE=false` is set.

## Unconfirmed

- Whether Glob or Grep skip the `.git/` directory itself is not stated in the docs found (`tools-reference.md`); no page addresses it.
- What happens when `AskUserQuestion` is called in a plain `claude -p` run in default Manual mode with no `canUseTool` callback and no `--permission-prompts`/`--permission-mode` flag — only `dontAsk` mode and `--permission-prompts none` are documented explicitly.
- Whether a Bash command that writes inside `.git/` through means other than an output/input redirect or `tee` (e.g. `cp`, `mkdir`, a script) is checked against protected paths — the docs only document redirect and `tee` targets being checked.

## Conflicts

None found between sources for these four questions.
