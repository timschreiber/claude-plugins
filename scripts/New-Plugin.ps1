<#
.SYNOPSIS
    Scaffold a new plugin and register it in the marketplace catalog.

.EXAMPLE
    ./scripts/New-Plugin.ps1 -Name denoizinator-python -DisplayName 'Denoizinator for Python' -Description 'Quiets pytest and pip output.'

.NOTES
    Name must be kebab-case: lowercase letters, digits, and hyphens. It is the
    stable identifier -- users reference it in enabledPlugins and install
    commands, and changing it later breaks every existing install. It is also
    the skill namespace, so "/name:skill" is typed by hand. Keep it short.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9]+(-[a-z0-9]+)*$')]
    [string] $Name,

    [Parameter(Mandatory)] [string] $DisplayName,
    [Parameter(Mandatory)] [string] $Description,

    [string]   $Category = 'dev',
    [string[]] $Tags     = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot "plugins/$Name"

if (Test-Path -LiteralPath $pluginRoot) {
    throw "Plugin already exists: $pluginRoot"
}

foreach ($d in '.claude-plugin', 'skills', 'commands', 'agents', 'hooks', 'scripts', 'assets') {
    New-Item -ItemType Directory -Path (Join-Path $pluginRoot $d) -Force | Out-Null
}

# version is deliberately omitted. With no version in plugin.json or the
# marketplace entry, Claude Code falls back to the resolved commit SHA, so every
# push reaches users. Declaring a version pins the plugin until you bump it.
$manifest = [ordered]@{
    name        = $Name
    displayName = $DisplayName
    description = $Description
    author      = [ordered]@{ name = 'Tim Schreiber'; url = 'https://github.com/timschreiber' }
    homepage    = "https://github.com/timschreiber/claude-plugins/tree/main/plugins/$Name"
    repository  = 'https://github.com/timschreiber/claude-plugins'
    license     = 'Apache-2.0'
}

$manifest | ConvertTo-Json -Depth 6 |
    Set-Content -LiteralPath (Join-Path $pluginRoot '.claude-plugin/plugin.json') -Encoding utf8

$marketplacePath = Join-Path $repoRoot '.claude-plugin/marketplace.json'
$marketplace     = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json

if ($marketplace.plugins.name -contains $Name) {
    throw "Marketplace already lists a plugin named '$Name'."
}

$entry = [ordered]@{
    name        = $Name
    displayName = $DisplayName
    source      = $Name
    description = $Description
    author      = [ordered]@{ name = 'Tim Schreiber' }
    homepage    = "https://github.com/timschreiber/claude-plugins/tree/main/plugins/$Name"
    repository  = 'https://github.com/timschreiber/claude-plugins'
    license     = 'Apache-2.0'
    category    = $Category
    tags        = $Tags
}

$marketplace.plugins += [pscustomobject]$entry
$marketplace | ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $marketplacePath -Encoding utf8

Write-Host "created plugins/$Name and registered it in the catalog"
Write-Host "test with: claude --plugin-dir ./plugins/$Name"
exit 0
