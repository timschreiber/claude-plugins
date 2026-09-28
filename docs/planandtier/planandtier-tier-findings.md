# planandtier: which tiers earn their place

planandtier started with nine tiers: `haiku-default`, Sonnet at `low` to `xhigh`, and Opus 5.5 at `low` to
`xhigh`. Two rounds of published data, both on 2026-09-28, cut that to five: `sonnet` at `low`, `medium` and
`high`, then `opus` at `medium` and `high`. The first round compared Sonnet 5 with Opus 5.5, and the second
compared Sonnet 5.5 with Opus 5.5. This is desk research, not a measurement of planandtier's own tasks.
Evidence, with every source and figure: `probes/evidence/planandtier-tier-research.json` (first round) and
`probes/evidence/planandtier-sonnet-5-5-charts.json` (second round, with the chart images beside it).

## Decision

- **Five tiers, weakest first:** `sonnet-low`, `sonnet-medium`, `sonnet-high`, `opus-medium`, `opus-high`.
  This is also the retry ladder, and a failure at `opus-high` stops the run.
- **`opus-low` was removed** (Sonnet 5.5 round). Sonnet 5.5 at `high` scores above it on all three coding
  charts, at 1.0 to 1.5× its cost, so it is no step up from `sonnet-high`. Its intricate, multi-file work
  goes to `sonnet-high` and its small, bounded judgment work goes to `opus-medium`.
- **`opus-xhigh` was removed** (Sonnet 5.5 round). It ties `opus-high` on CursorBench and scores below it
  on FrontierCode. It gains 2 points on Terminal-Bench, for about twice the cost. Its rare,
  extreme-reasoning work goes to `opus-high`.
- **`sonnet-xhigh` stays out.** It was removed in the Sonnet 5 round, because Opus 5.5 at `low` beat Sonnet
  5 at `xhigh` everywhere. With Sonnet 5.5, Opus 5.5 at `high` scores as well as or better than Sonnet 5.5
  at `xhigh` on all three coding charts, at equal or lower cost.
- **Removed pairs are aliases, not errors.** The planner is not offered them. A plan that asks for one
  anyway runs it at the next tier up: `sonnet` / `xhigh` and `opus` / `low` run at `opus` / `medium`, and
  `opus` / `xhigh` runs at `opus` / `high`.
- **`haiku-default` was removed** (Sonnet 5 round) on the user's own research: Haiku does not follow
  instructions reliably and too often does its own thing on coding work. Its find-and-replace work went to
  `sonnet-low`. The published coding results are consistent with that: 25.5 against Sonnet 5's 88.2 on
  Scale's SWE-Bench Pro V2, and 17 against Sonnet 5 at `low`'s 24 on the Artificial Analysis index.
- **`medium` is the baseline effort** for both models. Sonnet goes lower for simpler tasks and higher for
  harder ones, and Opus goes up to `high`.

## Sonnet 5.5 against Opus 5.5

Anthropic's launch charts plot accuracy against cost for each model at each effort. The table below gives
the three coding charts, with each tier as score at cost per task (per attempt on Terminal-Bench). The
values were read from the chart images, so they are accurate to about ±1 point and ±5% on cost. Tiers
planandtier dropped are in italics.

| Tier | Terminal-Bench 4.0 | FrontierCode 1.1 | CursorBench 4.0 |
|---|---|---|---|
| `sonnet-low` | 20.0 @ $0.76 | 29.3 @ $0.20 | 35.8 @ $0.50 |
| `sonnet-medium` | 28.9 @ $0.84 | 36.5 @ $0.24 | 39.2 @ $0.70 |
| *`opus-low`* | 38.6 @ $1.30 | 47.3 @ $0.41 | 43.7 @ $1.17 |
| `sonnet-high` | 43.0 @ $1.94 | 49.4 @ $0.42 | 47.8 @ $1.67 |
| `opus-medium` | 57.7 @ $2.93 | 54.6 @ $0.81 | 52.5 @ $2.90 |
| *`sonnet-xhigh`* | 61.4 @ $5.30 | 52.2 @ $1.59 | 53.1 @ $3.90 |
| `opus-high` | 64.1 @ $3.89 | 54.0 @ $1.09 | 56.1 @ $3.97 |
| *`opus-xhigh`* | 66.4 @ $7.40 | 51.4 @ $2.25 | 56.1 @ $7.00 |

Each step on the kept ladder scores higher than the one before on every chart except one: on FrontierCode,
`opus-high` scores 0.6 points below `opus-medium`, which is within the reading error. Going from
`sonnet-medium` to `sonnet-high` gains 9 to 14 points for 1.8 to 2.4× the cost, which is why starting at
`medium` and letting a failure climb still pays.

Sonnet 5.5 is a large step over Sonnet 5. Sonnet 5's best score (at `max`) was 10.3 on Terminal-Bench, 42.7
on FrontierCode and 34.1 on CursorBench. Sonnet 5.5 beats that already at `low` on Terminal-Bench and
CursorBench, and at `high` on FrontierCode, each for a tenth of the cost or less. On AA-Briefcase, a long-horizon
knowledge-work benchmark, the two models' curves nearly overlap at equal cost. It is not a coding benchmark
and did not weigh in the decision.

## Earlier round: Opus 5.5 at `low` against Sonnet 5 at `xhigh`

The only direct comparison of these two tiers was Artificial Analysis (AA). Opus 5.5 at `low` came out
ahead on every measure there:

| AA measure | Sonnet 5 `xhigh` | Opus 5.5 `low` |
|---|---|---|
| Intelligence Index v4.3.2 | 34 | 42 |
| Terminal-Bench 4.0 | 7% | 31% |
| AutomationBench | 34% | 53% |
| SciCode | 54% | 59% |
| Cost per index task | $2.87 | $0.55 |

Anthropic's SWE-bench Pro subset (478 problems, one harness) did not run Sonnet 5 at `xhigh`. It ran Sonnet 5
at its default, `high`: 77.4% solved, at $0.84 per solved task. Opus 5.5 at `low` solved 87.4%, at $0.12.

Results that favored Sonnet 5 had no Opus 5.5 entry: on SWE-rebench (tasks from 2026-05-15 to 2026-07-01),
Sonnet 5 at `high` resolved 56.8% at $1.43 per problem, against Opus 5 at `high`'s 63.4% at $3.47; on Scale's
SWE-Bench Pro V2, Sonnet 5 at `xhigh` scored 88.2 against Opus 5's 98.0.

## Within Opus 5.5

| Step | Gain | Cost | Source |
|---|---|---|---|
| `low` → `medium` | +5.4 pts SWE-bench Pro subset; AA 42 → 51; Terminal-Bench 31 → 53% (AA), 38.6 → 57.7% (Anthropic) | about 1.8× per solved task, 2.4× per AA task | Anthropic; AA |
| `medium` → `high` | +2.5 pts; AA 51 → 54; CursorBench 52.5 → 56.0% | about 1.3× | Anthropic; AA; system card |
| `high` → `xhigh` | +1.4 pts; AA 54 → 56; CursorBench equal (56.0%); FrontierCode 54.0 → 51.4% | 1.8 to 2.5× | Anthropic; AA; system card |

## Caveats

- **All of the Sonnet 5.5 data is Anthropic's own**, from its launch charts. The page's URL was not
  recorded with the screenshots. The Opus 5.5 and Sonnet 5 points on those charts are unlabelled, so
  their effort levels are inferred from cost order. The Opus CursorBench points match its system card at
  `medium`, `high`, `xhigh` and `max`.
- **Most of the earlier per-effort data comes from two sources:** Anthropic, and Artificial Analysis. AA's
  Opus 5.5 rows are labelled "Default Fallback", unexplained; on a Vals benchmark, provider-side fallback
  was worth about 8 points for Opus 5.5 at `max`.
- **Sonnet's price is $2/$10 per million tokens**, for both Sonnet 5 and Sonnet 5.5
  (`probes/evidence/planandtier-pricing.json`, fetched 2026-09-28). The charts give cost per task directly,
  so the findings above do not depend on it.
- **Public benchmarks are long, hard tasks.** planandtier's tasks are smaller and fully specified, where the
  gaps between tiers are usually smaller.
