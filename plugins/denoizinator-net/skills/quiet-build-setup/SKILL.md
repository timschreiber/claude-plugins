---
name: quiet-build-setup
description: Install the quiet build and test harness into a .NET repository. Use when a repo produces verbose MSBuild or dotnet test output, when the user asks to reduce build noise or token usage in a .NET project, or when setting up Denoizinator in a new repo.
---

# Quiet build setup (.NET)

Install the repository-side layer that keeps MSBuild and test output out of context.

## Steps

1. Copy `${CLAUDE_PLUGIN_ROOT}/assets/Directory.Build.rsp` to the
   repository root. It must be CRLF-terminated.
2. Add `.dnz/` to `.gitignore`.
3. Confirm the response file is honored:

   ```
   dotnet build
   ```

   Expect errors and a summary only. Full logs land in `.dnz/`.

## What the response file does

`Directory.Build.rsp` is read by `msbuild.exe`, `dotnet build`, `dotnet msbuild`,
and `dotnet run`. It sets `-nologo`, disables the terminal logger, restricts the
console logger to errors plus a summary, and attaches three file loggers that
write full output to `.dnz/`.

Evidence stays on disk. Claude sees the minimum needed to choose its next action.

## Notes

- VSTest and Microsoft.Testing.Platform are mutually exclusive repo-wide on the
  .NET 10 SDK. Confirm which one the repo uses before touching test configuration.
- Report one or two words on success. Verbose confirmation defeats the purpose.
