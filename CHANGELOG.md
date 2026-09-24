# Changelog

All notable changes to plugins in this marketplace.

## [Unreleased]

### Added
- Repository scaffold: marketplace catalog, three plugin skeletons, shared-asset
  sync, and CI validation.
- orchestratinator: project instruction files no longer override the plugin's git rules; stray worker commits are detected and redone.
- orchestratinator: tasks declare Interfaces and Fails first, milestones carry Coverage and Review Focus, a plan-reviewer and a milestone-reviewer check plans and finished milestones, tiny same-shape edits batch into one task, and planning asks about assumptions instead of making them.

### Changed
- orcastrat: renamed from Orchestratinator (plugin `orchestratinator` is now `orcastrat`, with a `renames` entry in the marketplace catalog). Migration: finish or pause any active runs; `claude plugin uninstall orchestratinator@timschreiber`; `claude plugin marketplace update timschreiber`; `claude plugin install orcastrat@timschreiber`; restart Claude Code, on every machine where the plugin is installed.
