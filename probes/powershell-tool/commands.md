# PowerShell-tool probe

Answers, for Claude Code's PowerShell tool (tool name `PowerShell`, distinct
from `Bash`): does a `PreToolUse` hook with `matcher: "PowerShell"` fire, what
is the payload shape, is `updatedInput` with no `permissionDecision` honored,
and does Claude see the original command's output.

## Re-run

From the repo root:

```powershell
./probes/powershell-tool/Run-PowerShellToolProbe.ps1
```

The script does everything: it creates a throwaway git repo under `$env:TEMP`,
writes `settings.probe.json`'s hooks into its `.claude/settings.json` (with the
absolute path to `Invoke-PowerShellToolProbe.ps1`), and starts a **fresh**
headless session from there, so hooks are loaded at session start (see the
caution in `docs/hook-behavior-findings.md` section 13):

```
claude -p "Use the PowerShell tool (not Bash) to run exactly: dotnet --version . Then tell me its output verbatim." --allowedTools PowerShell
```

stdout and stderr are captured separately. It then reads
`.dnz-pstool/records.jsonl` and the `EXEC_*` marker files and writes
`probes/evidence/powershell-tool-rewrite.json`. `updatedInputHonored` is true
only if the marker for the `PowerShell` record's token exists.

## Enabling the PowerShell tool

Nothing was needed on the measuring machine (Windows 11, Claude Code 2.1.284,
pwsh 7.6.6): the headless session offered the PowerShell tool with no extra
environment variable and no setting. If a future run records no `PowerShell`
record, pass the enabling variable for the probe's child session only. The
variable name below is an unverified example, not something this run needed:

```powershell
./probes/powershell-tool/Run-PowerShellToolProbe.ps1 -ExtraEnv @{ CLAUDE_CODE_USE_POWERSHELL_TOOL = '1' }
```

The child session runs with the caller's environment minus the variables that
mark it as a child of a running Claude Code session (`CLAUDECODE`,
`CLAUDE_CODE_SESSION_ID` and the like), so the probe can be run from inside a
Claude Code session.

The `Bash` group is a control: a `bash` record means the session used the Bash
tool instead, and the run does not measure the PowerShell tool.
