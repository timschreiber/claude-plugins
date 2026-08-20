# Contributing

This is a Claude Code plugin marketplace. For what the plugins actually do,
see [README.md](README.md); for the full development workflow and
architecture, see `CLAUDE.md` and `docs/`. This file covers repo layout, the
local dev loop, and the conventions the marketplace format itself requires.

## Layout

```
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json          # the catalog. Repo root, not inside plugins/
├── .claude/
│   └── settings.json             # dogfooding: this repo knows its own marketplace
├── plugins/
│   └── denoizinator-net/
│       ├── .claude-plugin/plugin.json
│       ├── skills/<name>/SKILL.md
│       ├── agents/  commands/  hooks/
│       ├── assets/               # templates shipped to consuming repos
│       └── scripts/
│           └── vendor/           # GENERATED from shared/. Do not edit
├── shared/
│   └── denoizinator-core/        # source of truth for cross-plugin code
├── scripts/
│   ├── Sync-Shared.ps1
│   ├── Validate-All.ps1
│   └── New-Plugin.ps1
├── docs/
└── .github/workflows/validate.yml
```

A catalog entry's `source` is a relative path from the marketplace root and must
start with `./` — for example `./plugins/denoizinator-net`. Paths resolve against
the repository root, not the `.claude-plugin/` directory. Bare directory names
fail validation, and `../` is rejected.

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

Run the rewriter's unit tests (pure PowerShell, no .NET needed):

```powershell
Invoke-Pester ./tests/CommandSegmentation.Tests.ps1
Invoke-Pester ./tests/Invoke-QuietDotnetTest.Tests.ps1
```

## Rules this repo follows

**No `version` field.** Neither `plugin.json` nor the catalog entry declares one.
Claude Code then falls back to the resolved commit SHA, so every push reaches
users. Declaring a version pins the plugin until the string changes — push a
hundred commits under `"version": "1.0.0"` and existing users keep the cached copy.
Never set it in both places: `plugin.json` wins silently and masks the catalog.
`claude plugin validate` warns about the missing version on every plugin. Those
warnings are expected and will not go away.

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
