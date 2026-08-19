# Claude Code hook behavior findings

Measured 2026-08-19 against a live Claude Code session on Windows, PowerShell
7.6.5. Evidence: `probes/hook-behavior/hook-coverage.json` — 50 records across
20 tool calls.

Probe design: five `PreToolUse` handlers in one `matcher: "Bash"` group, four
carrying distinct `if` filters plus one unfiltered control, each writing a
labelled record.

---

## 1. `if` belongs on the handler, `matcher` is tool-name only

`matcher` is regex-tested against the **tool name**. Permission-rule syntax there
never matches — `Bash(dotnet build:*)` as a regex requires the literal string
`Bashdotnet build`, so such a hook silently never fires.

Filtering on command content uses the `if` field on an individual handler.

```json
{ "matcher": "Bash",
  "hooks": [ { "type": "command", "if": "Bash(dotnet build:*)", "command": "..." } ] }
```

## 2. All matching handlers run

20 of 20 tool calls reached the unfiltered control; 16 of 20 fired more than one
handler. Not first-match-wins. `dotnet build && dotnet test` fired
`if-dotnet-build` **and** `if-dotnet-test` on the same call.

Consequence: a plugin's handlers can overlap without one shadowing another, but
each match costs a process launch.

## 3. `if` decomposes compound commands

| Command | `if-dotnet-build` |
|---|---|
| `cd src && dotnet build` | fires |
| `cd src && dotnet build && cd ..` | fires |
| `dotnet build && dotnet test` | fires (and `if-dotnet-test`) |
| `(cd src && dotnet build)` | fires |
| `dotnet build \| Select-String "error"` | fires |
| `dotnet build > build-out.txt` | fires |
| `dotnet build 2>&1` | fires |

Pipes, redirects, sequencing, and **subshells** are all penetrated. This
contradicts field reports that `permissions.allow` rules only match single
commands — either those describe a different code path or the behavior changed.

## 4. Leading environment assignments are ignored

`DOTNET_NOLOGO=1 dotnet build` fires `if-dotnet-build`. The filter matches the
command head after assignments are stripped.

## 5. What the filter does NOT reach

| Command | Only reached |
|---|---|
| `pwsh -c "dotnet build"` | control |
| `pwsh -NoProfile -Command dotnet build` | control |
| `npm run build` | control |
| `git status` | control (negative control — correct) |

A build behind another interpreter or a package-manager script is invisible to
command-content filtering. These are **out of scope** for hook injection, not
bugs to fix.

## 6. Filters discriminate correctly

`dotnet --version` matched `Bash(dotnet *)` and not `Bash(dotnet build:*)`.
`msbuild MySolution.sln` matched `Bash(msbuild:*)` and not `Bash(dotnet *)`.
`dotnet msbuild /t:Build` matched `Bash(dotnet *)` and not `Bash(dotnet build:*)`.

## 7. Payload shape

```json
{
  "session_id": "...", "transcript_path": "...", "cwd": "...",
  "prompt_id": "...", "permission_mode": "auto",
  "effort": { "level": "high" },
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "dotnet build", "description": "dotnet build" },
  "tool_use_id": "toolu_..."
}
```

`tool_input.command` is the **raw string**, unnormalised. The rewriter parses
exactly this. `tool_use_id` groups records from handlers that fired on one call.

---

## Consequences for the spec

**Hook injection is viable as the sole mechanism.** Every realistic
`dotnet build` / `dotnet test` invocation form reaches the filter. No
`Directory.Build.rsp` needs to be committed, so Azure Pipelines and Visual Studio
are untouched by construction rather than by configuration.

**The rewriter must cover everything the filter covers.** A command that fires
the hook and then isn't rewritten is a silent no-op: process launched, build
still verbose, nothing to indicate failure. Sections 3 and 4 forced two fixes to
`CommandSegmentation.psm1` — subshell recursion and env-prefix stripping — both
now carrying test vectors.

**Interpreter-wrapped builds are documented as out of scope.** Section 5 is a
limitation to state in the README, not a gap to engineer around.

## Not yet measured

- **Subagent inheritance.** Whether a build issued inside a `Task` subagent fires
  the hook. If it doesn't, that's a silent coverage hole in exactly the workflow
  that benefits most from quieting.
- **`updatedInput` acceptance.** Every handler here was an observer returning no
  decision. That a rewritten command is accepted and executed is still untested.
- **Non-Windows.** All of this is Windows + pwsh 7.6.5.

---

# updatedInput findings

Measured 2026-08-19, same session. Evidence:
`probes/updated-input/rewrite-results.json` — 4 handler invocations across 3 calls.

Method: each handler rewrote its target command by prepending a marker write,
`echo executed > .dnz-updatedinput/EXEC_<token>.txt && <original>`. Marker first,
so it lands even if the original fails. Marker file present == that handler's
rewritten string is the one that ran.

## 8. `updatedInput` is honored, and does NOT require `permissionDecision`

| Handler | Mode | Rewrite executed |
|---|---|---|
| `plain` | `updatedInput` only | yes |
| `allow` | `updatedInput` + `permissionDecision: allow` | yes |

The plugin can rewrite commands without suppressing the permission prompt.
**Do not set `permissionDecision: allow` merely to make a rewrite take effect** —
it isn't needed, and it would silently bypass permission checks on every build.

## 9. Rewrites do not chain; the last handler wins, silently

Two handlers with identical `if` filters both fired on `dotnet --list-runtimes`:

| Handler | Received | Rewrite executed |
|---|---|---|
| `chain1` (first in array) | the **original** command | **no** |
| `chain2` (second in array) | the **original** command | yes |

Neither saw the other's output, and `chain1`'s rewrite was discarded with no
error, no warning, and no diagnostic.

### Consequence: one handler per plugin

This interacts badly with finding 2 (all matching handlers run) and finding 3
(`if` decomposes compound commands). Given handlers for `Bash(dotnet build:*)`
and `Bash(dotnet test:*)`, the command:

```
dotnet build && dotnet test
```

fires both. One rewrite is silently dropped, so one half of the command stays
verbose and nothing indicates why.

**Both Denoizinator plugins therefore register exactly one handler**, with
`matcher: "Bash"` and no `if` filter. All command matching moves into
`CommandSegmentation.psm1`, which already handles multiple target prefixes and
multiple matching segments in a single pass and returns one correct rewrite.

The cost is a process launch on every Bash tool call, not just build commands.
The handler must therefore exit fast when nothing matches — parse, find no
matching segment, emit nothing, exit. Measure this before shipping; if the launch
overhead is material, the alternative is a single handler with one broad `if`
(`Bash(dotnet *)`), accepting that bare `msbuild.exe` invocations go uncovered.

Untested: whether `if` accepts alternation such as `"Bash(dotnet *)|Bash(msbuild:*)"`.
If it does, one handler could cover both without matching every Bash call.

## 10. The rewrite is invisible to Claude

Claude reported `10.0.301` for `dotnet --version` — the original command's output
exactly, with no trace of the prepended marker write. Rewritten commands return
their output normally, which is what makes output reduction work at all.

## 11. Subagent Bash calls inherit hooks

Measured by giving the subagent a command the main session never issued:

| Issued by | Command | Hook fired |
|---|---|---|
| main session, directly | `dotnet --version` | yes |
| `Task` subagent only | `dotnet --list-sdks` | yes |

`dotnet --list-sdks` was never run by the main session, so its record can only
have come from the subagent's Bash call.

Note for anyone reproducing this: the subagent inherits the parent's `session_id`
**and** `prompt_id`, so neither field distinguishes a subagent call. Only
`tool_use_id` differs. Use distinct commands rather than trying to tell them
apart by session metadata.

This matters most for parallel agent sessions against separate worktrees, where
build output volume is multiplied across concurrent agents. Those calls are
covered.

## Still not measured

- **Handler launch overhead** on an unfiltered `matcher: "Bash"` handler, which
  now fires on every Bash call rather than only build commands.
- **`if` alternation syntax**, e.g. `"Bash(dotnet *)|Bash(msbuild:*)"`. If
  supported, one filtered handler could replace the unfiltered one.
- **Non-Windows.** All findings are Windows + pwsh 7.6.5.
