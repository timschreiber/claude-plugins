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

## The run

After the preconditions (see [`grindinator run`](#grindinator-run)), `run` goes through the packages that are not done, in order, one at a time. If none is left it prints `Every package is done.` and exits 0 without a session. Otherwise it prints `To run: <ids>.` and, when no gate is set, the no-gate warning (see [The gate](#the-gate)).

### The lifecycle of one package

For each package the runner loops until the package completes, fails, or the run stops:

1. **Clean tree.** It checks the working tree is clean (`the working tree has uncommitted changes (...); commit or stash them, then run again`, exit 2). A package never starts on a dirty tree. After a usage limit, or a failure under `onFailure: continue`, the runner first discards the leftovers (see below), so the check passes.
2. **Launch or relaunch.** The attempt number is the number of attempts already recorded for the package, plus one. The prompt is the plan prompt (see [Work packages](#work-packages)), or, when the package has a `resume` record from a usage limit, the execute prompt (see [Sessions](#sessions)). It prints:

   ```text
   <id>: attempt <n> started; its stream is in .grindinator/runs/<id>/attempt-<n>/stream.jsonl.
   <id>: attempt <n> started (/tierminator:execute --from <task>); its stream is in .grindinator/runs/<id>/attempt-<n>/stream.jsonl.
   ```

   The second form is for a relaunch; with no known task it reads `/tierminator:execute from the first uncommitted task`. The attempt is recorded in `state.json` before the session starts, and a plan launch records the package's `startCommit`, the commit HEAD was on.
3. **The outcome.** When the session ends, the runner reads the result file, the stream and the process facts and maps them to an outcome (see [Outcomes](#outcomes)). It prints `<id>: attempt <n> ended: <outcome>[ at <task>][ (<reason>)].`.
4. **After-complete verification.** Only when the outcome is `complete`, in this order; the first check that fails turns the outcome into `unverified` with its reason:
   1. HEAD is on the run branch.
   2. HEAD is a descendant of the package's start commit.
   3. HEAD has advanced from it: the session made at least one commit.
   4. For a limit session that committed every task, leftover uncommitted changes are discarded first.
   5. The tree is clean.
   6. When Decidinator is on, the decision files are committed (next step); a failure is `unverified`.
5. **The decision commit.** The run copies of the Decidinator log and sidecar that differ from the repository files are copied over them and committed as `chore(grindinator): decisions for <id>` (see [Decidinator integration](#decidinator-integration)). This comes before the gate, so the gate sees a clean tree, and the decisions of a package that fails its gate are still kept.
6. **The gate.** The configured gate runs (see [The gate](#the-gate)). A failing gate makes the outcome `gate-failed`; an interrupted one, `interrupted`. When a gate ran, it prints `<id>: gate <passed|failed|interrupted>; its output is in .grindinator/runs/<id>/attempt-<n>/.`. A skipped gate prints nothing.
7. **The done marker.** A `complete` outcome that passed every check above writes the package's done marker, `.grindinator/done/<id>.done`, and sets its status to `done`. The run goes on to the next package.

The package's status after an attempt is `done` for `complete`, `pending` for `limit` and `interrupted`, and `failed` for every other outcome. Its `resume` record is set for a `limit` in the execute phase and cleared otherwise.

### The failure policy

An outcome other than `complete`, `limit` or `interrupted` is a failure: `halted`, `no-plan`, `declined`, `crashed`, `unverified` or `gate-failed`. The package is added to the run's failed list. What happens next depends on `onFailure`:

- **`stop`** (the default). The run stops with exit 1 and prints `grindinator: <id> <what>, so the run stops; see .grindinator/runs/<id>/attempt-<n>/.`, where `<what>` is `failed its gate (<reason>)`, `was not verified (<reason>)` or `ended <outcome>`, followed by ` at <task>` when the session halted at a task. The package's commits stay on the run branch, and its uncommitted changes stay in the tree, so the next `run` stops on the dirty-tree check until the user deals with them.
- **`continue`.** The runner prints `grindinator: <id> <what>; onFailure is continue, so the run goes on; see .grindinator/runs/<id>/attempt-<n>/.`, discards the uncommitted changes, and goes on to the next package. The discard is `git reset --hard -q` then `git clean -fd -q`; paths excluded from Git, such as `.grindinator/`, survive. It prints `grindinator: discarded uncommitted changes left by <id>: <paths>.` when anything was dirty. The failed package's commits are kept. The discard is refused unless the current branch is the run branch and its name starts with `grindinator/`: `refusing to discard changes: <branch> is not a Grindinator run branch` or `refusing to discard changes: the current branch is <branch or a detached HEAD>, not the run branch <branch>` (exit 2). At the end the run exits 1 with the reason `<ids> failed; onFailure is continue, so the other packages ran`.

A usage limit is not a failure (see [Usage limits](#usage-limits)), and neither is an interrupt.

### Ctrl+C

The runner listens for SIGINT for the length of the package loop. On the first one it aborts a controller. That stops the running session or gate (see [Sessions](#sessions)), or ends a usage-limit wait. The attempt's outcome is `interrupted` and the package stays `pending`. The runner prints `grindinator: interrupted; the state is saved, and the next run starts at <id>.` and exits 4. An interrupt during a wait prints `grindinator: interrupted while waiting for the usage limit; the state is saved, and the next run resumes <id>.` A SIGINT that arrives between attempts is seen at the top of the loop, before the next launch, with the first message and the same exit. After an interrupted execute attempt the package's `resume` keeps its plan file but loses its `--from`, so the next run relaunches `/tierminator:execute` on the plan and Tierminator skips the tasks already committed.

### The summary

`.grindinator/summary.md` is written at the end of every run that reached its packages: when every package was done, when the run stopped, and also when a `GrindinatorError` is thrown after the packages were found. It is not written when a precondition fails before that. It holds the branch, base commit, end time, exit code and stop reason, a table of each package (`Package`, `Title`, `Status`, `Attempts`, `Outcome`, `Commits`, `Gate`), a `Details` list with the last reason of each package that has one and its log directory, a `Limit waits` list, and, when Decidinator is on, `Open questions`. The run prints `Summary: .grindinator/summary.md`, or `grindinator: could not write the summary: <message>` on stderr.

## Sessions

Each attempt is one `claude` process, started from the project root. If `GRINDINATOR_CLAUDE_BIN` is set (a test hook), that command runs instead of `claude`; a value ending in `.js`, `.cjs` or `.mjs` is run with the current Node.

### The command lines

The arguments are built by `lib/session.js` in this order. A plan launch:

```text
claude -p "/tierminator:plan <preamble>\n\n<package>" --output-format stream-json --verbose --model <model> --effort <effort> --permission-mode <permissionMode> [--max-turns <n>] [--allowedTools <tool> <tool> ...]
```

An execute relaunch after a usage limit differs only in its prompt, which is always given by plan path:

```text
claude -p "/tierminator:execute \"<plan file>\" [--from <task>]" --output-format stream-json --verbose --model <model> --effort <effort> --permission-mode <permissionMode> [--max-turns <n>] [--allowedTools <tool> <tool> ...]
```

`--max-turns` is added only when `maxTurns` is set. `--allowedTools` is last because it takes several values, and is added only when `allowedTools` is not empty.

### Spawn settings and the cap

The process is spawned with the project root as its working directory, with no shell, no stdin (`ignore`) and a hidden window on Windows. Its stdout goes to `stream.jsonl` and its stderr to `stderr.txt` in the attempt directory, `.grindinator/runs/<id>/attempt-<n>/`. `maxSessionMinutes` is the wall-clock cap: when it passes, the process is stopped and the outcome is `crashed` with the reason `the session ran past the <n>-minute cap and was stopped`. A process that cannot start is `crashed` with `claude could not be started: <message>`. The same launch code runs the gate, with the shell turned on and `maxGateMinutes` as the cap.

### Stopping a session

The same stop is used for the cap and for Ctrl+C:

- **Windows:** `taskkill /PID <pid> /T /F`, which ends the whole process tree. If `taskkill` does not succeed, the runner falls back to killing the child only.
- **POSIX:** `SIGTERM` to the child, then `SIGKILL` after five seconds if it is still running.

### The environment

The session's environment is the runner's, with these changes:

- **Removed first:** `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE` and `CLAUDE_CODE_SSE_PORT`. An enclosing Claude Code session sets them, and a child must not inherit them.
- **Removed next:** `DECIDINATOR_MODE`, `DECIDINATOR_CONTEXT`, `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR`, always, so with `--no-decidinator` not even inherited values reach the session.
- **Set:** `TIERMINATOR_RESULT_FILE`, the absolute path of `result.json` in the attempt directory (a stale file there is deleted before the launch).
- **Set when Decidinator is on:** `DECIDINATOR_MODE=sidecar`, `DECIDINATOR_CONTEXT=<package id>`, `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR` (the run copies under `.grindinator/decisions/`).

### What `lib/stream.js` reads

The parser reads `stream.jsonl`, one JSON object per line, and never throws on content. A blank line is skipped. A line that is not JSON, or not an object, is counted as malformed. It keeps:

- **The session ID:** from the first `system` message with subtype `init`; if there is none, the first `session_id` on any message.
- **The `result` messages:** their count, and the last one.
- **The permission denials:** every `system` message with subtype `permission_denied`.
- **The reset time:** `rate_limit_info.resetsAt` (Unix seconds, a positive number) on a `rate_limit_event`. A later event replaces an earlier one, with null when its value is unusable. The value kept is the one seen at the last `result`, or, when there is no `result`, the latest one.
- **Line counts:** the lines read and the malformed ones.

A missing stream file reads as an empty stream.

## Outcomes

Every attempt ends in one outcome. Five come from Tierminator's result file; three come from the runner's own observations; `gate-failed` comes from the gate.

| Outcome | Comes from | Package status | Runner action |
| --- | --- | --- | --- |
| `complete` | Result file (every task finished and committed) | `done`, once verified and the gate passes or is skipped | Verify, commit decision files, run the gate, write the done marker |
| `halted` | Result file (a task failed past its retries, or a worker exceeded its resumes) | `failed` | Failure policy; the task is shown as `at <task>` |
| `limit` | Result file, or the stream (a last `result` with `is_error: true` and `api_error_status: 429`) | `pending` | Discard uncommitted changes, wait, relaunch by phase (see [Usage limits](#usage-limits)) |
| `no-plan` | Result file (planning ended without a valid plan after three tries) | `failed` | Failure policy |
| `declined` | Result file (preconditions failed: dirty tree, plan mode, no commit identity, missing plan file, unknown task id) | `failed` | Failure policy; the result file's `reason` is shown |
| `crashed` | Runner (see the mapping below) | `failed` | Failure policy |
| `interrupted` | Runner (Ctrl+C during the session, the gate or a wait) | `pending` | Stop the run, exit 4 |
| `unverified` | Runner (a `complete` session that failed verification) | `failed` | Failure policy |
| `gate-failed` | Runner (the gate failed) | `failed` | Failure policy |

### The mapping

`lib/outcome.js` maps a session in this order; the first rule that applies wins:

1. **The run was interrupted:** `interrupted`, reason `interrupted by the user`. This beats everything, including a result file.
2. **A valid result file:** its `outcome`, `reason`, `haltedAt`, `planFile`, `tasksFile`, `tasksDone`, `tasksNotRun` and `limit`. A result file is valid when it is a JSON object with `version: 1` and an outcome that is one of the five above (a leading byte-order mark is ignored).
3. **The process could not start:** `crashed`, `claude could not be started: <message>`.
4. **The wall-clock cap passed:** `crashed`, `the session ran past the <n>-minute cap and was stopped`.
5. **The last `result` in the stream** has `is_error: true` and `api_error_status: 429`: `limit`, reason `a usage limit ended the session (a 429 result in the stream; no result file)`, with no reset in the limit record (the stream's reset is used instead).
6. **Otherwise:** `crashed`. The reason is `the result file <problem>` (`could not be read (<code>)`, `is not valid JSON`, `is not a version 1 result file` or `has an unknown outcome "<outcome>"`), or `the session ended without a result file` when there is none. When the last `result` was an error, `; the last result was an API error (<status or no status>)` follows, then `: <first line of its text, up to 200 characters>`. It always ends with `; exit code <code or none>` and, if a signal ended the process, `, signal <signal>`.

### When `unverified` applies

A session whose outcome is `complete` becomes `unverified` when:

- HEAD is not on the run branch: `the session reported complete but left the run branch <branch> (now on <branch or a detached HEAD>)`.
- HEAD is not a descendant of the package's start commit: `the session reported complete, but HEAD is not a descendant of the package's start commit <short sha>`.
- HEAD has not advanced: `the session reported complete, but HEAD has not advanced from the package's start commit <short sha>, so it made no commits`.
- The tree is dirty: `the session reported complete but left uncommitted changes (<up to five paths>, ...)`.
- The decision files could not be committed: `the decision files could not be committed: <git add failed or git commit failed: git's first error line>`.

### A limit that committed every task

A `limit` session whose recovery phase is `complete` (a tasks file, no task not run, at least one task done) is changed to `complete` with the reason `a usage limit ended the session after every task was committed`. It goes through the same verification as any `complete`, after its uncommitted changes are discarded, because a usage limit can leave partial work behind.

## Usage limits

A `limit` outcome is never a failure. The runner discards uncommitted changes at once, so that a stop leaves the tree clean (it prints `grindinator: discarded uncommitted changes left by <id>: <paths>.` when anything was dirty), and then decides to wait or stop.

### The reset time

The reset time is taken from the first source that has a time in the future:

1. The result file's `limit.resetsAt` (Unix seconds).
2. The stream's last `rate_limit_event` `resetsAt`.
3. A fixed five hours from now, when neither is usable.

A reset at or before the current time is stale and skipped to the next source. Sources 1 and 2 exist only on an OAuth login; an API-key login reports no reset, so it always waits the fixed five hours.

### The wait

The wake time is the reset plus a five-minute grace (for the fallback, now plus five hours plus five minutes). The runner sleeps in chunks of at most 60 seconds and reads the clock again after each, so a machine that slept through the reset resumes at the next chunk. It prints:

```text
<id>: usage limit; waiting until <wake time> (reset <reset time or unknown>, <source>).
<id>: the wait is over; relaunching <the execute command or from planning>.
```

where `<source>` is `from the result file`, `from the stream` or `none reported; fixed five-hour wait`. Ctrl+C during the wait ends it with exit 4 and the package stays `pending`; the next run relaunches at once, without waiting.

### The recovery phase

The plan file is the attempt's `planFile` from the result file, or the plan of the attempt being resumed, or, with neither, found by session ID: the plans directory (`$CLAUDE_CONFIG_DIR/plans`, else `~/.claude/plans`) is searched for a file named `tierminator-unattended-*-<first eight characters of the session ID>.md`, and the last by name wins. The phase is then:

| Phase | When | Relaunch |
| --- | --- | --- |
| `planning` | No plan file, or it is not on disk | The plan launch again, from the start |
| `execute` | A plan file exists and tasks remain | `/tierminator:execute "<plan file>" --from <first task not run>`, with no `--from` when that task is unknown, so Tierminator skips the committed ones |
| `complete` | A tasks file exists, no task is left and at least one is done | Treated as `complete` (see [Outcomes](#outcomes)) |

The relaunch point is the package's `resume` record in `state.json`, which survives a stopped run.

### When the run stops instead

`maxLimitWaits` is the number of waits one package may take in a row, within one run (the count starts again for each package and each run). When the count passes it, the run stops with exit 3: `grindinator: <id> hit a usage limit <n> times in a row, more than maxLimitWaits (<max>), so the run stops; run it again after the reset.`

The weekly rule: a known reset more than 24 hours away stops the run with exit 3 unless `waitWeekly` or `--wait-weekly` is set: `grindinator: <id> hit a usage limit that resets at <time>, more than 24 hours away; pass --wait-weekly to wait for it, so the run stops; run it again after the reset.`

### The records

Each limit attempt's `wait` record holds `source` (`result-file`, `stream` or `fallback`), `resetsAt`, `wakeAt`, `status`, `startedAt` and `endedAt`. The status is `waiting`, then `woke` or `interrupted`; a stop is recorded as `over-cap` or `weekly`. The attempt's `recovery` record holds the phase, plan file and `from`. The `summary.md` section `Limit waits` lists each wait, as `waited from <start> to <end> (reset <time>, <source>)`, `waiting since <start> until <wake> (...)`, `did not wait: over the limit-wait cap (...)` or `did not wait: the reset is more than 24 hours away (...)`.

## Decidinator integration

Decidinator is on unless `--no-decidinator` (or `"decidinator": false`) is set. Off, none of the items below happens: the sessions get no Decidinator variables, nothing is seeded or committed, and `summary.md` has no `Open questions` section.

### The variables

Each session gets `DECIDINATOR_MODE=sidecar`, `DECIDINATOR_CONTEXT=<package id>`, `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR` (see [Sessions](#sessions)). The last two point at the run copies, `.grindinator/decisions/decisions.md` and `.grindinator/decisions/open-questions.md`, which are excluded from Git, so a session can write them without dirtying the tree.

### The repository paths

The repository files are Decidinator's own: the `decisionLog` and `sidecar` keys of `~/.claude/decidinator.json`, then `.claude/decidinator.json` (the project file wins; a value that does not pass Decidinator's own check is ignored). The defaults are `docs/decisions.md` and `docs/open-questions.md`. If both keys name the same file, both return to the defaults. A path must lie inside the repository and outside `.git/` and `.grindinator/`; otherwise the run stops before any session (exit 2):

```text
the Decidinator <decision log|sidecar> "<path>" is outside the repository; Grindinator commits it after each package, so set "<key>" in .claude/decidinator.json to a path inside it, or pass --no-decidinator
the Decidinator <decision log|sidecar> "<path>" is inside <.git|.grindinator>/; set "<key>" in .claude/decidinator.json to a path Git tracks, or pass --no-decidinator
```

### Seeding

At each start the runner seeds a run copy that does not exist from its repository file, when that exists, and prints `Seeded .grindinator/decisions/ from <repo path>.` for each one. It records the repository file's hash in `state.json`. A run copy that already exists is kept only if its repository file still has the recorded path and hash, so a change to the repository file is never overwritten. Otherwise the run stops with exit 2:

```text
<repo path> changed since Grindinator last copied it (for example by /decidinator:import), and .grindinator/decisions/<file> may hold decisions not yet committed; merge them into <repo path> and delete .grindinator/decisions/<file>, or delete it to discard them, then run again
```

### The decision commit

After a `complete` session and before the gate, each run copy whose hash differs from its repository file is copied over it, and the changed files are committed alone with the message `chore(grindinator): decisions for <id>`. If nothing changed there is no commit. The hashes in `state.json` are then updated. A failure to add or commit makes the outcome `unverified`.

### Open questions

`summary.md` ends with `## Open questions`: `None.`, or one line `<id> · <topic>` (with the entries it depends on in parentheses) for each entry whose status is `open` in the run copy of the sidecar, followed by a pointer to `/decidinator:export`. A package's questions reach the repository sidecar only when the package completes; until then they are only in `.grindinator/decisions/open-questions.md`.

`--stop-on-open-questions` (or `stopOnOpenQuestions`) checks after each package, other than the last, whether it added open entries that were not open before it started. If so the run stops with `grindinator: <id> added open questions (<ids>), and --stop-on-open-questions is set, so the run stops; answer them (see the summary), then run again.` and exits 5; if a package also failed under `onFailure: continue`, the exit is 1 instead.

## The gate

The gate is the `gate` command, run once after a `complete` session has passed verification and its decisions are committed.

- **Where:** through the shell (`cmd.exe` on Windows, `/bin/sh` elsewhere), in the project root, with the runner's environment plus `GRINDINATOR_PACKAGE=<package id>`. The session and Decidinator variable changes do not apply to it.
- **Cap:** `maxGateMinutes`. When it passes, the gate is stopped the same way as a session.
- **Output:** `gate.stdout.txt` and `gate.stderr.txt` in the attempt directory, `.grindinator/runs/<id>/attempt-<n>/`.
- **Pass:** exit code 0. The done marker is written only then, or when no gate is set.
- **Failure reasons** (the outcome is `gate-failed`): `the gate could not be started: <message>`, `the gate ran past the <n>-minute cap and was stopped`, and `the gate exited <code or with no code>` with ` (signal <signal>)` when one ended it.
- **Interrupted:** Ctrl+C during the gate gives `the gate was interrupted by the user` and the outcome `interrupted`.
- **No gate:** at the start of a run that has packages to run, the runner prints `grindinator: no gate is configured, so a package is done once its session completes with new commits; set one with --gate or "gate".` to stderr. A package then counts as done after the checks above.

## Exit codes

The names are the keys of `EXIT` in `lib/errors.js`.

| Code | Name | When |
| --- | --- | --- |
| 0 | `OK` | Every package is done (`Every package is done.`). Also every command that succeeds, `help`, `status` and `reset`. |
| 1 | `FAILED` | A package failed or halted and the run stopped with `grindinator: <id> <what>, so the run stops; see .grindinator/runs/<id>/attempt-<n>/.`. With `onFailure: continue`, at the end of a run in which a package failed, with the reason `<ids> failed; onFailure is continue, so the other packages ran`. `--stop-on-open-questions` when a package also failed. An unexpected error: `grindinator: unexpected error: <message>`. |
| 2 | `PRECONDITION` | A problem the user must fix, printed as `grindinator: <message>`: every precondition of `run` (see [`grindinator run`](#grindinator-run)); a configuration, package or Decidinator path problem (see [Configuration](#configuration), [Work packages](#work-packages) and [Decidinator integration](#decidinator-integration)); a seed conflict; `<file>: is not valid JSON; delete .grindinator/ to start over` or `<file>: is not a Grindinator state file (version 1); delete .grindinator/ to start over` for a damaged state file; `"<id>" is not a package id such as WP-01`; the refused discard (`refusing to discard changes: ...`); `git status failed: <message>` and `git <reset or clean> failed while discarding changes: <message>`; a bad command line (`unknown command`, a wrong argument count, or an unknown option); and no arguments at all (the help text on stderr). |
| 3 | `LIMIT` | A usage limit stopped the run: `<id> hit a usage limit <n> times in a row, more than maxLimitWaits (<max>)`, or a reset more than 24 hours away without `--wait-weekly`. Run again after the reset. |
| 4 | `INTERRUPTED` | Ctrl+C during a session, the gate or a usage-limit wait, or before the next launch. The state is saved and the next run resumes. |
| 5 | `OPEN_QUESTIONS` | `--stop-on-open-questions` is set and a package other than the last added open questions, and no package failed. |

## Files

Everything a run writes is under `.grindinator/` in the project root, except the commits themselves and Tierminator's plan files.

```text
.grindinator/
  state.json
  summary.md
  done/<id>.done
  runs/<id>/attempt-<n>/
    stream.jsonl
    stderr.txt
    result.json
    gate.stdout.txt
    gate.stderr.txt
  decisions/decisions.md
  decisions/open-questions.md
```

| Path | Holds |
| --- | --- |
| `state.json` | The run's state (see below). |
| `done/<id>.done` | One file per finished package, holding the time it was written. **It is the source of truth for done:** a package is done if and only if its marker exists, whatever `state.json` says. `grindinator reset <id>` deletes it. |
| `runs/<id>/attempt-<n>/stream.jsonl` | The session's stdout, the `stream-json` messages (see [What `lib/stream.js` reads](#what-libstreamjs-reads)). |
| `runs/<id>/attempt-<n>/stderr.txt` | The session's stderr. |
| `runs/<id>/attempt-<n>/result.json` | Tierminator's result file, set through `TIERMINATOR_RESULT_FILE`. A stale one is deleted before the launch. |
| `runs/<id>/attempt-<n>/gate.stdout.txt`, `gate.stderr.txt` | The gate's stdout and stderr. Present only when a gate ran. |
| `summary.md` | The run summary (see below). |
| `decisions/decisions.md`, `decisions/open-questions.md` | The run copies of Decidinator's decision log and sidecar, present only when Decidinator is on (see [Decidinator integration](#decidinator-integration)). |

**Excluded from Git.** `run` adds the line `/.grindinator/` to the repository's local exclude file, `.git/info/exclude` (found with `git rev-parse --git-path info/exclude`), unless a line equal to `.grindinator`, `.grindinator/`, `/.grindinator` or `/.grindinator/` is already there. Nothing in the repository's tracked files changes. This happens before the working-tree check, so the run's own files never make the tree dirty, and `git reset --hard` plus `git clean -fd` leave them alone.

**Atomic writes.** `state.json`, the done markers and `summary.md` are written by writing a temporary file next to the target (`<file>.<pid>.<random>.tmp`) and renaming it over the target, so a crash never leaves a half-written file. On Windows a rename can fail with `EPERM`, `EACCES` or `EBUSY` while another process holds the file; it is retried up to ten times, 20 ms apart, and then the error is raised. The temporary file is deleted when the write fails.

A `state.json` that is not valid JSON, or is not an object with `version: 1` and a `packages` object, stops the command with exit 2 (`<file>: is not valid JSON; delete .grindinator/ to start over` or `<file>: is not a Grindinator state file (version 1); delete .grindinator/ to start over`).

### state.json

`state.json` is written with two-space indentation. It is rewritten at every change: before a session starts, after the session, at each wait, and after each outcome. `updatedAt` is set at every write.

**Top level**

| Field | Meaning |
| --- | --- |
| `version` | Always `1`. |
| `runName` | The run name. |
| `branch` | The run branch, `grindinator/<run name>`. |
| `packagesDir` | The packages directory as recorded when the run started (relative to the repository root when inside it). A resumed run must use the same one. |
| `baseCommit` | The commit the run branch was created from. |
| `createdAt`, `updatedAt` | ISO 8601 UTC times. |
| `packages` | An object keyed by package id; one entry per package (below). |
| `decisions` | Only when Decidinator is on: `{ log: { repo, hash }, sidecar: { repo, hash } }`, the repository path and SHA-256 of each Decidinator file at the last seed or commit (`hash` is null when the file did not exist). |

**Per package**

| Field | Meaning |
| --- | --- |
| `title`, `file` | The package's title and file name, refreshed at each start. |
| `status` | `pending`, `running`, `done` or `failed`. The status shown by `status` and the summary comes from the done marker first (`done`), then this field (`running` and `failed` are kept, anything else reads `pending`). |
| `attempts` | The list of attempts (below), oldest first. |
| `startedAt`, `endedAt` | The time of the first attempt's start, and of the last `done` or `failed`; null until then. |
| `startCommit` | The commit HEAD was on when the last plan launch started; the base for counting the package's commits. Set only by a plan launch. |
| `resume` | Set after a `limit` that is in the execute phase, and kept through an interrupted execute attempt: `{ kind: "execute", planFile, from }`, where `from` is the first task not run, or null. Null or absent otherwise. The next launch uses it. |

**Per attempt**

| Field | Meaning |
| --- | --- |
| `n` | The attempt number, from 1. |
| `kind` | `plan` or `execute`. |
| `resume` | The `resume` record the attempt was launched from, or null. |
| `dir` | The attempt directory relative to `.grindinator/`, `runs/<id>/attempt-<n>`. |
| `startedAt`, `endedAt` | Times; `endedAt` is null while it runs. |
| `sessionId` | The session ID from the stream, else from the result file; null if neither. |
| `exitCode`, `signal` | How the process ended. |
| `timedOut`, `interrupted` | True when the wall-clock cap stopped it, or Ctrl+C did. |
| `outcome`, `reason` | The outcome (one of those in [Outcomes](#outcomes)), null while running, and its reason. |
| `source` | Where the session's outcome came from: `result-file`, `stream` or `runner`. |
| `haltedAt` | The task a halted session stopped at. |
| `planFile`, `tasksFile`, `tasksDone`, `tasksNotRun` | From the result file. |
| `limit` | The result file's limit record, or null. |
| `streamResetsAt` | The stream's reset time (Unix seconds), or null. |
| `results`, `permissionDenials`, `malformedLines` | Counts from the stream. |
| `startCommit`, `endCommit` | HEAD when the attempt started and when the session ended. |
| `commits` | The number of commits on HEAD since the package's start commit; null when that commit is not an ancestor of HEAD. |
| `sessionOutcome` | The outcome the session itself gave, before verification, the gate or a limit that finished every task changed it. |
| `gate` | The gate record, or null when no gate ran: `command`, `status`, `exitCode`, `signal`, `timedOut`, `interrupted`, `durationMs`, `reason`. |
| `recovery` | For a `limit` outcome: `{ phase, planFile, from }`. |
| `wait` | For a `limit` outcome that was decided on: `{ source, resetsAt, wakeAt, status, startedAt, endedAt }`. |
| `discarded` | The paths a limit-after-complete discard removed. |
| `decisions` | The decision commit record, or null: `{ status, commit, files, reason? }`. |

**Status values**

| Field | Values |
| --- | --- |
| Package `status` | `pending`: not started, or stopped by a usage limit or Ctrl+C. `running`: an attempt is in progress, or the runner died during one. `done`: complete, verified, and the gate passed or was skipped. `failed`: any other outcome. |
| Attempt `outcome` | `complete`, `halted`, `limit`, `no-plan`, `declined`, `crashed`, `interrupted`, `unverified`, `gate-failed`. |
| `gate.status` | `skipped` (no gate configured), `passed`, `failed`, `interrupted`. |
| `wait.status` | `waiting` (in the wait), `woke` (the wait ended), `interrupted` (Ctrl+C ended it), `over-cap` (more waits than `maxLimitWaits`, so none was made), `weekly` (reset more than 24 hours away, so none was made). |
| `recovery.phase` | `planning`, `execute`, `complete` (see [The recovery phase](#the-recovery-phase)). |
| `decisions.status` | `unchanged` (the run copies matched the repository files; no commit), `committed`, `failed`. |

`wait.source` is `result-file`, `stream` or `fallback`; `source` of an attempt is `result-file`, `stream` or `runner`.

### summary.md

`summary.md` is rewritten at the end of each run that reached its packages (see [The summary](#the-summary)). Its layout:

```text
# Grindinator run <run name>

- Branch: <branch>
- Base commit: <sha>
- Ended: <ISO time>
- Exit code: <code>
- Stop reason: <reason>

| Package | Title | Status | Attempts | Outcome | Commits | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| WP-01 | <title> | done | 1 | complete | 3 | passed |
```

One table row per package, in run order. `Status` is the same value as `grindinator status` (the done marker decides). `Outcome` is the last attempt's outcome, with ` at <task>` for a halt, `running` for an attempt with no outcome, or `-` for no attempt. `Commits` is the last attempt's commit count, or `-`. `Gate` is `-` (no gate record), `none configured`, `passed`, `interrupted`, `failed (timed out)` or `failed (exit <code or none>)`. Pipes and line breaks in a cell are escaped.

Optional sections, each present only when it has content:

- **`## Details`**: one line per package whose last attempt has a reason: `- <id>, attempt <n>: <reason>. Logs: .grindinator/<attempt dir>/`.
- **`## Limit waits`**: one line per attempt with a wait record, `- <id>, attempt <n>: <wait text>` (see [The records](#the-records)).
- **`## Open questions`**: only when Decidinator is on: `None.`, or one `- <id> · <topic>` line per open entry and the pointer to `/decidinator:export` (see [Open questions](#open-questions)).

### Tierminator's plan files

Tierminator keeps its plan files, task files and telemetry in the plans directory, `~/.claude/plans`, or `$CLAUDE_CONFIG_DIR/plans` when `CLAUDE_CONFIG_DIR` is set. A headless plan is saved as `tierminator-unattended-<...>-<first eight characters of the session ID>.md`. Grindinator reads this directory only to find the plan of a session that ended on a usage limit before its result file named one (see [The recovery phase](#the-recovery-phase)). It never writes there, and `.grindinator/` does not hold copies of the plans.

## Environment variables

| Variable | Set or read by | Effect |
| --- | --- | --- |
| `GRINDINATOR_DEBUG` | Read by Grindinator | `1` turns on the debug log (see [Output and debugging](#output-and-debugging)). Any other value leaves it off. |
| `GRINDINATOR_CLAUDE_BIN` | Read by Grindinator; a test hook | The command that runs instead of `claude` for the sessions (the gate is not affected). A value ending in `.js`, `.cjs` or `.mjs` is a path run under the current Node (resolved to an absolute path); any other value is run as a command. Empty or unset means `claude`. |
| `GRINDINATOR_PACKAGE` | Set by Grindinator, read by the gate | The package id (`WP-01`), in the gate command's environment only. |
| `TIERMINATOR_RESULT_FILE` | Set by Grindinator, read by Tierminator | The absolute path of the attempt's `result.json`, where Tierminator writes its result file. Set for every session. |
| `DECIDINATOR_MODE` | Set by Grindinator, read by Decidinator | `sidecar` when Decidinator is on. Removed from the session's environment otherwise, even if inherited. |
| `DECIDINATOR_CONTEXT` | Set by Grindinator, read by Decidinator | The package id, when Decidinator is on. Removed otherwise. |
| `DECIDINATOR_LOG` | Set by Grindinator, read by Decidinator | The path of the run copy of the decision log, `.grindinator/decisions/decisions.md`, when Decidinator is on. Removed otherwise. |
| `DECIDINATOR_SIDECAR` | Set by Grindinator, read by Decidinator | The path of the run copy of the sidecar, `.grindinator/decisions/open-questions.md`, when Decidinator is on. Removed otherwise. |
| `CLAUDE_CONFIG_DIR` | Read by Grindinator (and by Claude Code) | Moves the Claude configuration directory, and with it the plans directory Grindinator searches during limit recovery: `$CLAUDE_CONFIG_DIR/plans` instead of `~/.claude/plans`. It passes through to the sessions unchanged. |
| `CLAUDECODE` | Removed from sessions | Set by an enclosing Claude Code session; a child must not inherit it. |
| `CLAUDE_CODE_ENTRYPOINT` | Removed from sessions | As above. |
| `CLAUDE_CODE_SESSION_ATTENDED` | Removed from sessions | As above. |
| `CLAUDE_CODE_CHILD_SESSION` | Removed from sessions | As above. |
| `CLAUDE_PLUGIN_ROOT` | Removed from sessions | As above. |
| `CLAUDE_PLUGIN_DATA` | Removed from sessions | As above. |
| `CLAUDE_PROJECT_DIR` | Removed from sessions | As above. |
| `CLAUDE_ENV_FILE` | Removed from sessions | As above. |
| `CLAUDE_CODE_SSE_PORT` | Removed from sessions | As above. |
| `GIT_DIR` | Removed from Git calls | Could point Grindinator's Git commands at another repository. |
| `GIT_WORK_TREE` | Removed from Git calls | As above. |
| `GIT_INDEX_FILE` | Removed from Git calls | As above. |
| `GIT_OBJECT_DIRECTORY` | Removed from Git calls | As above. |
| `GRINDINATOR_STUB_SCENARIO` | Read by the test stub only | The path of a JSON scenario file that tells `tests/grindinator/fixtures/claude-stub.js` what to emit; without it the stub runs its default scenario. Used with `GRINDINATOR_CLAUDE_BIN`. |
| `GRINDINATOR_STUB_LOG` | Read by the test stub only | When set, the stub appends one JSON line per run (`argv`, `cwd` and the relevant environment) to this file. |

The session variables are removed from the session's environment only; the runner's own environment is unchanged, and the gate gets the runner's environment plus `GRINDINATOR_PACKAGE`. The `GIT_` variables are removed from each Git call Grindinator makes and nowhere else.

## Output and debugging

**stdout and stderr.** Progress goes to stdout and everything a person must act on goes to stderr, so `grindinator run <dir> > run.log` keeps the progress and still shows the problems.

- **stdout:** `help`, the `Seeded ...`, `Run ...`, `Packages: ...`, `To run: ...` and `Every package is done.` lines, the `Switched to <branch>.` line, each package's `attempt <n> started`, `attempt <n> ended`, `gate ...`, `usage limit; waiting` and `the wait is over` lines, `Summary: .grindinator/summary.md`, and the output of `status` and `reset`.
- **stderr:** every error (`grindinator: <message>`), the look-alike package warnings, the no-gate warning, `grindinator: discarded uncommitted changes left by <id>: <paths>.`, the failure messages (`... so the run stops` and `... so the run goes on`), the interrupt messages, the limit stop messages, `grindinator: could not write the summary: <message>`, and the help text when no command is given.

The exit code is the result; see [Exit codes](#exit-codes).

**`grindinator status` table.** After `Run <run name> on branch <branch>.` (when a run is recorded), one header row and one row per package, in package order. The first three columns are padded to their widest cell, and cells are separated by two spaces, so the `TITLE` column is last and unpadded:

```text
PACKAGE  STATE    ATTEMPTS  TITLE
WP-01    done     1         Scaffold
WP-02    failed   2         Parser
WP-03    pending  0         Docs
```

`STATE` is `done` (the done marker exists), `running`, `failed` or `pending` (see [state.json](#statejson)). `ATTEMPTS` is the length of the package's `attempts` list, 0 with no run recorded.

**The debug log.** With `GRINDINATOR_DEBUG=1`, Grindinator appends lines of the form `<ISO time> <message>` to `grindinator-debug.log` in the operating system's temp directory (`os.tmpdir()`: `%TEMP%` on Windows, `/tmp` or `$TMPDIR` elsewhere). It never writes to stdout or stderr and never throws; a log that cannot be written is silently skipped. Today the only thing logged is the stack of an unexpected error (the one reported as `grindinator: unexpected error: <message>`). The session logs, gate output and stream are in the attempt directories, not here.

## Setups and permissions

### Permissions

**O-9, closed in WP-11.** Workers need `bypassPermissions`, which is the default, because under `acceptEdits` they could not read the tasks file outside the repository, so the run halted at T01 (V8 in [`grindinator-verification.md`](grindinator-verification.md)). Use `bypassPermissions` only on the runner branch, in a sandbox or a dedicated clone. `acceptEdits` was enough for repository-only oracles. A smaller worker set (`acceptEdits` plus `--add-dir` for the plan directory) is untested, and Grindinator has no flag that passes `--add-dir` (L-3).

### First-party claude.ai login

Verified by WP-01 (model pinning, rung models and `WebSearch`; V9) and by the runbook once its results are recorded.

### Pro

Untested (L-2). Run the probe's `models` cell first:

```bash
PROBE_TAG=pro node probes/grindinator/run.js models
```

Rung 3 runs on Fable, which bills usage credits on Pro.

### Bedrock

Untested (L-2). It needs `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION` and AWS credentials. Pin models with `--model`; if the aliases do not resolve, set Claude Code's `ANTHROPIC_DEFAULT_OPUS_MODEL` and `ANTHROPIC_DEFAULT_SONNET_MODEL`. This is untested. Rung 3's `claude-fable-5-1` may not resolve. `WebSearch` may be missing, and no Serper MCP or other substitute is provided (L-5). Run the `models` cell first, with `PROBE_TAG=bedrock`.

The runbook's [Other setups](grindinator-e2e-run.md#other-setups) gives the steps for running the pilot on each.
