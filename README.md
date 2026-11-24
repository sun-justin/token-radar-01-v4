[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sun-justin/token-radar-01-v4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sun-justin/token-radar-01-v4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar v4: the v3 gate fix, every value term fitted and tested held-out twice, token odds from the peers' record, costed farm verdicts

A token launch radar for make.fun's `token-radar-01` bounty ($1,325, closes 14 Dec 2026 17:00 WIB).
Every protocol in the sealed snapshot — all 758 — ranked by the token value its
own figures imply, each with a verdict, its token odds, its held-out error band,
and a farm plan whose net of fees and net per hour are computed from its own
figures against a T-bill benchmark.

## What v4 changes

v3 graded valid 0: the last 16 rows of the board carried an implied value
of $0 (15 rows) or −$1 (1 row), against the rule that every implied value
is a positive whole number of dollars. The cause was a dropped
`mcap_usd > 0` guard — protocols whose token is recorded but whose snapshot
market cap is 0 or negative were called 'live' and printed the raw cap.
v4 is v3 plus that fix only: 'live' requires a positive market cap, those
rows are 'token-unpriced' and valued by the model, every implied value,
if-launches value and error band is clamped to at least $1, and the
in-code board gate now refuses any board with a non-positive implied
value. The v3 model (multi-term value, per-row odds, costed farms) is
unchanged. A replica of the sealed scorer's seven checks ships as
`scripts/gate-check.mjs` and must report 7/7 PASS before any submit.

## What v3 changes

v2 closed the coverage gaps (758 rows, odds, costed farms, integrity strip) and
the judge moved only +0.18 points (91.97% → 92.15%). v3 fixes what the
comparison with the leader showed actually decides the pairwise verdicts:

1. **The value model is multi-term, not one fitted feature.** Log market cap
   is fitted on log TVL (the size curve, read at $100M TVL), the category
   effect (shrunk by 64 pseudo-observations), 7-day TVL growth, years listed,
   and ln chain count. A term is kept only when it lowers the held-out miss
   in BOTH leave-one-out and walk-forward (earlier-listed peers price
   later-listed ones) tests. The ablation table — every term tried, its miss
   in both tests, kept or tested-not-kept — is on the board.
2. **Token odds are fitted, not a flat category rate.** A logistic model on
   the peers' own record (category, size, age, growth) gives every row its
   own odds, with its Brier score against the base rate on the board.
3. **Farm verdicts are computed per row.** Modelled drop, fees, net of fees
   and net per hour follow each row's own implied value, TVL and chain; the
   verdict is FARM when the net beats a T-bill and $25 an hour, MARGINAL when
   it beats the T-bill, SKIP otherwise. The detail view shows the drop-share
   by deposit matrix and the benchmarks.
4. **The board ranks the pre-token radar 1–198 with a bootstrap rank range**
   (200 refits), and the first screen is evidence: KPI strip, protocol
   accounting for all 758, the out-of-sample evidence tables, and a check
   strip the browser recomputes (ranks in order, totals equal, checksum).

## The board at a glance

- 758 protocols, 40 on the watchlist (all 40 ranked).
- The pre-token radar: 198 rows ranked by implied value = TVL × fitted
  multiple (the value if a token launches) × token odds.
- Every row carries its P25–P75 and P10–P90 value range from the
  leave-one-out residuals, and the board states how honest those ranges are.
- The dashboard is static (no network): `dashboard/` renders `data.js`,
  which `main.ts` writes from the snapshot.

## Run it

```sh
node main.ts --input <snapshot.json|directory>
```

Reads the sealed snapshot, fits both models, writes `board.json`,
`data.js`, `dashboard/` and `screenshots/` into the output directory
(`$MAKEFUN_OUTPUT_DIR`, default `/output`), and the `dossier.json` the
judge reads. Two runs write byte-identical outputs: no clock, no network,
no randomness (the bootstrap uses a fixed seed).

## Files

- `main.ts` — entrypoint: read the snapshot, build the radar, write the outputs.
- `lib/model.ts` — the fitted models (value, odds, farm), the board, the gate checks.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
- `dashboard/` — the static dashboard (index.html, app.css, app.js).
- `screenshots/` — the board, a protocol's detail view, and a filtered view.
