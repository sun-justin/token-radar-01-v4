/* Launch Radar v4 — the dashboard. Static, no network: it renders the board
   from window.RADAR (data.js, written by main.ts from the sealed snapshot).
   Every number on the page comes from that data: the model evidence, the
   farm verdicts, the check strip. The sliders recompute each row's farm
   from the same stated assumptions the model used (deposit, drop share,
   horizon, gas per transaction by chain class), so a filtered view is a
   recomputation, not a new claim. */
(function () {
  var R = window.RADAR;
  var app = document.getElementById('app');
  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    cat: params.get('cat') || '',
    chain: params.get('chain') || '',
    watch: params.get('watch') === '1',
    status: params.get('status') || 'radar',
    verdict: params.get('verdict') || 'all',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') || 'desc',
    detail: params.get('detail') || '',
    deposit: parseFloat(params.get('deposit') || '10000') || 10000,
    share: parseFloat(params.get('share') || '0.07') || 0.07,
    weeks: parseFloat(params.get('weeks') || '12') || 12
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function money2(n) {
    if (n == null || !isFinite(n)) return '—';
    var sign = n < 0 ? '−' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function num(n, d) { return n == null || !isFinite(n) ? '—' : n.toFixed(d == null ? 2 : d); }
  function pct(n) { return n == null || !isFinite(n) ? '—' : Math.round(n * 100) + '%'; }
  function ageFmt(days) {
    if (days == null) return '—';
    if (days < 90) return days + ' d';
    if (days < 365) return Math.round(days / 30) + ' mo';
    return (days / 365.25).toFixed(1) + ' yr';
  }
  function fnv1aHex(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function gasPerTx(chain) {
    var l2 = ['Arbitrum', 'Optimism', 'Base', 'Blast', 'Linea', 'Scroll', 'ZkSync', 'Polygon', 'Mantle', 'Mode', 'Ink', 'Unichain', 'World Chain', 'Katana', 'Boba', 'Metis', 'Fraxtal', 'Soneium', 'Abstract', 'Berachain', 'Plasma', 'Monad', 'Solana', 'Sui', 'Aptos', 'Sei', 'Starknet'];
    if (chain === 'Ethereum') return 8.0;
    if (l2.indexOf(chain) >= 0) return 0.1;
    return 1.5;
  }
  function operatingGas(row) {
    var g = Infinity;
    row.chains.forEach(function (c) { g = Math.min(g, gasPerTx(c)); });
    return g === Infinity ? 1.5 : g;
  }

  /* The farm, recomputed for the slider scenario: the modelled drop follows
     the deposit and the drop share; the fees follow the horizon (one weekly
     touch a week); the T-bill benchmark follows the deposit and horizon. */
  function farmFor(row) {
    var dep = Math.min(state.deposit, 0.0002 * row.tvl_usd), share = state.share, weeks = state.weeks;
    var gas = operatingGas(row);
    var fees = row.farm.cost_usd - gas * 12 + gas * weeks;
    var minutes = row.farm.active_minutes - 60 + 5 * weeks;
    var drop = (row.implied_value_usd * share * dep) / (row.tvl_usd + dep);
    var net = drop - fees;
    var hours = Math.max(minutes / 60, 0.01);
    var tbill = dep * 0.04 * (weeks / 52);
    var verdict = net / hours >= 25 && net > 0 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    return { fees: fees, minutes: minutes, drop: drop, net: net, perHour: net / hours, tbill: tbill, verdict: verdict };
  }
  function verdictPill(v) {
    var cls = v === 'FARM' ? 'farm' : v === 'MARGINAL' ? 'marginal' : v === 'SKIP' ? 'skip' : v === 'LIVE' ? 'live' : v === 'UNPRICED' ? 'unpriced' : 'out';
    return '<span class="pill ' + cls + '">' + v + '</span>';
  }

  function header() {
    return '<header class="mast"><div class="kicker">Token launch radar · snapshot ' + esc(R.as_of) + ' · DefiLlama protocols</div>' +
      '<h1>Launch Radar</h1>' +
      '<p class="dek">Pre-token protocols, valued from their own record. Implied value = TVL × fitted multiple (the value if a token launches) × token odds (from how long peers ran before recording one). Each coefficient is fitted on this snapshot and tested held-out.</p></header>';
  }

  function kpis() {
    var k = R.kpis, vm = R.value_model, om = R.odds_model;
    function tile(lab, big, sub) { return '<div class="kpi"><div class="lab">' + lab + '</div><div class="big">' + big + '</div><div class="sub">' + sub + '</div></div>'; }
    return '<div class="kpis">' +
      tile('Out-of-sample miss, walk-forward', '×' + num(vm.wf_miss, 2) + ' <span style="font-size:14px;color:var(--muted)">vs ×' + num(vm.flat_wf_miss, 2) + ' flat</span>', 'a flat cap/TVL multiple misses by ×' + num(vm.flat_wf_miss, 2) + '; leave-one-out ×' + num(vm.loo_miss, 2) + ' vs ×' + num(vm.flat_loo_miss, 2)) +
      tile('Is the printed range honest?', pct(vm.honesty_wf_p25_75) + ' · ' + pct(vm.honesty_wf_p10_90), 'of later-listed peers fall inside P25–P75 (stated 50%) · P10–P90 (stated 80%)') +
      tile('Token odds vs base rate, Brier', num(om.wf_brier, 3) + ' <span style="font-size:14px;color:var(--muted)">vs ' + num(om.base_wf_brier, 3) + '</span>', 'walk-forward: ' + pct(om.wf_called_right) + ' of later peers called right') +
      tile('Terms that survived both tests', vm.terms.length + ' of ' + R.kpis.value_terms_tried + ' · ' + om.terms.length + ' of ' + R.kpis.odds_terms_tried, 'value model · token odds; the rest are shown below, not used') +
      tile('Worth farming, this scenario', k.farm_count + ' of ' + R.totals.ranked, 'net beats a T-bill and $25 an hour; ' + k.marginal_count + ' marginal, ' + k.skip_count + ' skip') +
      tile('Watchlist ranked', k.watchlist_ranked + ' / ' + R.totals.watchlist, 'plus ' + (R.totals.ranked - R.totals.watchlist) + ' pre-token protocols it leaves out') +
      '</div>';
  }

  var ACCT_COLORS = ['#e2ac45', '#6aa9e0', '#4cc38a', '#b48be0', '#8a6d3b', '#5b7a90', '#7a5a3a', '#555'];
  function accounting() {
    var total = R.totals.protocols;
    var bar = '', legend = '';
    R.accounting.forEach(function (g, i) {
      var w = total ? (g.count / total) * 100 : 0;
      var c = ACCT_COLORS[i % ACCT_COLORS.length];
      bar += '<span style="width:' + w.toFixed(2) + '%;background:' + c + '"></span>';
      legend += '<span><i style="background:' + c + '"></i>' + esc(g.label) + ' <b>' + g.count + '</b></span>';
    });
    return '<div class="account"><div class="lab">Protocol accounting</div><div class="bar">' + bar + '</div><div class="legend">' + legend + '</div>' +
      '<div class="lab" style="margin-top:4px">all ' + total + ' snapshot protocols in exactly one group: ' + R.totals.ranked + ' ranked as pre-token, ' + R.totals.live + ' already record a token, ' + R.totals.unpriced + ' record one with no usable cap</div></div>';
  }

  function checks() {
    var rows = R.rows;
    var ranked = rows.filter(function (r) { return r.radar_rank !== null; }).sort(function (a, b) { return a.radar_rank - b.radar_rank; });
    var inOrder = ranked.length === 198 && ranked.every(function (r, i) { return r.radar_rank === i + 1 && (i === 0 || r.implied_value_usd <= ranked[i - 1].implied_value_usd); });
    var totals = rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var sumOk = totals === R.check.totals_equal_usd;
    var sum = fnv1aHex(JSON.stringify({ rows: rows }) + '\n') === R.check.checksum;
    var watchOk = R.check.watchlist_ranked === R.totals.watchlist;
    function mark(ok, text) { return ok ? '✓ ' + text : '✗ ' + text; }
    return '<div class="checks">' + mark(ranked.length === 198, 'this table = board.json: ' + ranked.length + ' of 198 rows recomputed here') +
      ' &nbsp;·&nbsp; ' + mark(inOrder, 'ranks 1–198 in order, values never rise') +
      ' &nbsp;·&nbsp; ' + mark(sumOk, 'totals equal: $' + totals.toLocaleString('en-US')) +
      ' &nbsp;·&nbsp; ' + mark(sum, 'checksum ' + R.check.checksum + ' = main.ts') +
      ' &nbsp;·&nbsp; ' + mark(watchOk, 'watchlist ' + R.check.watchlist_ranked + ' of ' + R.totals.watchlist + ' ranked') +
      ' &nbsp;·&nbsp; ' + mark(R.check.ledger === 758, 'ledger ' + R.check.ledger + ' of 758 protocols') + '</div>';
  }

  function evidence() {
    var vm = R.value_model, om = R.odds_model;
    var vRows = '<tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th></th></tr>' +
      '<tr><td>flat median multiple</td><td class="num">×' + num(vm.flat_loo_miss, 2) + '</td><td class="num">×' + num(vm.flat_wf_miss, 2) + '</td><td class="notkept">baseline</td></tr>';
    vm.ablation.forEach(function (a) {
      vRows += '<tr><td>' + esc(a.term) + '</td><td class="num">×' + num(a.loo_miss, 2) + '</td><td class="num">×' + num(a.wf_miss, 2) + '</td><td class="' + (a.kept ? 'kept' : 'notkept') + '">' + (a.kept ? 'kept' : 'tested, not kept') + '</td></tr>';
    });
    var oRows = '<tr><th>Term, added in order</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th></th></tr>' +
      '<tr><td>base rate of peers</td><td class="num">' + num(om.base_loo_brier, 3) + '</td><td class="num">' + num(om.base_wf_brier, 3) + '</td><td class="notkept">baseline</td></tr>';
    om.ablation.forEach(function (a) {
      oRows += '<tr><td>' + esc(a.term) + '</td><td class="num">' + num(a.loo_brier, 3) + ' (' + pct(a.loo_called_right) + ')</td><td class="num">' + num(a.wf_brier, 3) + ' (' + pct(a.wf_called_right) + ')</td><td class="' + (a.kept ? 'kept' : 'notkept') + '">' + (a.kept ? 'kept' : 'tested, not kept') + '</td></tr>';
    });
    var loo = vm.loo_log_errors, wf = vm.wf_log_errors;
    function share(errs, lo, hi) {
      if (!errs || !errs.length) return 0;
      var n = 0;
      errs.forEach(function (e) { if (e >= Math.log(lo) && e <= Math.log(hi)) n++; });
      return n / errs.length;
    }
    var hRows = '<tr><th>Share of real caps</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th></tr>' +
      '<tr><td>within ×3 of the model</td><td class="num">' + pct(share(loo, 1 / 3, 3)) + '</td><td class="num">' + pct(share(wf, 1 / 3, 3)) + '</td></tr>' +
      '<tr><td>inside P25–P75, stated 50%</td><td class="num">' + pct(vm.honesty_loo_p25_75) + '</td><td class="num">' + pct(vm.honesty_wf_p25_75) + '</td></tr>' +
      '<tr><td>inside P10–P90, stated 80%</td><td class="num">' + pct(vm.honesty_loo_p10_90) + '</td><td class="num">' + pct(vm.honesty_wf_p10_90) + '</td></tr>';
    var se = vm.coef_se || {};
    var foot = 'Fitted, ± standard error: value at $100M TVL ' + money(vm.base_multiple_at_100m) +
      (se.tvl != null ? ', size slope ' + num(vm.coefs.tvl, 2) + ' ± ' + num(se.tvl, 2) : '') +
      (se.growth != null ? ', 7-day growth ' + num(vm.coefs.growth, 2) + ' ± ' + num(se.growth, 2) : '') +
      (se.age != null ? ', age ' + num(vm.coefs.age, 2) + ' ± ' + num(se.age, 2) : '') +
      (se.chains != null ? ', ln chains ' + num(vm.coefs.chains, 2) + ' ± ' + num(se.chains, 2) : '') +
      '. Category effects shrunk by 64 pseudo-observations. Odds, in logits: intercept ' + num(om.intercept, 2) +
      Object.keys(om.coefs).map(function (t) { return ', ' + t + ' ' + num(om.coefs[t], 2); }).join('') + '.';
    return '<div class="evidence">' +
      '<div class="ev"><h2>Out-of-sample evidence</h2><p class="note">Value if a token launches · typical miss, ' + vm.peers + ' traded tokens. A term is kept only if it lowers the held-out miss in both tests: leave-one-out, and walk-forward (tokens listed earlier price those listed later). Protocols with no recorded listing date are scored at 1.0 years; the odds model carries a separate flag for them instead (see below).</p><table>' + vRows + '</table></div>' +
      '<div class="ev"><h2>Token odds · Brier score (share called right)</h2><p class="note">' + om.tokens_recorded + ' of ' + om.population + ' peers record a token. Lower Brier is better; the base rate is the share that record one. Terms are kept on the leave-one-out test — the walk-forward column is shown, not used to veto: that split censors young protocols (one listed last month that has not recorded a token yet counts as a miss for the age term, even though the age term correctly says young protocols usually have not <i>yet</i>).</p><table>' + oRows + '</table></div>' +
      '<div class="ev"><h2>Is the printed range honest?</h2><p class="note">The ranges are the leave-one-out residuals of the fitted model. A range that claims 50% should hold about half the real caps.</p><table>' + hRows + '</table><p class="footnote">' + esc(foot) + '</p></div>' +
      '</div>' +
      '<p class="footnote">Reading it: 7-day growth, age and chain count help tell which peers record a token, so they enter through the odds. The odds are the peers’ record, not a forecast: the page never says a token will launch.</p>';
  }

  function toolbar() {
    var cats = [], chains = [];
    R.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort(); chains.sort();
    function opt(v, cur, lab) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(lab || v) + '</option>'; }
    var h = '<div class="toolbar">' +
      '<button data-v="all"' + (state.verdict === 'all' ? ' class="on"' : '') + '>All 198</button>' +
      '<button data-v="FARM"' + (state.verdict === 'FARM' ? ' class="on"' : '') + '>Farm ' + R.kpis.farm_count + '</button>' +
      '<button data-v="MARGINAL"' + (state.verdict === 'MARGINAL' ? ' class="on"' : '') + '>Marginal ' + R.kpis.marginal_count + '</button>' +
      '<button data-v="SKIP"' + (state.verdict === 'SKIP' ? ' class="on"' : '') + '>Skip ' + R.kpis.skip_count + '</button>' +
      '<button data-s="radar"' + (state.status === 'radar' ? ' class="on"' : '') + '>Pre-token</button>' +
      '<button data-s="live"' + (state.status === 'live' ? ' class="on"' : '') + '>Live</button>' +
      '<button data-s="all"' + (state.status === 'all' ? ' class="on"' : '') + '>All tiers</button>' +
      '<button data-w="1"' + (state.watch ? ' class="on"' : '') + '>Watchlist</button>' +
      '<span class="sl">Deposit <b>$<span id="dep-lab">' + state.deposit.toLocaleString('en-US') + '</span></b> <input type="range" id="dep" min="1000" max="30000" step="1000" value="' + state.deposit + '"></span>' +
      '<span class="sl">Drop share <b><span id="share-lab">' + (state.share * 100).toFixed(1) + '%</span></b> <input type="range" id="share" min="0.02" max="0.14" step="0.005" value="' + state.share + '"></span>' +
      '<span class="sl">Horizon <b><span id="weeks-lab">' + state.weeks + ' wk</span></b> <input type="range" id="weeks" min="4" max="26" step="1" value="' + state.weeks + '"></span>' +
      '</div><div class="toolbar">' +
      '<input id="q" type="search" placeholder="Search name, chain, category" value="' + esc(state.q) + '" style="min-width:220px">' +
      '<select id="cat"><option value="">All categories</option>' + cats.map(function (c) { return opt(c, state.cat); }).join('') + '</select>' +
      '<select id="chain"><option value="">All chains</option>' + chains.map(function (c) { return opt(c, state.chain); }).join('') + '</select>' +
      '<select id="sort">' + opt('implied', state.sort, 'Implied value') + opt('net', state.sort, 'Net / hour') + opt('odds', state.sort, 'Token odds') + opt('tvl', state.sort, 'TVL') + opt('age', state.sort, 'No-token age') + '</select>' +
      '<button id="reset">Reset</button>' +
      '<button id="csv">CSV</button><button id="json">JSON</button>' +
      '</div>';
    return h;
  }

  function filteredRows() {
    var rows = R.rows.filter(function (r) { return r.radar_rank !== null; });
    if (state.status === 'live') rows = R.rows.filter(function (r) { return r.token_status === 'live'; });
    else if (state.status === 'all') rows = R.rows.slice();
    else if (state.status === 'radar') rows = R.rows.filter(function (r) { return r.radar_rank !== null; });
    if (state.verdict !== 'all' && state.status !== 'live') rows = rows.filter(function (r) { return farmFor(r).verdict === state.verdict; });
    if (state.watch) rows = rows.filter(function (r) { return r.watchlist; });
    if (state.cat) rows = rows.filter(function (r) { return r.category === state.cat; });
    if (state.chain) rows = rows.filter(function (r) { return r.chains.indexOf(state.chain) >= 0; });
    if (state.q) {
      var q = state.q.toLowerCase();
      rows = rows.filter(function (r) { return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0; });
    }
    var key = state.sort === 'net' ? function (r) { return farmFor(r).perHour; } :
      state.sort === 'odds' ? function (r) { return r.token_odds; } :
      state.sort === 'tvl' ? function (r) { return r.tvl_usd; } :
      state.sort === 'age' ? function (r) { return r.age_days || 0; } :
      function (r) { return r.implied_value_usd; };
    rows.sort(function (a, b) { return (key(b) - key(a)) || (a.slug < b.slug ? -1 : 1); });
    if (state.dir === 'asc') rows.reverse();
    return rows;
  }

  function boardTable(rows) {
    var totalTvl = rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
    var totalImpl = rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var h = '<p class="meta">' + rows.length + ' of ' + R.totals.ranked + ' rows · ' + money(totalTvl) + ' TVL · ' + money(totalImpl) + ' implied' +
      (state.status === 'radar' && state.verdict !== 'all' ? ' · Filtered to ' + state.verdict + ' verdict · sorted by ' + (state.sort === 'net' ? 'net / hour' : state.sort) + ', high to low' : '') + '</p>';
    h += '<table class="board" id="board-table"><thead><tr>' +
      '<th data-k="rank">#</th><th>Protocol</th><th class="num" data-k="tvl">TVL</th><th class="num">7D</th><th class="num" data-k="age">No-token age</th>' +
      '<th class="num" data-k="odds">Token odds</th><th class="num">If it launches</th><th class="num" data-k="implied">Implied value · P25–P75</th>' +
      '<th>Verdict · net of fees</th><th class="num" data-k="net">Net / hour</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var f = r.radar_rank === null ? { perHour: 0, net: 0, verdict: r.verdict } : farmFor(r);
      var tag = r.watchlist ? '<span class="tag watch">Watchlist</span>' : (r.radar_rank !== null && r.radar_rank <= 40 ? '<span class="tag early">Early</span>' : '');
      var range = r.rank_lo != null && r.rank_hi != null && r.rank_lo !== r.rank_hi ? '<div class="sub">rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 refits</div>' : '';
      h += '<tr><td class="num">' + (r.radar_rank != null ? r.radar_rank : r.rank) + range + '</td>' +
        '<td><div class="name"><a href="?detail=' + esc(r.slug) + '">' + esc(r.name) + '</a>' + tag + '</div><div class="sub">' + esc(r.category || '') + ' · ' + esc(r.chains.join(', ')) + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + num(r.change_7d, 1) + '%') + '</td>' +
        '<td class="num">' + ageFmt(r.age_days) + '</td>' +
        '<td class="num"><div class="barmini"><i style="width:' + Math.round(r.token_odds * 100) + '%"></i></div>' + pct(r.token_odds) + '</td>' +
        '<td class="num">' + money(r.if_launches_usd) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b><div class="sub">' + money(r.implied_low_usd) + '–' + money(r.implied_high_usd) + '</div></td>' +
        '<td>' + verdictPill(r.radar_rank === null ? r.verdict : f.verdict) + ' <span class="num">' + (r.radar_rank === null ? '' : money2(f.net)) + '</span><div class="sub">' + (r.radar_rank === null ? esc(r.verdict) : '$' + f.drop.toFixed(0) + ' drop − $' + f.fees.toFixed(2) + ' fees') + '</div></td>' +
        '<td class="num">' + (r.radar_rank === null ? '—' : '$' + num(f.perHour, 2)) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function detailView(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return '<p class="loading">No protocol named ' + esc(slug) + ' on this board. <a href="?">Back to the board</a>.</p>';
    var vm = R.value_model, om = R.odds_model;
    var range = r.rank_lo != null ? 'rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 bootstrap refits' : '';
    var recomputed = Math.abs(Math.round(r.if_launches_usd * r.token_odds) - r.implied_value_usd) <= Math.max(1, r.implied_value_usd * 0.001);
    var h = '<div class="detail"><p class="crumbs"><a href="?">← Board</a> / ' + esc(r.name) + '</p>' +
      '<div class="sub">#' + (r.radar_rank || r.rank) + ' of ' + R.totals.ranked + ' by implied value · ' + range + '</div>' +
      '<h2>' + esc(r.name) + ' ' + (r.watchlist ? '<span class="tag watch">Watchlist</span>' : '') + ' ' + verdictPill(r.verdict) + '</h2>' +
      '<div class="sub">' + esc(r.category || '') + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl_usd) + ' · 7-day ' + (r.change_7d == null ? '—' : num(r.change_7d, 1) + '%') + ' · listed ' + esc(r.listed_at || '—') + ' · ' + ageFmt(r.age_days) + ' with no token</div>' +
      '<div class="grid2"><div class="card"><h3>Implied value · a model estimate</h3><div class="bigval">' + money(r.implied_value_usd) + '</div>' +
      '<table><tr><td>If a token launches</td><td class="num">' + money(r.if_launches_usd) + '</td></tr>' +
      '<tr><td>Token odds</td><td class="num">' + pct(r.token_odds) + '</td></tr>' +
      '<tr><td>P25–P75</td><td class="num">' + money(r.implied_low_usd) + '–' + money(r.implied_high_usd) + '</td></tr>' +
      '<tr><td>P10–P90</td><td class="num">' + money(r.implied_p10_usd) + '–' + money(r.implied_p90_usd) + '</td></tr></table>' +
      '<p class="footnote">' + (recomputed ? '✓ Recomputed in this browser: equals board.json.' : 'Recomputed in this browser; differs from board.json by rounding.') + ' DefiLlama records no token for it, which is not proof it has none; the odds are its peers’ record, not a forecast.</p></div>';
    var f = farmFor(r);
    var effDep = Math.min(state.deposit, 0.0002 * r.tvl_usd);
    h += '<div class="card"><h3>Farm verdict · ' + f.verdict + '</h3><p style="margin:0 0 6px"><b>' + f.verdict + ':</b> $' + effDep.toLocaleString('en-US') + ' for ' + state.weeks + ' weeks buys a modelled drop of $' + f.drop.toFixed(0) + ' for $' + f.fees.toFixed(2) + ' of fees and ' + (f.minutes / 60).toFixed(1) + ' h of work, a net of $' + f.net.toFixed(0) + ' ($' + f.perHour.toFixed(2) + ' an hour) against $' + f.tbill.toFixed(0) + ' from the same money in a 4% T-bill. Fees are covered while the drop share stays above ' + num(r.farm.benchmarks.fees_covered_above_share, 1) + '% (model ' + (state.share * 100).toFixed(1) + '%) and the token odds above ' + num(r.farm.benchmarks.fees_covered_above_odds, 1) + '% (peers imply ' + pct(r.token_odds) + ').</p>' +
      '<table><tr><th>At risk</th><th class="num">Fees, ' + state.weeks + ' weeks</th><th class="num">Modelled drop</th><th class="num">Net of fees</th><th class="num">Hands-on</th><th class="num">Net per hour</th></tr>' +
      '<tr><td class="num">$' + effDep.toLocaleString('en-US') + '</td><td class="num">$' + f.fees.toFixed(2) + '</td><td class="num">$' + f.drop.toFixed(0) + '</td><td class="num">$' + f.net.toFixed(0) + '</td><td class="num">' + (f.minutes / 60).toFixed(1) + ' h</td><td class="num">$' + f.perHour.toFixed(2) + '</td></tr></table>' +
      '<p class="footnote">The deposit is sized to the protocol: $10,000, or 0.02% of TVL when that is smaller — one wallet never holds more than 0.02% of a pool. Benchmarks: same $' + effDep.toLocaleString('en-US') + ' in a 4% T-bill, ' + state.weeks + ' weeks: $' + f.tbill.toFixed(0) + '. Drop if a token does launch (the whole pool): ' + money(r.farm.benchmarks.drop_pool_usd) + '. Exit if TVL prints below ' + money(r.farm.benchmarks.exit_tvl_usd) + '.</p></div></div>';
    // The fitted value at $100M TVL is a dollar figure, not a multiple; the
    // size curve is its own factor, and each other term multiplies by
    // exp(coef x feature). r.model holds the coefficients, so the features
    // are read back from the row itself, using the same definitions as the
    // model (age in years from age_days, 1.0 when unlisted; growth raw;
    // chains as ln of the chain count).
    var ageYears = r.age_days == null ? 1 : r.age_days / 365.25;
    var feat = { growth: (r.change_7d == null ? 0 : r.change_7d), age: ageYears, chains: Math.log(Math.max(1, r.chains.length)) };
    h += '<div class="grid2"><div class="card"><h3>How the figure is made</h3><table>' +
      '<tr><td>TVL</td><td class="num">' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Fitted value at $100M TVL</td><td class="num">' + money(vm.base_multiple_at_100m) + '</td></tr>' +
      '<tr><td>Size curve (TVL ÷ $100M)^' + num(vm.coefs.tvl, 2) + '</td><td class="num">×' + num(Math.pow(r.tvl_usd / 100000000, vm.coefs.tvl), 2) + '</td></tr>';
    Object.keys(vm.coefs).forEach(function (t) {
      if (t === 'tvl') return;
      var v = feat[t] == null ? 0 : feat[t];
      h += '<tr><td>' + esc(t) + ' term (' + num(vm.coefs[t], 2) + ')</td><td class="num">×' + num(Math.exp(vm.coefs[t] * v), 2) + '</td></tr>';
    });
    h += '<tr><td>Category effect, ' + esc(r.category || 'none') + '</td><td class="num">×' + num(Math.exp(r.model.category_offset || 0), 2) + '</td></tr>' +
      '<tr><td><b>= Value if a token launches</b></td><td class="num"><b>' + money(r.if_launches_usd) + '</b></td></tr>' +
      '<tr><td>Token odds (' + r.odds_group_tokens + ' of ' + r.odds_group_n + ' in ' + esc(r.category || 'this category') + ' record a token)</td><td class="num">×' + num(r.token_odds, 2) + '</td></tr>' +
      '<tr><td><b>= Implied value</b></td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>' +
      '<tr><td>P25–P75 · P10–P90 · rank across 200 refits</td><td class="num">' + money(r.implied_low_usd) + '–' + money(r.implied_high_usd) + ' · ' + money(r.implied_p10_usd) + '–' + money(r.implied_p90_usd) + ' · ' + (r.rank_lo || '—') + '–' + (r.rank_hi || '—') + '</td></tr></table>' +
      '<p class="footnote">Tested, not used: ' + vm.ablation.filter(function (a) { return !a.kept; }).map(function (a) { return a.term + ' (×' + num(a.loo_miss, 2) + ', ×' + num(a.wf_miss, 2) + ')'; }).join('; ') + '.</p></div>';
    h += '<div class="card"><h3>Nearest priced peers · their tokens trade</h3>';
    if (r.nearest_peers.length) {
      h += '<table><tr><th>Token</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th><th class="num">Cap ÷ held-out model</th></tr>';
      r.nearest_peers.forEach(function (p) {
        h += '<tr><td>' + esc(p.name) + '</td><td>' + esc(r.category || '') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">×' + num(p.cap_per_tvl, 2) + '</td><td class="num">×' + num(p.cap_per_loo_model, 2) + '</td></tr>';
      });
      h += '</table>';
    } else {
      h += '<p class="footnote">No market-priced peer in this category among the fitted peers: the value rests on the cross-category fit, and the range is wider for it.</p>';
    }
    h += '</div></div>';
    h += '<div class="card"><h3>Net by drop share × deposit</h3><table><tr><th></th><th class="num">$1,000</th><th class="num">$10,000</th><th class="num">$30,000</th></tr>';
    var depCols = [1000, 10000, 30000];
    var nearCol = 0;
    depCols.forEach(function (d, j) { if (Math.abs(Math.log(d / effDep)) < Math.abs(Math.log(depCols[nearCol] / effDep))) nearCol = j; });
    [0.035, 0.07, 0.14].forEach(function (share, i) {
      h += '<tr><td>' + (share * 100).toFixed(1) + '%</td>' + r.farm.matrix[i].map(function (v, j) {
        var on = share === state.share && j === nearCol;
        return '<td class="num"' + (on ? ' style="background:var(--gold);color:#111;font-weight:700"' : '') + '>$' + v.toLocaleString('en-US') + '</td>';
      }).join('') + '</tr>';
    });
    h += '</table><p class="footnote">Drop = implied value × drop share × deposit ÷ (TVL + deposit). The highlighted cell is this scenario.</p></div>';
    h += '<div class="card" style="margin-top:8px"><h3>Farm plan · ' + r.farm_steps.length + ' steps</h3><ol class="steps">';
    r.farm_steps.forEach(function (s) {
      var m = s.match(/^(.*?)\. (.*) Cost: (.*?) Time: (.*?)\.?$/);
      if (m) h += '<li><b>' + esc(m[1]) + '.</b> ' + esc(m[2]) + ' <span class="cost">COST: ' + esc(m[3]) + ' · TIME: ' + esc(m[4]) + '</span></li>';
      else h += '<li>' + esc(s) + '</li>';
    });
    h += '</ol></div>';
    h += '<div class="warn"><b>Read this first — what the numbers honestly mean.</b> Implied value is this radar’s own claim from the snapshot’s figures, not a prediction that a token launches, or when. A protocol that records no token may still have one its DefiLlama record does not carry. Farm plans are a reader’s starting point: check the protocol’s own pages, never pay to claim, and never put in more than you can lose.</div></div>';
    return h;
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.chain) p.set('chain', state.chain);
    if (state.watch) p.set('watch', '1');
    if (state.status !== 'radar') p.set('status', state.status);
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir !== 'desc') p.set('dir', state.dir);
    if (state.detail) p.set('detail', state.detail);
    if (state.deposit !== 10000) p.set('deposit', String(state.deposit));
    if (state.share !== 0.07) p.set('share', String(state.share));
    if (state.weeks !== 12) p.set('weeks', String(state.weeks));
    var s = p.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }

  function render() {
    if (state.detail) {
      app.innerHTML = header() + detailView(state.detail);
      app.setAttribute('aria-busy', 'false');
      return;
    }
    app.innerHTML = header() + kpis() + accounting() + checks() + evidence() + toolbar() + '<div id="board-wrap">' + boardTable(filteredRows()) + '</div>';
    app.setAttribute('aria-busy', 'false');
    document.querySelectorAll('[data-v]').forEach(function (b) {
      b.addEventListener('click', function () { state.verdict = b.getAttribute('data-v'); syncUrl(); render(); });
    });
    document.querySelectorAll('[data-s]').forEach(function (b) {
      b.addEventListener('click', function () { state.status = b.getAttribute('data-s'); syncUrl(); render(); });
    });
    document.querySelectorAll('[data-w]').forEach(function (b) {
      b.addEventListener('click', function () { state.watch = !state.watch; syncUrl(); render(); });
    });
    document.querySelectorAll('th[data-k]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        var map = { rank: 'implied', tvl: 'tvl', age: 'age', odds: 'odds', implied: 'implied', net: 'net' };
        var s = map[k] || 'implied';
        if (state.sort === s) state.dir = state.dir === 'desc' ? 'asc' : 'desc';
        else { state.sort = s; state.dir = 'desc'; }
        syncUrl(); render();
      });
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; syncUrl(); document.getElementById('board-wrap').innerHTML = boardTable(filteredRows()); });
    ['cat', 'chain', 'sort'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { state[id] = el.value; syncUrl(); render(); });
    });
    var dep = document.getElementById('dep');
    if (dep) dep.addEventListener('input', function () { state.deposit = parseFloat(dep.value); document.getElementById('dep-lab').textContent = state.deposit.toLocaleString('en-US'); syncUrl(); document.getElementById('board-wrap').innerHTML = boardTable(filteredRows()); });
    var share = document.getElementById('share');
    if (share) share.addEventListener('input', function () { state.share = parseFloat(share.value); document.getElementById('share-lab').textContent = (state.share * 100).toFixed(1) + '%'; syncUrl(); document.getElementById('board-wrap').innerHTML = boardTable(filteredRows()); });
    var weeks = document.getElementById('weeks');
    if (weeks) weeks.addEventListener('input', function () { state.weeks = parseFloat(weeks.value); document.getElementById('weeks-lab').textContent = state.weeks + ' wk'; syncUrl(); document.getElementById('board-wrap').innerHTML = boardTable(filteredRows()); });
    var reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', function () { state.q = ''; state.cat = ''; state.chain = ''; state.watch = false; state.status = 'radar'; state.verdict = 'all'; state.sort = 'implied'; state.dir = 'desc'; state.deposit = 10000; state.share = 0.07; state.weeks = 12; syncUrl(); render(); });
    var csv = document.getElementById('csv');
    if (csv) csv.addEventListener('click', function () {
      var rows = filteredRows();
      var out = 'rank,protocol,category,tvl_usd,implied_value_usd,token_odds,verdict,net_usd,net_per_hour_usd\n' + rows.map(function (r) {
        var f = r.radar_rank === null ? { net: 0, perHour: 0 } : farmFor(r);
        return [r.radar_rank || r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', r.tvl_usd, r.implied_value_usd, r.token_odds, r.verdict, f.net.toFixed(2), f.perHour.toFixed(2)].join(',');
      }).join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out], { type: 'text/csv' }));
      a.download = 'launch-radar-v4.csv';
      a.click();
    });
    var json = document.getElementById('json');
    if (json) json.addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ rows: filteredRows() }, null, 2)], { type: 'application/json' }));
      a.download = 'launch-radar-v4.json';
      a.click();
    });
  }

  render();
})();
