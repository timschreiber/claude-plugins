# Tierminator headless command findings

Derived from `probes/evidence/tierminator-headless-probe-results.json`,
`tierminator-headless-probe-hooks.jsonl` and `tierminator-headless-probe-output.json`
(1 headless session, Claude Code 2.1.289, run by `probes/tierminator/headless-probe.js`).

The probe ran `claude -p "/tierminator-headless-probe:plan add a --verbose flag"` with a
`UserPromptSubmit` hook and a skill whose body echoes `$ARGUMENTS` and a token from the hook's
`additionalContext`.

## Results

1. The hook receives the raw typed text. The logged `prompt` in `tierminator-headless-probe-hooks.jsonl`
   is `/tierminator-headless-probe:plan add a --verbose flag`, the command and its argument unexpanded
   (`rawPrompt` in the results file).
2. The hook process sees `CLAUDE_CODE_ENTRYPOINT=sdk-cli` headless (`entrypoint` in the results file
   and the hooks file). The value starts with `sdk`.
3. `$ARGUMENTS` expands to the text after the command: the model's reply in
   `tierminator-headless-probe-output.json` contains `ARGS=[add a --verbose flag]` (`argsSeen: true`).
4. The hook's `additionalContext` reaches the model: the reply contains `TOKEN=PROBE-7731`
   (`tokenSeen: true`).

## Interactive contrast

Interactive transcripts record entrypoint `cli`: `probes/evidence/decidinator-probe-interactive-normal-transcript.jsonl`
contains `"entrypoint":"cli"`. So a hook can tell a headless run (`sdk*`) from an interactive one (`cli`)
by `CLAUDE_CODE_ENTRYPOINT`.
