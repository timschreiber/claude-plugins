# Bash timeout findings

Derived from `probes/evidence/tierminator-bash-timeout-results.json` (14 headless cells), made by
`probes/tierminator-bash-timeout/runner.js` (hook roles in `hook.js`) on 2026-10-31 with Claude Code 2.1.316.
Every number below is in that file.

## Question

A worker's long Bash command, such as the 135 s test suite of a task's Verify, passes the 120 s default timeout and
is moved to the background. That leaves worker-started monitors behind. Can a plugin hook raise the timeout of the
Bash call, and does that reach subagents?

## Method

Headless `claude -p` on Haiku (`--model haiku`), with hooks only from `--settings` (`--setting-sources project`, so
no installed plugin loads), `--no-session-persistence` and `--max-turns 8`. The command is a marked one that prints
`SLOWDONE` after 8 s; a hook gives it a 3 s timeout, so a raised timeout that works moves the command to the
background at 3 s. The main session is told to run the command and reply with the tool result; for a subagent cell it
is told to make one Agent call to `general-purpose` that runs the command. Hook roles: `timeout` (`PreToolUse`,
`updatedInput` with `timeout` 3000), `rewrite` (`PreToolUse`, `updatedInput` with the command prefixed by
`echo REWRITTEN;`), `deny` (`PreToolUse`, `permissionDecision` `deny`, reason `PROBE_DENY`) and `log` (`PostToolUse`,
records `agent_id`, `agent_type`, `session_id`, `permission_mode`, the `timeout` the call ran with and the response).
Cells are r0 to r9 (r3 and r4 three times each: 14 in all).

## Results

`pass` is the runner's check against `expect`; the `info` cells have none (`null`).

| Cell | What it tests | Expected | Result |
|---|---|---|---|
| `r0` | No hook; main session; bypassPermissions | completes | Completed (`SLOWDONE`); pass |
| `r1` | `timeout` hook; main session | backgrounded | Backgrounded at 3 s (`timedOutAfterMs` 3000, `backgroundTaskId` set); the `log` hook saw `timeout` 3000; pass |
| `r2` | `timeout` hook; subagent (`general-purpose`) | backgrounded | Backgrounded at 3 s inside the subagent (`agent_id` set, `timedOutAfterMs` 3000); pass |
| `r3a` | `timeout` then `rewrite` hook, in that order | info | `timeout` won: backgrounded, command not rewritten |
| `r3b` | same order | info | `rewrite` won: `REWRITTEN SLOWDONE`, no timeout |
| `r3c` | same order | info | `rewrite` won |
| `r4a` | `rewrite` then `timeout` hook, in that order | info | `rewrite` won |
| `r4b` | same order | info | `timeout` won: backgrounded, command not rewritten |
| `r4c` | same order | info | `rewrite` won |
| `r5` | `BASH_DEFAULT_TIMEOUT_MS=3000` in the settings `env`; no hook; main session | backgrounded | Backgrounded at 3 s; pass |
| `r6` | same env; subagent | backgrounded | Backgrounded at 3 s inside the subagent; pass |
| `r7` | `timeout` hook; `--permission-mode default` with `--allowedTools Bash,Agent`; main session | backgrounded | Backgrounded at 3 s; pass |
| `r8` | same mode; subagent | backgrounded | Backgrounded at 3 s inside the subagent; pass |
| `r9` | `deny` hook then `timeout` hook | denied | Tool result `PreToolUse:Bash hook error: PROBE_DENY`; the command never ran (no `PostToolUse`); pass |

## Findings

1. **`updatedInput` alone sets the timeout, in the main session and in a subagent** (`r1`, `r2`). A hook returning
   only `updatedInput` with `timeout` 3000, and no `permissionDecision`, made the 8 s command move to the
   background at 3 s in both (`timedOutAfterMs` 3000). Without any hook the same command completed (`r0`).
2. **It works in default permission mode with Bash allowed** (`r7`, `r8`), in the main session and in a subagent.
3. **A `PreToolUse` deny beats the timeout `updatedInput`** (`r9`): the call was refused with `PROBE_DENY` and never
   ran, though the `timeout` hook also ran.
4. **Two hooks that both return `updatedInput` lose one change, and the winner varies** (`r3a` to `r4c`). In the
   order `timeout`, `rewrite` (`r3a`, `r3b`, `r3c`): `timeout` won once, `rewrite` twice. In the order `rewrite`,
   `timeout` (`r4a`, `r4b`, `r4c`): `rewrite` won twice, `timeout` once. In every cell exactly one change took effect
   and the hook order did not decide which. A timeout set by a hook is therefore not reliable when another hook
   rewrites the same call.
5. **`BASH_DEFAULT_TIMEOUT_MS` in a settings `env` reaches subagents** (`r5`, `r6`): both backgrounded at 3 s with
   no hook. But a plugin cannot ship it. This is from the Claude Code docs read on 2026-10-31, not measured: a
   plugin's `settings.json` honors only `agent` and `subagentStatusLine`.
6. **A subagent hook's `session_id` equals the main session's** (`sessionIdMatches` true in all 14 cells). The
   hook tells a subagent call from a main-session one by `agent_id` and `agent_type`, which the subagent cells
   (`r2`, `r6`, `r8`) carry (`general-purpose`) and the main-session cells leave `null`.

## Decision

Hook H9 (`plugins/tierminator/scripts/h9-worker-timeout.js`) is a `PreToolUse` hook on Bash that returns only
`updatedInput`, never a permission decision and never a denial. It acts only when all of these hold: the call has an
`agent_id` and an `agent_type` starting with `tierminator:` (a tierminator worker, not the main session or another
plugin's agent); `tool_name` is `Bash`; the session is active and its phase is `running`; `tool_input` is an
object that names no numeric `timeout` and is not `run_in_background`. Then it returns the input with `timeout` set
to 600000 ms (10 minutes), so a Verify step that takes minutes finishes in the foreground. Finding 3 means a deny
from another hook still wins; finding 4 means a second hook that rewrites the same call could cancel it, so H9 must
be the only tierminator hook that returns `updatedInput` for a worker's Bash call.

## Not measured

- Tierminator's own agent types (`tierminator:*`) in a real run; the probe used `general-purpose`.
- The PowerShell tool.
- `acceptEdits` mode (only `bypassPermissions` and `default` were run).
- Models other than Haiku.
- Other plugins' hooks that return `updatedInput`, beyond the one `rewrite` stand-in.
