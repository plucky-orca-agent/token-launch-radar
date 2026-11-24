// Token Launch Radar — the page. Everything renders from window.RADAR (../data.js), which main.ts
// writes from the same board as board.json: no fetch, no network, the page works from the files
// beside it. Filters and sorting are live; every row opens a detail view with its own model
// arithmetic and its farm plan.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}
const full = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('en-US')}`);
const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${Math.round(n * 100) / 100}%`);
const ageText = (d) => (d === null || d === undefined ? 'unknown' : d >= 730 ? `${(d / 365.25).toFixed(1)} yrs` : `${d} days`);

$('coverage-line').textContent =
  `${R.board_size} independent pre-token protocols ranked from ${R.protocol_count} in the snapshot — ` +
  `all ${R.watchlist_size} of the house watchlist included — with ${R.product_size} wrapped and exchange ` +
  `products set aside and the already-trading set shown only as calibration.`;
$('source-line').textContent = `Snapshot: ${R.source} · as of ${R.as_of} · model ${R.model_version}`;
$('global-multiple').textContent = R.global_multiple.toFixed(3);

// Category calibration table: the model's own workings, from the snapshot.
{
  const cats = R.categories.filter((c) => c.protocols >= 4).slice(0, 14);
  $('category-table-wrap').innerHTML =
    `<table class="cat-table"><thead><tr><th>Category</th><th class="num">Protocols</th><th class="num">With token</th>` +
    `<th class="num">Priced peers</th><th class="num">Median mcap/TVL</th><th class="num">Launch share used</th></tr></thead><tbody>` +
    cats.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.protocols}</td><td class="num">${c.token_bearing}</td>` +
      `<td class="num">${c.priced_peers}</td><td class="num">${c.multiple === null ? 'fallback' : c.multiple.toFixed(3)}</td>` +
      `<td class="num">${Math.round(c.launch_share * 100)}%</td></tr>`).join('') +
    `</tbody></table>`;
}

// Filter controls.
const state = { q: '', category: '', chain: '', watch: false, sort: 'rank', selected: null };
{
  const cats = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorized'))].sort();
  $('f-category').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('f-chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}
const params = new URLSearchParams(location.search);
if (params.get('category')) { state.category = params.get('category'); $('f-category').value = state.category; }
if (params.get('watch') === '1') { state.watch = true; $('f-watch').checked = true; }
if (params.get('q')) { state.q = params.get('q').toLowerCase(); $('q').value = params.get('q'); }

$('q').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); render(); });
$('f-category').addEventListener('change', (e) => { state.category = e.target.value; render(); });
$('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; render(); });
$('f-watch').addEventListener('change', (e) => { state.watch = e.target.checked; render(); });
$('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

function visible() {
  let rows = R.rows.filter((r) =>
    (!state.q || r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q)) &&
    (!state.category || (r.category ?? 'Uncategorized') === state.category) &&
    (!state.chain || r.chains.includes(state.chain)) &&
    (!state.watch || r.on_watchlist));
  const by = {
    rank: (a, b) => a.rank - b.rank,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    multiple: (a, b) => b.multiple - a.multiple,
  };
  return rows.sort(by[state.sort]);
}

function render() {
  const rows = visible();
  $('board-count').textContent = `${rows.length} of ${R.board_size} shown`;
  $('board-body').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}" class="${state.selected === r.slug ? 'selected' : ''}">
      <td class="num">${r.rank}</td>
      <td><span class="name-cell">${esc(r.name)}</span>${r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<span class="slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? 'Uncategorized')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
      <td class="num">${ageText(r.age_days)}</td>
      <td class="num implied">${money(r.implied_value_usd)}</td>
      <td class="num">${money(r.value_if_launched_usd)}</td>
    </tr>`).join('');
  for (const tr of $('board-body').querySelectorAll('tr')) {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug, false));
  }
}

function openDetail(slug, scroll) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  render();
  const d = $('detail');
  d.hidden = false;
  d.innerHTML = `
    <div class="detail-head">
      <h2 id="detail-h">#${r.rank} ${esc(r.name)}${r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
      <span class="detail-meta">${esc(r.slug)} · ${esc(r.category ?? 'Uncategorized')} · ${esc(r.chains.join(', ') || 'no chains recorded')} · listed ${esc(r.listed_at ?? 'unknown')}</span>
      <button class="close-btn" id="detail-close">Close</button>
    </div>
    <div class="detail-grid">
      <div>
        <h3>The model's arithmetic</h3>
        <div class="arith">
          <div><span>TVL (snapshot)</span><span>${full(r.tvl_usd)}</span></div>
          <div><span>× category multiple (${esc(r.category ?? 'Uncategorized')})</span><span>${r.multiple.toFixed(3)}</span></div>
          <div><span>× growth (7d ${pct(r.change_7d)})</span><span>${r.growth_multiplier.toFixed(3)}</span></div>
          <div><span>× maturity (tokenless ${ageText(r.age_days)})</span><span>${r.maturity_multiplier.toFixed(3)}</span></div>
          <div><span>= value if launched</span><span>${full(r.value_if_launched_usd)}</span></div>
          <div><span>× launch factor</span><span>${r.launch_factor.toFixed(3)}</span></div>
          <div class="total"><span>Implied value</span><span>${full(r.implied_value_usd)}</span></div>
        </div>
        <p class="reason">The multiple is the median market-cap / TVL of the priced, token-bearing protocols in the same category in this snapshot; the launch factor discounts categories that usually stay tokenless.</p>
      </div>
      <div>
        <h3>Farm plan</h3>
        <ol class="farm">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
    </div>`;
  $('detail-close').addEventListener('click', () => { d.hidden = true; state.selected = null; render(); });
  if (scroll) d.scrollIntoView();
}

// Set-aside products and the live calibration set.
{
  const top = R.products.slice(0, 20);
  $('products-intro').textContent =
    `${R.product_size} pre-token entries are deliberately not ranked: wrapped, staked and bridged products and exchange balance sheets. ` +
    `Their TVL is a claim on assets that already trade, so imputing a launch value would rank custody as if it were a protocol. The twenty largest:`;
  $('products-list').innerHTML =
    `<table class="mini-table"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why it is not ranked</th></tr></thead><tbody>` +
    top.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category ?? '—')}</td><td class="num">${money(p.tvl_usd)}</td><td class="reason">${esc(p.reason)}</td></tr>`).join('') +
    `</tbody></table>`;
  $('live-list').innerHTML =
    `<table class="mini-table"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>` +
    R.live.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category ?? '—')}</td><td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td><td class="num">${pct(p.change_7d)}</td></tr>`).join('') +
    `</tbody></table>`;
}

render();
if (params.get('detail')) {
  document.documentElement.classList.add('focus');
  openDetail(params.get('detail'), false);
}
