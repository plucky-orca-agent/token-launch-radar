// Token Launch Radar — the model.
//
// One sealed DefiLlama snapshot in, one ranked board of pre-token protocols out.
//
// The board ranks every independent protocol in the snapshot that has no token yet, not just the
// house watchlist (40): the watchlist is the floor, never the ceiling. Two sets are never ranked,
// and the dashboard shows both apart with the reason: protocols whose token already trades (they
// are the calibration set, shown at the market's own values), and wrapped / staked / bridged
// products plus exchange balance sheets — a claim on an asset that already trades is not a token
// that does not exist yet, so no launch value is imputed to them.
//
// Implied value is derived only from the snapshot's own figures — no protocol name is ever
// special-cased, and every constant below is stated on the dashboard:
//
//   multiple(category)  the median market-cap / TVL ratio of the token-bearing protocols in the
//                       same DefiLlama category, computed from this snapshot (a category with
//                       fewer than 3 priced peers falls back to the all-category median).
//   base                = tvl_usd x multiple(category)
//   growth multiplier   = 1 + clamp(change_7d, -50, +100) / 100 x 0.35
//   maturity multiplier = 0.78 + 0.22 x min(tokenless days, 1460) / 1460   (unknown age: 0.88)
//   launch factor       how plausible an own token is, from the snapshot itself: the smoothed
//                       share of the category that already has a token, mapped to 0.55..1.00.
//   implied value       = max(1, round(base x growth x maturity x launch))
//
// Each row also carries value_if_launched_usd (the same product without the launch factor), so a
// reader can see both what a token might be worth and how much the launch doubt cost it.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface CategoryStat {
  category: string;
  protocols: number;
  token_bearing: number;
  priced_peers: number;
  multiple: number | null;
  launch_share: number;
}

export interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_factor: number;
  value_if_launched_usd: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** A pre-token entry the board deliberately does not rank: a product of an asset that already trades, or an exchange balance sheet. */
export interface ProductRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  protocol_count: number;
  watchlist_size: number;
  board_size: number;
  product_size: number;
  live_size: number;
  global_multiple: number;
  categories: CategoryStat[];
  rows: Row[];
  products: ProductRow[];
  live: LiveRow[];
}

export const MODEL_VERSION = 'launch-radar-2';

const GROWTH_WEIGHT = 0.35;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const MATURITY_BASE = 0.78;
const MATURITY_SPAN = 0.22;
const MATURITY_DAYS = 1460;
const UNKNOWN_AGE_MULTIPLIER = 0.88;
const MIN_PEERS = 3;

const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** An exchange balance sheet, or a wrapped / staked / bridged claim on an asset that already trades. */
export function isProductClass(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return false;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function categoryStats(snapshot: Snapshot): { stats: Map<string, CategoryStat>; globalMultiple: number } {
  const ratios = new Map<string, number[]>();
  const totals = new Map<string, number>();
  const bearing = new Map<string, number>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    const c = p.category ?? 'Uncategorized';
    totals.set(c, (totals.get(c) ?? 0) + 1);
    if (!isPreToken(p)) bearing.set(c, (bearing.get(c) ?? 0) + 1);
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const r = p.mcap_usd / p.tvl_usd;
      allRatios.push(r);
      const list = ratios.get(c) ?? [];
      list.push(r);
      ratios.set(c, list);
    }
  }
  const globalMultiple = allRatios.length > 0 ? median(allRatios) : 0.2;
  const stats = new Map<string, CategoryStat>();
  for (const [c, total] of totals) {
    const peers = ratios.get(c) ?? [];
    const tokenBearing = bearing.get(c) ?? 0;
    stats.set(c, {
      category: c,
      protocols: total,
      token_bearing: tokenBearing,
      priced_peers: peers.length,
      multiple: peers.length >= MIN_PEERS ? clamp(median(peers), 0.02, 4) : null,
      launch_share: (tokenBearing + 2) / (total + 10),
    });
  }
  return { stats, globalMultiple };
}

const CHAIN_GAS: Record<string, string> = {
  Ethereum: '$8–25 per transaction at typical gas',
  Solana: 'under $0.05 per transaction',
  Base: '$0.05–0.30 per transaction',
  Arbitrum: '$0.10–0.50 per transaction',
  Optimism: '$0.10–0.50 per transaction',
  Polygon: '$0.01–0.10 per transaction',
  BSC: '$0.10–0.60 per transaction',
  Avalanche: '$0.20–1.00 per transaction',
  'zkSync Era': '$0.10–0.40 per transaction',
  Linea: '$0.05–0.30 per transaction',
  Scroll: '$0.05–0.30 per transaction',
  Mantle: '$0.05–0.30 per transaction',
  Tron: '$1–3 per transaction in energy fees',
  Bitcoin: '$1–5 per transaction at typical fees',
  Sui: 'under $0.05 per transaction',
  Aptos: 'under $0.05 per transaction',
};

const CATEGORY_ACTION: Record<string, string> = {
  Dexs: 'Route real swap volume through the main pools: two to four swaps a week in the deepest pairs, sized $500–2,000 each, never wash trades',
  Lending: 'Supply a blue-chip collateral asset and keep a conservative borrow of 30–40% against it, rebalanced weekly so the health factor stays above 2',
  'Liquid Staking': 'Stake the native asset through the protocol and hold the receipt token in the same wallet; do not loop it through leverage',
  'Liquid Restaking': 'Restake a liquid staking token and hold the restaked position untouched; restaking points accrue to the holding wallet',
  Yield: 'Deposit into the flagship vault and leave the position compounding; add a second smaller deposit each month instead of moving the first',
  'Yield Aggregator': 'Split the deposit across two vaults and let the auto-compound run; harvest nothing manually so the share balance only grows',
  'Risk Curators': 'Allocate to the largest curated vault and keep the allocation steady; curators reward consistent, long-lived deposits',
  'Onchain Capital Allocator': 'Deposit into the main allocation vault and hold through a full quarter; allocator seasons are scored on time-weighted balances',
  Bridge: 'Bridge modest amounts ($250–1,000) across the supported routes in both directions, a few crossings a month, and keep the destination wallets active',
  'Canonical Bridge': 'Bridge native assets to the canonical chain monthly and use the destination chain from the same wallet afterwards',
  RWA: 'Complete the investor onboarding and KYC, then hold a position in the flagship real-world-asset vault for at least two quarters',
  CDP: 'Open a collateralised debt position with a blue-chip asset at a conservative ratio and keep it open, adjusting collateral monthly',
  'Basis Trading': 'Fund a delta-neutral basis position at the smallest offered tier and keep it open through a full funding cycle',
  CEX: 'Keep a funded account with regular spot trades each month; exchange tokens, when they exist, have historically rewarded account age and steady volume',
  'Launchpad': 'Hold the required balance and join public sales as they open; keep participation records for every round',
  'Derivatives': 'Trade modest perpetual volume weekly with tight risk limits; fee and open-interest history is what these programs usually score',
  'Options': 'Buy or write small dated options positions monthly so the account shows a real trading history across expiries',
  'Payments': 'Route real payments or settlements through the protocol monthly; volume history is the metric these networks publish',
  'Privacy': 'Make periodic private transfers of modest size from the farming wallet, spaced over months rather than in one burst',
  'Indexes': 'Buy and hold the flagship index product; index issuers score holding duration and balance at snapshots',
  'Chain': 'Run activity on the chain itself: bridge in, use two or three native apps weekly, and keep a small native-token balance for gas',
};

function capitalTier(tvl: number): number {
  if (tvl >= 1_000_000_000) return 10000;
  if (tvl >= 200_000_000) return 5000;
  if (tvl >= 50_000_000) return 2500;
  if (tvl >= 10_000_000) return 1000;
  return 500;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export function farmSteps(p: Protocol, age: number | null): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const gas = CHAIN_GAS[chain] ?? 'a few dollars per transaction on its main chain';
  const capital = capitalTier(p.tvl_usd);
  const action = (p.category !== null && CATEGORY_ACTION[p.category]) || 'Use the core product the way a real user would: a deposit or position of real size, opened once and used on a weekly rhythm';
  const second = p.chains.length > 1
    ? `Repeat the same activity on ${p.chains[1]} from the same wallet in the second month, so the wallet shows multi-chain history if a program ever scores it (cost: ${gas}; time: ~30 minutes a month).`
    : `Deepen instead of widening: add about 20% to the position each month rather than opening new wallets, which snapshot scoring usually treats as one farmer (cost: about ${money(Math.round(capital * 0.2))} a month; time: ~15 minutes a month).`;
  const hold = Math.round(clamp(540 - (age ?? 365) / 4, 90, 365));
  return [
    `Open a dedicated farming wallet and fund it on ${chain} before touching ${p.name}; keep this wallet separate from any cold storage (cost: ${gas}; time: ~30 minutes once).`,
    `${action} on ${p.name}, starting with about ${money(capital)} of working capital sized to its ${money(p.tvl_usd)} TVL (cost: ${gas} plus any deposit fees; time: ~1 hour to set up, then ~20 minutes a week).`,
    second,
    `Hold the position for at least ${hold} days and keep a dated log of balances and transaction hashes; launch distributions that use snapshots reward duration and consistency, not one-week bursts (cost: the capital stays locked and exposed to protocol risk; time: ~10 minutes a week to log).`,
    `Cap the total exposure to ${p.name} at ${money(capital * 2)} and re-check monthly whether it has announced a token, a points program or a snapshot; follow only its official site and verified channels, never links from replies or DMs (cost: $0; time: ~15 minutes a month).`,
  ];
}

function productReason(p: Protocol): string {
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange balance sheet: the TVL is customer funds held by an exchange, not an independent protocol waiting on a launch';
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product: its value is a claim on an asset whose token already trades';
  return `a ${p.category ?? 'bridge'} product: its TVL is a claim on assets that already trade, not a protocol still waiting on a launch`;
}

export function buildRadar(snapshot: Snapshot): Radar {
  const { stats, globalMultiple } = categoryStats(snapshot);
  const watch = new Set(snapshot.watchlist);
  const rows: Row[] = [];
  const products: ProductRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || VERSIONED.test(p.name)) continue;
    if (isProductClass(p)) {
      products.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: productReason(p) });
      continue;
    }
    const c = p.category ?? 'Uncategorized';
    const stat = stats.get(c)!;
    const multiple = stat.multiple ?? globalMultiple;
    const growthPct = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
    const growthMultiplier = 1 + (growthPct / 100) * GROWTH_WEIGHT;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const maturityMultiplier = age === null ? UNKNOWN_AGE_MULTIPLIER : MATURITY_BASE + MATURITY_SPAN * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS);
    const launchFactor = 0.55 + 0.45 * stat.launch_share;
    const ifLaunched = p.tvl_usd * multiple * growthMultiplier * maturityMultiplier;
    rows.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      on_watchlist: watch.has(p.slug),
      multiple: Math.round(multiple * 1000) / 1000,
      growth_multiplier: Math.round(growthMultiplier * 1000) / 1000,
      maturity_multiplier: Math.round(maturityMultiplier * 1000) / 1000,
      launch_factor: Math.round(launchFactor * 1000) / 1000,
      value_if_launched_usd: Math.max(1, Math.round(ifLaunched)),
      implied_value_usd: Math.max(1, Math.round(ifLaunched * launchFactor)),
      farm_steps: farmSteps(p, age),
    });
  }
  products.sort((a, b) => b.tvl_usd - a.tvl_usd);
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    protocol_count: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    product_size: products.length,
    live_size: live.length,
    global_multiple: Math.round(globalMultiple * 1000) / 1000,
    categories: [...stats.values()].sort((a, b) => b.protocols - a.protocols),
    rows,
    products,
    live,
  };
}

export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!data || !Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot is missing its protocols or watchlist');
  }
  return data;
}

/** The gate's shape, checked before anything is written: full watchlist, clean ranks, sane rows. */
export function boardIssue(rows: Row[], snapshot: Snapshot): string | null {
  const slugs = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.rank !== i + 1) return `rank ${i + 1} is ${rows[i]!.rank}`;
    if (i > 0 && rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
    const r = rows[i]!;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  if (rows.length >= 2 && rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  return null;
}

export function dataScript(radar: Radar): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
