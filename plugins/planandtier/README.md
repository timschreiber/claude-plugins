# Plan and Tier

**Status: spike in progress. Not installable yet, and not in the marketplace catalog.**

This directory currently holds probe hooks that log what Claude Code sends and honors,
plus a throwaway workflow. It answers the open questions in
[the design spec](https://github.com/timschreiber/claude-plugins/blob/main/docs/planandtier/planandtier-spike-spec.md).
The probe records every prompt you submit in a session, so do not load it outside a
throwaway repo.

Load it for the spike with `claude --plugin-dir ./plugins/planandtier`. The run checklist is
`probes/planandtier/commands.md`.
