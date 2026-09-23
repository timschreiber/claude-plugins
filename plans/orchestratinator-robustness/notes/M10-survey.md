# M10 survey: Assumptions are questions (spec §11)

Spec source: `docs/orchestratinator-robustness-spec.md:215-237` (§11), plus `:229` (plan skill step 5), `:231` (handoff), `:233` (planner), `:235` (plan-reviewer).

## Outline bullet 1: `reference/plan-format.md` — add "Assumptions" subsection and `[assumption]` tag

File: `plugins/orchestratinator/reference/plan-format.md`.

- "Decisions and open questions" section is at `plan-format.md:87-91`, directly after "Milestone status" (`:83-85`) and before "## Milestone file" (`:93`). Per D07 the new "Assumptions" subsection goes here, holding spec §11's **Definition** paragraph (spec:219), its bullet list (spec:221-225), and its **Not assumptions** sentence (spec:227), verbatim.
- No existing "Assumptions" heading anywhere in the file (`grep -rn "ssumption"` on the plugin found only `skills/plan/SKILL.md:188` and `README.md:97`, neither in plan-format.md).
- The `[assumption]` tag: Open questions format currently has no explicit bracket-tag list documented in plan-format.md itself — the bracket list (`[insufficient | ambiguous | contradiction]`) lives in `agents/planner.md:39`, not in plan-format.md. Per the M10 outline bullet 1, plan-format.md itself gains the `[assumption]` tag (D07: "plus the Open-questions tag `[assumption]`"). Currently plan-format.md's "Decisions and open questions" section (`:87-91`) describes Open questions only in prose ("Open questions are tagged with the milestone or task they block") with no bracket-tag list at all — there is no existing bracket-tag list in plan-format.md to extend, so the tag must be introduced there for the first time, e.g. as part of or after the new Assumptions subsection.
- Reader list at top of file (`plan-format.md:3-10`) already lists `plan` (skill), `run` (skill), `planner` (agent), `plan-reviewer` (agent), `milestone-reviewer` (agent), `workers` and `reviewer` (agents) — no change needed for M10 (D24 assigns README reader-list additions to M06/M07, not M10).
- Validation checklist (`plan-format.md:284-312`) has no item referencing assumptions; the M10 outline does not list a checklist addition, only the definition subsection (D07) and the pointers from `plan`, `planner`, `plan-reviewer`.

## Outline bullet 2: `skills/plan/SKILL.md` — step 5 four categories; handoff line replaced

File: `plugins/orchestratinator/skills/plan/SKILL.md`.

- Step 5 heading: `## 5. Find every problem and ask about it` (`SKILL.md:69`). Current three categories, each a bullet with bold lead-in (`:71-75`):
  - `- **Insufficient information.** Something the work needs isn't stated anywhere: a name, a type, a value, a behavior, an error case, an acceptance criterion, a dependency, an environment detail.` (`:73`)
  - `- **Ambiguity.** A passage can reasonably be read two or more ways that would produce different code or behavior.` (`:74`)
  - `- **Contradiction.** Two passages conflict: within one source, between sources, or between a source and CLAUDE.md / AGENTS.md or the existing code.` (`:75`)
  - Per spec:229 and the M10 outline, a fourth bullet **Assumption** must be added: "the question states what `plan` would assume, why the plan needs it, and the recommended value, plus the evidence for a factual conclusion" (spec:229 verbatim wording).
  - The subsequent instructions at `:77-91` ("Ask before you write the plan... grouped under those three headings and numbered") say "those three headings" (`:79`) — this must become four headings if changed to match. (Not explicitly named as a bullet in the M10 outline, but the outline says "Step 5 audits four categories" — the numbered-grouping instruction at `:79` references "those three headings" and would be stale if left unchanged; flagged for the task author's judgment, not resolved here.)
- Handoff: `## 11. Write and hand off` (`SKILL.md:167`). The exact line to replace is `SKILL.md:188`: `- Any assumption you made that the user didn't state. There should be none; if there are, say so plainly.` Per D07/spec:231, replace it with a check that: before handing off, checks the finished plan for assumptions; if any are found, asks them as one more round of questions (not handing off), records the answers as Decisions with source `user`, then hands off; and the handoff line itself becomes `Assumptions: none`.
  - The reply-to-user list this line lives in is at `SKILL.md:181-189`, currently ending: `...Detailing, Gates, Parallel, Max parallel, and Worktree setup, in one line. / Any assumption you made... / Next steps: ...` The replacement's `Assumptions: none` presumably takes that list-item's place (still before "Next steps").
- No other "assumption" text elsewhere in `SKILL.md` (confirmed by grep, only `:188`).

## Outline bullet 3: `agents/planner.md` — fourth category; unsourceable assumption is a GAP; bracket list gains `assumption`

File: `plugins/orchestratinator/agents/planner.md`.

- "Find every problem" section: `planner.md:26-42`. Current three bullets (`:30-32`):
  - `- **Insufficient**: not stated anywhere (a name, type, value, behavior, error case, acceptance criterion).`
  - `- **Ambiguous**: readable two or more ways that would produce different code or behavior.`
  - `- **Contradictory**: two passages conflict, or a source conflicts with CLAUDE.md / AGENTS.md, a Decision, or the code as it now exists.`
  - Per outline: add a fourth, "assumption" category matching spec:233 ("An assumption the planner can't source is a GAP, written to Open questions with the tag `[assumption]`").
- The Open-questions template block is at `planner.md:38-42`:
  ```
  - (M03) [insufficient | ambiguous | contradiction] <question>
    Where: <passage locations; for a contradiction, quote both sides>
    Options: <the readings or choices you see>; recommended: <one, with a one-line reason, or "none">
  ```
  The bracket list `[insufficient | ambiguous | contradiction]` at line 39 is the one place in the codebase enumerating the tag options; per outline it "gains `assumption`" → `[insufficient | ambiguous | contradiction | assumption]`.
- Line `planner.md:34`: "Answer what the sources, Decisions, notes, or code settle, and record non-obvious answers under plan.md's Decisions with their source." — this is the mechanism by which a sourceable assumption becomes a Decision; unchanged text, contextually relevant.
- Existing use of `[ambiguous]` tag elsewhere: `planner.md:60` (Review Focus section) — "report `BLOCKED` / `GAP` and write the question to Open questions, tagged `[ambiguous]`, as in 'Find every problem'." Not in the M10 outline scope (Review Focus is M05), left as is.

## Outline bullet 4: `agents/plan-reviewer.md` — unsourced-assumptions check

File: `plugins/orchestratinator/agents/plan-reviewer.md`.

- "Check" section: `plan-reviewer.md:35-47`, a numbered list of 9 checks (1 Banned phrases and placeholders, 2 The Sonnet test, 3 Coverage, 4 Interfaces, 5 Wave interference, 6 Verify, 7 Fails first, 8 Tier fit, 9 Read first). No existing check for assumptions.
- Per outline and spec:235 ("Checks for unsourced assumptions: any value or choice in a task that no source, Decision, or cited fact supports. Each one found is an issue."), a new check (would be check 10, or renumbered depending on where inserted — outline doesn't specify a position) must be added, pointing to the plan-format Assumptions subsection (D07: "plan-reviewer point to that subsection instead of restating it").
- Frontmatter description (`plan-reviewer.md:3`) lists the checks it performs: "banned phrases and placeholders, choices left to the worker, Coverage, Interfaces, wave interference, Verify commands, Fails first, tier fit, and Read first" — no mention of assumptions; not explicitly in the M10 outline bullet list but is the frontmatter's own enumeration of what the agent checks, so it may go stale if a check is added without updating it. Flagged, not resolved.
- "Format 1 is skip checks 3, 4, and 7" line at `:37` — the outline gives no indication whether the new assumptions check is skipped for format 1 milestones. Spec §11 draws no format-1/format-2 distinction for the assumption category (unlike Coverage/Interfaces/Fails first, which are format-2-only fields per D47/plan-format.md). This is a design point for the task, not resolved here.
- `disallowedTools: Edit` frontmatter (`:7`) already matches D10(e) ("both use `disallowedTools: Edit`... as `scout` does"); no change needed for M10.

## Outline bullet 5: `README.md` — "How to use" item 1 and "Questions answered first" bullet, four categories (D24)

File: `plugins/orchestratinator/README.md`.

- "How to use" item 1: `README.md:24`. Exact text: "Before writing anything, it audits the sources for missing information, ambiguity, and contradictions, and asks you about every one it can't settle from the sources or the code." — three categories named ("missing information, ambiguity, and contradictions"); needs a fourth, assumptions, per D24.
- "Questions answered first" bullet: `README.md:82`, under "### What a plan contains" (`:80`). Exact text: "`plan` groups its questions as insufficient information, ambiguity, or contradiction, quotes the passages involved, lists the options, and recommends one when it can. It never resolves a contradiction or ambiguity on its own, and it writes nothing until you answer. Your answers become recorded Decisions." — three categories named ("insufficient information, ambiguity, or contradiction"); needs the fourth added, consistent with spec:229's wording (what `plan` would assume, why needed, recommended value, evidence for factual conclusions).
- No other place in README.md names the three question categories (confirmed: grep for "ssumption" found only `README.md:97`, an unrelated sentence about investigate tasks writing to `notes/` "instead of assumptions" — not part of the M10 scope, left as is).

## Unconfirmed

- Whether the "Ask before you write the plan" numbered-grouping instruction in `skills/plan/SKILL.md:79` ("grouped under those three headings and numbered") should change to "four headings" — not explicitly named in the M10 outline bullet, but it references the same headings changed in bullet 2. Flagged only, not resolved.
- Exact insertion point/number for the new plan-reviewer assumptions check (before or after check 9 "Read first", or elsewhere) — outline doesn't specify; only that it must point to the plan-format Assumptions subsection.
- Whether plan-reviewer's frontmatter description line (`plan-reviewer.md:3`) should be updated to mention the assumptions check — not named in the M10 outline, but is the agent's own check enumeration.
- Whether the new plan-reviewer assumptions check applies to format 1 milestones (the file's format-1 skip list at `:37` currently names only checks 3, 4, 7) — spec §11 draws no format distinction, but this isn't addressed in the M10 outline or Context.

## Conflicts

None found — no code contradicts the Context or Decisions cited (D01, D07, D16, D17, D24).
