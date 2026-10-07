# Grindinator reference

A complete description of what Grindinator does and how each part works: every command, configuration key, file and environment variable. It describes the code as it is. Grindinator is a command-line tool that runs a folder of work packages through Tierminator, one headless Claude Code session per package. The user-facing quick start is the tool's own [`tools/grindinator/README.md`](../../tools/grindinator/README.md), and the design is in the [specification](Grindinator%20%E2%80%94%20Specification.md). The measurements behind the design are in [`grindinator-verification.md`](grindinator-verification.md), and the by-hand end-to-end scenarios are in [`grindinator-e2e-run.md`](grindinator-e2e-run.md).

Built against Claude Code 2.1.289 (the WP-01 verification); the runbook's Results record the versions it has run on.

## Contents

- [What it is](#what-it-is)
- [Requirements and installation](#requirements-and-installation)
- [Commands](#commands)
- [Configuration](#configuration)
- [Work packages](#work-packages)
- [The run](#the-run)
- [Sessions](#sessions)
- [Outcomes](#outcomes)
- [Usage limits](#usage-limits)
- [Decidinator integration](#decidinator-integration)
- [The gate](#the-gate)
- [Exit codes](#exit-codes)
- [Files](#files)
- [Environment variables](#environment-variables)
- [Output and debugging](#output-and-debugging)
- [Setups and permissions](#setups-and-permissions)
- [Known limitations](#known-limitations)
- [Testing](#testing)
- [Evidence](#evidence)

## What it is

Grindinator takes a folder of work packages (Markdown files named `WP-NN · Title.md`) and runs them one after another on a dedicated Git branch, `grindinator/<run name>`. Each package gets its own headless `claude -p` session, which plans the package with Tierminator and executes the plan. Grindinator checks the result, runs an optional gate command, and moves on to the next package, waiting out usage limits and resuming after a stop.

Grindinator is a tool, not a plugin. It has no `marketplace.json` entry and nothing installs it into Claude Code. It does nothing until it is started with `grindinator run`.

| Piece | Kind | Owns |
| --- | --- | --- |
| Grindinator | Command-line tool (`tools/grindinator/`) | Sequencing and recovery: the run branch, the order of packages, the sessions, the gate, the failure policy, usage-limit waits and the run summary. |
| Tierminator | Plugin | One package's planning and execution: the plan, each task on its chosen model and effort, the commits, the retries and the result file. |
| Decidinator | Plugin | Questions: every `AskUserQuestion` call goes to an oracle first, and open decisions go to the decision log and the sidecar. |

They meet at four points only:

1. **Environment variables** going in: Grindinator sets them for each session (see [Environment variables](#environment-variables)).
2. **A Tierminator result file** coming out: each session writes one, and Grindinator reads it to learn the outcome.
3. **Decidinator's decision log and sidecar** in the repository, which Grindinator seeds before the first package and commits after each complete one.
4. **Git:** the run branch, the clean working tree between packages, and the commits.

## Requirements and installation

- **Node 20 or later,** from the `engines` field of `package.json`. Grindinator has no dependencies, and `.npmrc` sets `package-lock=false`, so no lock file is written.
- **Git, with a commit identity** (`user.name` and `user.email`) and at least one commit in the repository.
- **Claude Code,** on the `PATH` (`claude.exe` on Windows).
- **The `tierminator` and `decidinator` plugins,** installed from the `timschreiber` marketplace and kept up to date.
- **A clone of this repository.** `lib/decisions.js` requires `plugins/decidinator/scripts/lib`, so the tool cannot be copied out of the clone on its own.

Run it from the target project's root, either linked once:

```bash
cd tools/grindinator
npm link
cd /path/to/target-project
grindinator run <packages dir>
```

or by path, without linking:

```bash
node /path/to/claude-plugins/tools/grindinator/bin/grindinator run <packages dir>
```

## Commands

`grindinator <command> [options]`. With no arguments it prints the help text to stderr and exits 2. `help`, `--help` and `-h` as the first argument, or `--help` or `-h` anywhere after the command, print the help text to stdout and exit 0. An unknown command is an error: `grindinator: unknown command "<command>"; run grindinator --help` (exit 2). A bad option is reported as `grindinator: <parse error message>` (exit 2). Every error is printed to stderr with the prefix `grindinator: `. An unexpected error prints `grindinator: unexpected error: <message>` and exits 1.

### `grindinator run`

```text
grindinator run <packages dir> [options]
```

Takes exactly one argument, the packages directory (relative paths resolve against the current directory); otherwise it stops with `grindinator: run needs one argument: the packages directory`. The options are the flags in the [Configuration](#configuration) table, plus `--name`.

**Preconditions,** checked in this order. Each failure is an error that exits 2:

1. `--name`, when given, must be a valid run name: `--name: "<name>" is not a valid run name; use letters, digits, ".", "_" and "-", starting with a letter or digit (at most 100 characters)`.
2. Git is installed: `Git is not installed or not on the PATH`.
3. The current directory is inside a repository: `<cwd> is not inside a Git repository`.
4. The configuration is valid: `the configuration is invalid:` followed by one indented line per problem (see [Configuration](#configuration)).
5. The packages are found and valid: `the packages directory <dir> does not exist`, `<dir> is not a directory`, `two packages share the id <id>: <a> and <b>` or `no work packages named "WP-NN · Title.md" in <dir>` (see [Work packages](#work-packages)). Look-alike names print as warnings to stderr and do not stop the run.
6. The preamble file exists, when one is configured: `the preamble file <file> does not exist`.
7. The repository has a commit and an identity: `the repository has no commits yet; commit once, then run again` or `Git has no user name and email for this repository, so the tasks cannot commit; set user.name and user.email`.
8. The working tree is clean: `the working tree has uncommitted changes (<up to five paths>, ...); commit or stash them, then run again`.

Before the working-tree check, `run` adds `.grindinator/` to the repository's local exclude file (`.git/info/exclude`) unless it is already there, so the run's own files never make the tree dirty.

**Run name and branch.** A new run is named by `--name`, or by default `<slug>-YYYYMMDD-HHMMSS`, where the slug is the packages directory's base name, lowercased, with each run of characters outside `a-z 0-9 . _ -` replaced by `-`, leading and trailing non-alphanumerics trimmed, and cut to 60 characters (`run` if nothing is left), and the timestamp is the UTC time. A run name is valid when it matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`, has no `..`, and does not end in `.` or `.lock`. The branch is `grindinator/<run name>`, created from the current commit. If it exists, `run` stops with `the branch <branch> already exists; pass --name with another run name`. If the branch cannot be created, the error is `could not create the branch <branch>: <git's first error line>`.

**Resuming.** When `.grindinator/` already holds a run's state, `run` resumes it instead of creating one. It stops with an error if `--name` names another run (`a run named <name> is in progress here; finish it, or delete .grindinator/ to start another`), if the packages directory differs (`the run <name> uses the packages in <recorded dir>, not <dir>; finish it, or delete .grindinator/ to start another`), or if the run branch is gone (`the run branch <branch> no longer exists; delete .grindinator/ to start a new run`). If another branch is checked out it switches to the run branch and prints `Switched to <branch>.` (a failure is `could not switch to the branch <branch>: <git's first error line>`).

**Stdout lines before the first package:**

```text
Seeded .grindinator/decisions/ from <path>.
Run <run name> on branch <branch>.
Packages: <n> (<d> done, <t> to run).
```

The `Seeded` line appears once for each Decidinator file copied in, and only when Decidinator is on. The rest of a run's output, and how a run ends, are under [The run](#the-run). When a run ends after reaching its packages it also prints `Summary: .grindinator/summary.md`; if the summary cannot be written, the line is `grindinator: could not write the summary: <message>` on stderr.

### `grindinator status`

```text
grindinator status [packages dir]
```

Shows each package and its state. Takes at most one argument: `status takes at most one argument: the packages directory`. It needs Git and a repository (`Git is not installed or not on the PATH`, `<cwd> is not inside a Git repository`). Without an argument it uses the packages directory recorded by the run in `.grindinator/`; with no run recorded either, it prints one line and exits 0:

```text
No Grindinator run here yet; start one with: grindinator run <packages dir>
```

With a run recorded it prints `Run <run name> on branch <branch>.`, then a table with the columns `PACKAGE`, `STATE`, `ATTEMPTS` and `TITLE`, each column padded to its widest cell and separated by two spaces. `ATTEMPTS` is the number of attempts recorded for the package. It exits 0. Package discovery errors are the same as for `run`.

### `grindinator reset`

```text
grindinator reset <id>
```

Clears a package's done marker so the next `run` repeats it. Takes exactly one argument, a package id such as `WP-01`: `reset needs one argument: a package id such as WP-01`. It prints one of:

```text
Cleared the done marker for <id>; the next run repeats it.
<id> has no done marker; nothing to clear.
```

and exits 0. If the run state records the package as `done` it is set back to `pending`.

### `grindinator help`

```text
grindinator help
```

Prints the help text to stdout and exits 0 (see above for the other ways to ask for it). The text is:

```text
Usage: grindinator <command> [options]

Runs a folder of work packages (WP-NN · Title.md) through Tierminator, one
headless Claude Code session per package, on the branch grindinator/<run name>.
Run it from the target project's root.

Commands:
  run <packages dir>      Check the preconditions, create or resume the run
                          branch, and run the packages that are not done
  status [packages dir]   Show each package and its state
  reset <id>              Clear a package's done marker so the next run repeats it
  help                    Show this help

Options for run (they override ~/.claude/grindinator.json and
.claude/grindinator.json):
  --name <run name>             Name a new run (default: <dir>-<UTC timestamp>)
  --permission-mode <mode>      acceptEdits, bypassPermissions or default
                                (default: bypassPermissions)
  --allowed-tools <list>        Comma-separated tools to allow
  --model <model>               Planning model (default: opus)
  --effort <level>              low, medium, high, xhigh or max (default: medium)
  --max-turns <n>               Turn cap per session (default: none)
  --max-session-minutes <n>     Wall-clock cap per session in minutes (default: 480)
  --max-gate-minutes <n>        Wall-clock cap on the gate in minutes (default: 60)
  --gate <command>              Command that must pass before a package is done
                                (default: none; the gate is skipped)
  --on-failure <stop|continue>  After a failed package (default: stop)
  --max-limit-waits <n>         Usage-limit waits in a row per package (default: 3)
  --wait-weekly                 Wait out a reset more than 24 hours away
  --preamble <file>             Text placed before every package prompt
  --no-decidinator              Do not arm Decidinator in the sessions
  --stop-on-open-questions      Stop after a package that adds open questions

Exit codes: 0 every package done, 1 a package failed or halted,
2 preconditions failed, 3 stopped on a usage limit, 4 interrupted,
5 stopped on open questions.
Set GRINDINATOR_DEBUG=1 for a debug log in the temp directory.
```

## Configuration

Two optional JSON files hold settings:

- the user file, `~/.claude/grindinator.json`;
- the project file, `.claude/grindinator.json` at the repository root.

Precedence, lowest to highest: the built-in defaults, then the user file, then the project file, then command-line flags. Each key is resolved on its own. An array value (`allowedTools`) in a higher layer replaces the lower one whole; arrays are never merged. If the two files are the same file, it is read once. A missing file is not an error.

The loader is strict. Every problem is collected, an invalid value is never applied, and `run` then stops with `the configuration is invalid:` followed by every problem on its own line, indented two spaces. The problem formats are:

| Problem | Format |
| --- | --- |
| File cannot be read (not a missing file) | `<file>: could not be read (<error code>)` |
| File is not JSON | `<file>: is not valid JSON` |
| File is JSON but not an object | `<file>: must hold a JSON object` |
| Unknown key | `<file>: "<key>" is not a Grindinator setting` |
| Invalid value in a file | `<file>: <key's message>` |
| Invalid value from a flag | `--<option>: <key's message>` |

A leading byte-order mark in a file is ignored. A flag with a bad value is reported with the same message as the file key, for example `--effort: "effort" must be one of low, medium, high, xhigh, max`.

| Key | Flag | Default | Valid values | Effect |
| --- | --- | --- | --- | --- |
| `permissionMode` | `--permission-mode` | `bypassPermissions` | `acceptEdits`, `bypassPermissions`, `default` | The permission mode of every session. |
| `allowedTools` | `--allowed-tools` | `[]` | An array of non-empty strings. The flag takes a comma-separated list; blank items are dropped. | Tools allowed in every session. |
| `model` | `--model` | `opus` | A model name with no spaces | The planning model of each session. |
| `effort` | `--effort` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` | The planning effort of each session. |
| `maxTurns` | `--max-turns` | `null` (no cap) | `null`, or a whole number of at least 1 | The turn cap per session. |
| `maxSessionMinutes` | `--max-session-minutes` | `480` | A whole number of at least 1 | The wall-clock cap per session, in minutes. |
| `maxGateMinutes` | `--max-gate-minutes` | `60` | A whole number of at least 1 | The wall-clock cap on the gate, in minutes. |
| `gate` | `--gate` | `null` (no gate) | `null`, or a non-empty command | A command that must pass before a package counts as done. |
| `onFailure` | `--on-failure` | `stop` | `stop`, `continue` | What happens after a failed package: stop the run, or go on to the next package. |
| `maxLimitWaits` | `--max-limit-waits` | `3` | A whole number of at least 1 | How many usage-limit waits in a row one package may take. |
| `waitWeekly` | `--wait-weekly` | `false` | `true`, `false` | Wait out a usage-limit reset more than 24 hours away. The flag takes no value and sets `true`. |
| `preamble` | `--preamble` | `null` | `null`, or a non-empty file path | A file whose text is placed before every package prompt. |
| `decidinator` | `--no-decidinator` | `true` | `true`, `false` | Whether Decidinator is armed in the sessions. The flag takes no value and sets `false`. |
| `stopOnOpenQuestions` | `--stop-on-open-questions` | `false` | `true`, `false` | Stop the run after a package that adds open questions. The flag takes no value and sets `true`. |

The integer flags accept only digits; any other text is reported as an invalid value. `--name` is a flag only: it has no configuration key, because a run name belongs to one run.

## Work packages

A work package is a Markdown file in the packages directory, named:

```text
WP-NN · Title.md
```

That is `WP-`, two or more digits, a space, a middle dot (U+00B7), a space, the title, and `.md`. The pattern is `^(WP-([0-9]{2,})) · (.+)\.md$`. The package id is `WP-NN`, such as `WP-01`. Only files are considered; subdirectories are ignored, as is any file that is not named like a package.

- **Order.** Packages run in the order of their numbers, so `WP-02` precedes `WP-10`; ties on the number (`WP-01` and `WP-001`) are broken by file name.
- **Look-alike warning.** A file whose name starts with `wp-` and ends with `.md` (case ignored) but does not match the pattern, for example one with a hyphen instead of the middle dot, is skipped with a warning on stderr: `grindinator: <name>: looks like a work package but is not named "WP-NN · Title.md"; skipped`.
- **Duplicate ids.** Two packages with the same id stop the run: `two packages share the id <id>: <a> and <b>`, the two file names in sorted order.
- **Empty directory.** No package at all stops the run: `no work packages named "WP-NN · Title.md" in <dir>`.
- **Missing or wrong directory.** `the packages directory <dir> does not exist` or `<dir> is not a directory`.

A byte-order mark at the start of a package or preamble file is removed.

**The preamble.** When `preamble` is set, its path is resolved against the repository root, not the current directory, and the file is read once per run. A missing file stops the run with `the preamble file <file> does not exist`.

**The prompt.** Each session is given the prompt

```text
/tierminator:plan <preamble>

<package>
```

that is, `/tierminator:plan ` followed by the preamble text with trailing whitespace removed, a blank line, and the package's text. With no preamble, or a preamble that is only whitespace, the prompt is `/tierminator:plan ` followed by the package's text alone.
