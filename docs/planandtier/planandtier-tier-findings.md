# planandtier: which tiers earn their place

planandtier ran nine tiers: `haiku-default`, Sonnet 5 at `low` to `xhigh`, and Opus 5.5 at `low` to
`xhigh`. This records the published data used on 2026-09-28 to decide whether any tier is redundant. It is
desk research, not a measurement of planandtier's own tasks. Evidence, with every source and figure:
`probes/evidence/planandtier-tier-research.json`.

## Decision

- **`sonnet-xhigh` was removed.** Work harder than `sonnet-high` goes to `opus-low`. The planner is not
  offered `sonnet` / `xhigh`; a plan that asks for it anyway runs it at `opus` / `low`.
- **`haiku-default` was removed** on the user's own research: Haiku does not follow instructions reliably
  and too often does its own thing on coding work. Its find-and-replace work went to `sonnet-low`. The
  published coding results are consistent with that: 25.5 against Sonnet 5's 88.2 on Scale's SWE-Bench Pro
  V2, and 17 against Sonnet 5 at `low`'s 24 on the Artificial Analysis index.
- **`medium` is the baseline effort.** The planner picks the model by the kind of work, starts at `medium`,
  and lowers effort for simpler tasks and raises it for harder ones.
- **Everything else stays**, including Sonnet at `low`, `medium` and `high`, which the user values for
  coding. Opus costs twice as much per output token. That leaves seven tiers.
- **To revisit when a newer Sonnet ships.** The data is specific to Sonnet 5 and Opus 5.5.

## Opus 5.5 at `low` against Sonnet 5 at `xhigh`

The only direct comparison of these two tiers is Artificial Analysis (AA). Opus 5.5 at `low` came out
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

The closest result is SciCode, reasoning-heavy scientific coding, where the gap is 5 points. Sonnet 5 at
`xhigh` thinks far more than Opus 5.5 at `low`: about 44k reasoning tokens per task on AA, against about 3k.
A single task that needs long, careful deliberation could still favor it. No published data tests that.

## Results that favor Sonnet

- **SWE-rebench** (tasks from 2026-05-15 to 2026-07-01): Sonnet 5 at `high` resolved 56.8% at $1.43 per
  problem, against Opus 5 (not 5.5) at `high`, 63.4% at $3.47.
- **Scale SWE-Bench Pro V2:** Sonnet 5 at `xhigh` scored 88.2, against Opus 5 at 98.0.

Neither has an Opus 5.5 entry. Opus 5.5 costs about 20% less per token than Opus 5, and Anthropic says that
at `medium` it matches or exceeds Opus 5 at `high` on coding.

## Within Opus 5.5

| Step | Gain | Cost | Source |
|---|---|---|---|
| `low` → `medium` | +5.4 pts SWE-bench Pro subset; AA 42 → 51; Terminal-Bench 31 → 53% | about 1.8× per solved task, 2.4× per AA task | Anthropic; AA |
| `medium` → `high` | +2.5 pts; AA 51 → 54; CursorBench 52.5 → 56.0% | about 1.3× | Anthropic; AA; system card |
| `high` → `xhigh` | +1.4 pts; AA 54 → 56; CursorBench equal (56.0%) | 2.5× | Anthropic; AA; system card |

`opus-xhigh` adds little over `opus-high`, but it stays: it is the top of the retry ladder and is reserved for
rare tasks.

## Caveats

- **Most of the per-effort data comes from two sources:** Anthropic, and Artificial Analysis. No third party
  publishes SWE-bench results by effort level for these models, and Anthropic publishes none for Sonnet 5.
- **AA's Opus 5.5 rows are labelled "Default Fallback", unexplained.** On a Vals benchmark, provider-side
  fallback was worth about 8 points for Opus 5.5 at `max`.
- **Sonnet 5's price is unresolved:** $2/$10 or $3/$15 per million tokens.
- **Public benchmarks are long, hard tasks.** planandtier's tasks are smaller and fully specified, where the
  gaps between tiers are usually smaller.
