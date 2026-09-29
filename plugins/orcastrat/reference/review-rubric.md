# Review rubric

The one rubric that review findings are scored on (Change 10). `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator` each carry a verbatim copy of the block below, markers included, directly above their `## Report` heading. Edit the rubric here first, then copy the block into all four agent files: `tests/orcastrat/review-rubric.bats` fails when a copy differs.

<!-- rubric:start -->
## Scoring rubric

Score each finding from 0 to 100 against these anchors:

- **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
- **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
- **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
- **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
- **100:** certain. The evidence directly confirms it, and it will be hit.
<!-- rubric:end -->
