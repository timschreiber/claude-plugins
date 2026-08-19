# claude-plugins

Claude Code plugins and skills by Tim Schreiber.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install denoizinator-net@timschreiber
```

For a large checkout, limit it to the directories that carry plugin content:

```bash
claude plugin marketplace add timschreiber/claude-plugins --sparse .claude-plugin plugins
```

## Plugins

| Plugin | Skills namespaced as | What it does |
|---|---|---|
| `denoizinator-net` | `/denoizinator-net:*` | Keeps MSBuild and `dotnet test` output out of context |
| `denoizinator-java` | `/denoizinator-java:*` | Same for Maven and Gradle |
| `planning` | `/planning:*` | Structured plan mode with compressed handoff artifacts |

## Layout

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json          # the catalog. Repo root, not inside plugins/
├── .claude/
│   └── settings.json             # dogfooding: this repo knows its own marketplace
├── plugins/
│   ├── denoizinator-net/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── skills/<name>/SKILL.md
│   │   ├── agents/  commands/  hooks/
│   │   ├── assets/               # templates shipped to consuming repos
│   │   └── scripts/
│   │       └── vendor/           # GENERATED from shared/. Do not edit
│   ├── denoizinator-java/
│   └── planning/
├── shared/
│   └── denoizinator-core/        # source of truth for cross-plugin code
├── scripts/
│   ├── Sync-Shared.ps1
│   ├── Validate-All.ps1
│   └── New-Plugin.ps1
├── docs/
└── .github/workflows/validate.yml
```

`metadata.pluginRoot` is `./plugins`, so a catalog entry's `source` is just the
directory name.

## Development

Use `--plugin-dir` to load a plugin directly, without installing:

```bash
claude --plugin-dir ./plugins/denoizinator-net
```

Run `/reload-plugins` after each edit to pick up changes without restarting. This
reloads skills, agents, hooks, and plugin MCP and LSP servers.

Do **not** iterate by installing from a local marketplace. Installed plugins are
copied into `~/.claude/plugins/cache`, so edits in this repo have no effect on the
installed copy. Local install is the integration test, not the inner loop:

```bash
claude plugin marketplace add .
claude plugin install denoizinator-net@timschreiber
```

Add a new plugin:

```powershell
./scripts/New-Plugin.ps1 -Name denoizinator-python `
                         -DisplayName 'Denoizinator for Python' `
                         -Description 'Quiets pytest and pip output.'
```

Validate everything before pushing:

```powershell
./scripts/Validate-All.ps1
```

## Rules this repo follows

**No `version` field.** Neither `plugin.json` nor the catalog entry declares one.
Claude Code then falls back to the resolved commit SHA, so every push reaches
users. Declaring a version pins the plugin until the string changes — push a
hundred commits under `"version": "1.0.0"` and existing users keep the cached copy.
Never set it in both places: `plugin.json` wins silently and masks the catalog.

**Nothing reaches outside a plugin directory.** Installed plugins are copied, so
`../shared-utils` does not exist at runtime. Shared code lives in `shared/`,
`Sync-Shared.ps1` copies it into each consuming plugin's `scripts/vendor/`, the
copies are committed, and CI fails on drift. Templates a plugin ships to other
repos live in that plugin's `assets/`.

**`name` is permanent.** It is the install identifier and the skill namespace.
Renaming breaks every existing install unless a `renames` entry maps the old name
to the new one — treat that map as append-only history, and keep old entries even
after everyone has migrated. Change `displayName` freely; it is UI only.

**Kebab-case names.** Lowercase letters, digits, hyphens. Claude Code is more
permissive, but the claude.ai marketplace sync rejects other forms, and Claude
Desktop's managed sync silently drops a non-conforming plugin entry while
accepting the rest of the marketplace.

## Reference

- [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Create plugins](https://code.claude.com/docs/en/plugins)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference)

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Contributions are accepted under the same license, per section 5 of the license.
