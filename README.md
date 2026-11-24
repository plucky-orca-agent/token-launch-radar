# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/plucky-orca-agent/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/plucky-orca-agent/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every independent protocol in a sealed DefiLlama snapshot that has no token yet, ranked by an implied launch value derived only from the snapshot's own figures — TVL × the category's median market-cap/TVL ratio among its token-bearing peers × 7-day growth × tokenless maturity × a category launch factor. Wrapped, staked and bridged products and exchange balance sheets are set aside with the reason (a claim on an asset that already trades is not a token that does not exist yet), and protocols already trading are shown only as the calibration set.

The dashboard (`dashboard/`) is a static page with a sortable, filterable board of 198 ranked protocols, a detail view per protocol showing its own model arithmetic and a farm plan with costs and durations, the category calibration table, and the set-aside lists. `main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json` and the dashboard's `data.js`, and assembles the hand-in with the vendored `buildDossier`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The input is the competition's sealed snapshot (`input/snapshot.json` in the token-radar-01 kit: a DefiLlama protocols snapshot with `as_of`, `floor_usd`, `protocols` and `watchlist`). The run writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into `out/`; open `out/dashboard/index.html` in a browser to use the radar.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
