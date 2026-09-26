# claude-plugins

Claude Code plugins by Tim Schreiber.

## Plugins

| Plugin | What it does |
|---|---|
| [denoizinator-net](plugins/denoizinator-net/README.md) | Strip the noise. Keep the signal. Keeps low-value MSBuild and test output out of Claude's context, so more of the context window stays available for actual work. |
| [planandtier](plugins/planandtier/README.md) | Plan in plan mode, approve, and watch. Each task in the approved plan runs as its own subagent, one at a time, on the model and effort chosen for it during planning. Orchestration runs as code in a saved workflow, not as model turns. |

Each plugin's README covers installation, usage, what it does and doesn't
do, and known limitations.

## Install

Add the marketplace once, then install whichever plugins you want:

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install denoizinator-net@timschreiber
claude plugin install orchestratinator@timschreiber
claude plugin install planandtier@timschreiber
```

For a large checkout, limit the marketplace to the directories that carry
plugin content:

```bash
claude plugin marketplace add timschreiber/claude-plugins --sparse .claude-plugin plugins
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo layout, the local dev loop,
and the marketplace conventions this repo follows.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Contributions are accepted under the same license, per section 5 of the license.

<!--
| [orchestratinator](plugins/orchestratinator/README.md) | Big asks. Small tasks. Right-sized models. Turns a spec or long prompt into small tasks tagged with the cheapest model and effort that can do each one, then runs them through tiered subagents, in parallel where safe, verifying and committing every task. |
-->
