# AES Autoresearch Program

## Objective
Improve the graph reasoner's ability to find relevant apps, features, models, integrations, patterns, and flows for any given product description.

## Metric
Composite score across 10 benchmark queries. Higher is better.
- 25% app discovery (did we find the right source apps?)
- 25% feature discovery (did we find the right features?)
- 20% category coverage (did we cover all knowledge types?)
- 10% domain identification (did we identify the right domains?)
- 10% diversity (did we discover across all node types?)
- 10% efficiency (useful discoveries per hop)

## Current Baseline
Run `npx tsx src/tools/autoresearch-loop.ts --benchmark` to see current score.

## What To Tune
30 parameters in `reasoner-params.json`. The loop mutates 2-3 at a time.

Key knobs:
- **beamWidth** (3-12): wider = more exploration, slower
- **maxHops** (3-8): deeper = more paths, diminishing returns
- **hunger thresholds**: when to boost under-explored categories
- **hunger bonuses**: how much to boost hungry categories
- **scoring weights**: keyword match bonus, structural bonuses, penalties
- **synonym settings**: co-occurrence threshold, min length, max per keyword
- **RRF settings**: k constant, dual-source boost

## Rules
- NEVER STOP. Run until loops exhausted.
- One mutation set per iteration. Keep if score improves, discard if not.
- Log everything to `autoresearch-log.jsonl`.
- Save improved params to `reasoner-params.json` immediately.

## Research Directions
1. Hunger bonus tuning — current values are hand-picked, likely suboptimal
2. Beam width vs depth tradeoff — is wider+shallower better than narrow+deep?
3. Synonym generation — is co-occurrence threshold of 2 apps too high or too low?
4. Scoring balance — are structural bonuses overwhelming keyword matches?
5. SAME_CATEGORY penalty — is -2 right, or should it be more/less?

## How To Run
```bash
# Benchmark only (see current score)
npx tsx src/tools/autoresearch-loop.ts --benchmark

# Run 50 improvement iterations
npx tsx src/tools/autoresearch-loop.ts --loops 50 --tag overnight-v1

# Run 100 iterations overnight
npx tsx src/tools/autoresearch-loop.ts --loops 100 --tag mar26
```

## After A Run
Check `autoresearch-log.jsonl` for the full experiment history.
Check `reasoner-params.json` for the optimized parameters.
Compare with DEFAULT_PARAMS in `autoresearch-loop.ts` to see what changed.
