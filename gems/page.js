(function () {
  'use strict';
  const G = window.ScoutAIGems;
  const state = { base: null, data: null, heights: null, label: '', cache: {}, tournament90: null, canValidate: true, token: 0 };

  function el(id) { return document.getElementById(id); }
  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(x) { return x == null ? '—' : String(x); }
  function fmtCi(ci) { return ci && ci[0] != null ? G.fmtCi(ci) : '—'; }
  function roleLabel(r) { return G.ROLES[r] || r; }
  function sig(ci) { return ci && ci[0] != null && (ci[0] > 0 || ci[1] < 0); }

  function renderStatic() {
    el('tdiList').innerHTML = G.TDI_COMPONENTS.map(function (c) {
      return '<li><strong>' + esc(c.label) + '</strong> — ' + esc(c.definition) +
        '<br><span class="muted">שדות: <code dir="ltr">' + esc(c.fields) + '</code></span></li>';
    }).join('');
    el('excludedList').textContent = G.EXCLUDED_FROM_TDI.join(' · ');
    el('gemTdi').textContent = G.GEM_MIN_TDI;
    el('gemConv').textContent = G.GEM_MAX_CONV;
    el('weightsTable').innerHTML = '<table><caption>ניקוד לאירוע (הדירוג הקונבנציונלי)</caption><thead><tr><th scope="col">אירוע</th><th scope="col">סוג</th><th scope="col">נקודות</th></tr></thead><tbody>' +
      G.PHYSICAL_ITEMS.map(function (it) { return '<tr><th scope="row">' + esc(it.label) + '</th><td>פיזי</td><td class="num">' + it.weight + '</td></tr>'; }).join('') +
      G.TECHNICAL_ITEMS.map(function (it) { return '<tr><th scope="row">' + esc(it.label) + '</th><td>טכני</td><td class="num">' + it.weight + '</td></tr>'; }).join('') +
      '</tbody></table><p class="muted">xG מקבל 3 נקודות לכל 1.0 xG. המשקלות נקבעו מראש ולא כוונו לפי התוצאה.</p>';
    el('splitSelect').innerHTML = Object.keys(G.SPLITS).map(function (id) {
      return '<option value="' + id + '">' + esc(G.SPLITS[id].label) + '</option>';
    }).join('');
    el('outcomeSelect').innerHTML = Object.keys(G.OUTCOMES).map(function (id) {
      return '<option value="' + id + '">' + esc(G.OUTCOMES[id].label) + '</option>';
    }).join('');
    el('gemRole').innerHTML = '<option value="ALL">כל התפקידים</option>' + Object.keys(G.ROLES).map(function (r) {
      return '<option value="' + r + '">' + esc(G.ROLES[r]) + '</option>';
    }).join('');
  }

  function validation(splitId, outcomeId) {
    const key = splitId + '|' + outcomeId;
    if (!state.cache[key]) state.cache[key] = G.validate(state.data, { splitId: splitId, outcomeId: outcomeId });
    return state.cache[key];
  }

  // ---- premise --------------------------------------------------------------
  function renderPremise() {
    const hb = G.heightBias(state.tournament90);
    if (hb.n < 10) {
      el('heightTable').innerHTML = '';
      el('heightNote').textContent = 'אין מספיק שחקנים עם גובה בנתונים (' + hb.n + '). בקובץ שלכם — הוסיפו עמודת heightCm.';
    } else {
      el('heightTable').innerHTML = '<table><caption>גובה מול מדדים, בתוך התפקיד (' + hb.n + ' שחקנים עם 90+ דקות וגובה ידוע)</caption><thead><tr><th scope="col">מדד</th><th scope="col">ρ עם גובה</th><th scope="col">95% CI</th><th scope="col">מובהק?</th></tr></thead><tbody>' +
        hb.items.map(function (it) {
          return '<tr><th scope="row">' + esc(it.label) + '</th><td class="num">' + fmt(it.rho) + '</td><td class="num">' + fmtCi(it.ci) + '</td><td>' + (sig(it.ci) ? 'כן' : 'לא') + '</td></tr>';
        }).join('') + '</tbody></table>';
      const by = {};
      hb.items.forEach(function (it) { by[it.id] = it; });
      const parts = [];
      if (sig(by.share.ci) && by.share.rho > 0) parts.push('החלק הפיזי באמת עולה עם הגובה (' + G.ltr('ρ=' + by.share.rho) + ') — כלומר הפירוק מודד משהו שקשור לגוף.');
      if (by.conventional && !sig(by.conventional.ci)) parts.push('אבל הדירוג הקונבנציונלי עצמו לא קשור לגובה בתוך התפקיד (' + G.ltr('ρ=' + by.conventional.rho) + ' ' + fmtCi(by.conventional.ci) + ') — בנתונים האלה הוא לא «מוטה לגבוהים».');
      else if (by.conventional) parts.push('הדירוג הקונבנציונלי ' + (by.conventional.rho > 0 ? 'עולה' : 'יורד') + ' עם הגובה (' + G.ltr('ρ=' + by.conventional.rho) + ' ' + fmtCi(by.conventional.ci) + ').');
      if (sig(by.tdi.ci) && by.tdi.rho < 0) parts.push('המדד הטכני-החלטתי נוטה לשחקנים הנמוכים בתפקיד (' + G.ltr('ρ=' + by.tdi.rho) + ') — הוא מתקן לכיוון ההפוך, וזו הטיה בפני עצמה שצריך לדעת.');
      if (by.minutes && !sig(by.minutes.ci)) parts.push('הדקות שמאמנים נתנו לא קשורות לגובה בתוך התפקיד (' + G.ltr('ρ=' + by.minutes.rho) + ').');
      el('heightNote').textContent = parts.join(' ') + ' ממוצע גובה לתפקיד: ' + hb.roleHeights.map(function (r) { return r.label + ' ' + r.meanCm + ' ס״מ'; }).join(' · ') + '.';
    }
    const all = G.computePlayers((state.data.rows || state.data));
    if (state.heights) G.attachHeights(all, state.heights);
    const rae = G.relativeAge(all);
    if (!rae.n) {
      el('raeKpis').innerHTML = '';
      el('raeNote').textContent = 'אין חודשי לידה בנתונים. בקובץ שלכם — הוסיפו עמודת birthMonth.';
      return;
    }
    const names = ['ינו׳–מרץ', 'אפר׳–יוני', 'יולי–ספט׳', 'אוק׳–דצמ׳'];
    el('raeKpis').innerHTML = rae.quarters.map(function (q, i) {
      return '<div class="kpi">' + names[i] + '<b>' + rae.sharePct[i] + '%</b><span class="muted">' + q + ' שחקנים</span></div>';
    }).join('');
    el('raeNote').textContent = rae.n + ' שחקנים עם חודש לידה ידוע. צפוי ~25% לכל רבעון; χ²=' + rae.chi2 + ' (3 דרגות חופש), p≈' + rae.p +
      '. ילידי ינואר–מרץ פי ' + rae.q1q4 + ' מילידי אוקטובר–דצמבר. זו ההטיה שנבנתה בגיל הנוער — כאן היא כבר בסגל המונדיאל. (ההשוואה ל-25% היא קירוב: לידות לא מתפלגות שווה לגמרי על פני השנה.)';
  }

  // ---- share ------------------------------------------------------------------
  function splitBar(pct) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return '<span class="split" role="img" aria-label="פיזי ' + p + '% , טכני ' + Math.round((100 - p) * 10) / 10 + '%"><span class="phys" style="width:' + p + '%"></span><span class="tech" style="width:' + (100 - p) + '%"></span></span>';
  }

  function renderShare() {
    const byRole = {};
    state.tournament90.forEach(function (p) { if (p.physicalShare != null) (byRole[p.role] = byRole[p.role] || []).push(p.physicalShare * 100); });
    el('roleShareTable').innerHTML = '<table><caption>חלק פיזי חציוני בדירוג, לפי תפקיד (90+ דקות)</caption><thead><tr><th scope="col">תפקיד</th><th scope="col">שחקנים</th><th scope="col">חציון</th><th scope="col">פיזי / טכני</th></tr></thead><tbody>' +
      Object.keys(G.ROLES).filter(function (r) { return byRole[r]; }).map(function (r) {
        const a = byRole[r].slice().sort(function (x, y) { return x - y; });
        const med = Math.round(a[Math.floor(a.length / 2)] * 10) / 10;
        return '<tr><th scope="row">' + esc(roleLabel(r)) + '</th><td class="num">' + a.length + '</td><td class="num">' + med + '%</td><td style="min-width:120px">' + splitBar(med) + '</td></tr>';
      }).join('') + '</tbody></table>';
    const players = state.tournament90.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    const prev = el('sharePlayer').value;
    el('sharePlayer').innerHTML = players.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' — ' + esc(p.team) + '</option>';
    }).join('');
    if (prev && players.some(function (p) { return p.id === prev; })) el('sharePlayer').value = prev;
    renderSharePlayer();
  }

  function renderSharePlayer() {
    const p = state.tournament90.find(function (x) { return x.id === el('sharePlayer').value; });
    if (!p) { el('shareCard').innerHTML = ''; return; }
    const b = G.breakdown(p);
    const top = b.items.filter(function (it) { return it.points > 0; }).sort(function (x, y) { return y.points - x.points; }).slice(0, 8);
    el('shareCard').innerHTML = '<p><strong>' + esc(p.name) + '</strong> (' + esc(p.team) + ', ' + esc(roleLabel(p.role)) + ', ' + Math.round(p.minutes) + ' דקות' + (p.heightCm ? ', ' + p.heightCm + ' ס״מ' : '') + ') — ' +
      '<strong>' + fmt(b.physicalShare) + '%</strong> מהדירוג הקונבנציונלי שלו פיזי (אחוזון ' + p.sharePct + ' בתפקיד). דירוג קונבנציונלי: אחוזון ' + p.convPct + '. מדד טכני-החלטתי: אחוזון ' + p.tdiPct + '.</p>' +
      splitBar(b.physicalShare) +
      '<div class="table-wrap"><table><caption>האירועים שתרמו הכי הרבה נקודות</caption><thead><tr><th scope="col">אירוע</th><th scope="col">סוג</th><th scope="col">כמות</th><th scope="col">% מהדירוג</th></tr></thead><tbody>' +
      top.map(function (it) {
        return '<tr><th scope="row">' + esc(it.label) + '</th><td>' + (it.kind === 'physical' ? 'פיזי' : 'טכני') + '</td><td class="num">' + it.count + '</td><td class="num">' + it.share + '%</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="bars">' + G.TDI_COMPONENTS.map(function (c) {
        const v = p.componentPct[c.id];
        return '<div class="bar"><span>' + esc(c.label) + '</span><span class="track" role="img" aria-label="' + esc(c.label) + ' אחוזון ' + v + '"><span class="fill" style="width:' + v + '%"></span></span><strong>' + v + '</strong></div>';
      }).join('') + '</div>';
  }

  // ---- gems -------------------------------------------------------------------
  function renderGems() {
    const role = el('gemRole').value;
    const rows = G.hiddenGems(G.buildTournament(state.data, { minMinutes: Number(el('gemMin').value) }))
      .filter(function (p) { return role === 'ALL' || p.role === role; });
    if (!rows.length) { el('gemTable').innerHTML = '<p>אין שחקנים שעומדים בכלל היהלום בסינון הזה.</p>'; return; }
    el('gemTable').innerHTML = '<table><caption>' + rows.length + ' יהלומים (ממוין לפי הפער בין המדד הטכני לדירוג הקונבנציונלי)</caption><thead><tr><th scope="col">שחקן</th><th scope="col">תפקיד</th><th scope="col">דקות</th><th scope="col">טכני-החלטתי</th><th scope="col">קונבנציונלי</th><th scope="col">פער</th><th scope="col">חלק פיזי</th><th scope="col">דקות (אחוזון)</th></tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr><th scope="row">' + esc(p.name) + '<br><span class="muted">' + esc(p.team) + '</span></th><td>' + esc(roleLabel(p.role)) + '</td><td class="num">' + Math.round(p.minutes) + '</td>' +
          '<td class="num"><strong>' + p.tdiPct + '</strong></td><td class="num">' + p.convPct + '</td><td class="num">+' + p.gap + '</td>' +
          '<td class="num">' + (p.physicalShare == null ? '—' : Math.round(p.physicalShare * 100) + '%') + '</td><td class="num">' + p.minutesPct + (p.minutesPct <= 50 ? ' ⬇' : '') + '</td></tr>';
      }).join('') + '</tbody></table><p class="muted">⬇ = גם בחצי התחתון של הדקות בתפקיד — פספוס כפול: של הדירוג ושל המאמן.</p>';
  }

  // ---- validation -----------------------------------------------------------
  function renderValidation() {
    if (!state.canValidate) {
      el('verdict').className = 'verdict mixed';
      el('verdict').textContent = 'אין עמודת teamMatchNo בקובץ — אי אפשר לפצל למשחקי אימון ומבחן, ולכן אין אימות. הדירוגים למעלה תיאוריים בלבד.';
      ['validationTable', 'deltaTable', 'reliabilityTable'].forEach(function (id) { el(id).innerHTML = ''; });
      el('gemTestLine').textContent = '';
      el('outcomeWhy').textContent = '';
      return;
    }
    const v = validation(el('splitSelect').value, el('outcomeSelect').value);
    el('outcomeWhy').textContent = v.outcomeWhy + ' ' + v.n + ' שחקנים במבחן (מתוך ' + v.nTrainPlayers + ' עם 90+ דקות אימון).';
    el('verdict').className = 'verdict ' + (v.signal ? 'found' : 'none');
    el('verdict').textContent = v.verdict;
    el('validationTable').innerHTML = '<table><caption>מנבאים (אימון) מול היעד (מבחן)</caption><thead><tr><th scope="col">מנבא</th><th scope="col">ρ</th><th scope="col">95% CI</th></tr></thead><tbody>' +
      v.predictors.map(function (p) {
        return '<tr class="' + (p.id === 'tdi' ? 'index-row' : '') + '"><th scope="row">' + esc(p.label) + (p.kind === 'baseline' ? ' <span class="muted">(קו בסיס)</span>' : '') + '</th>' +
          '<td class="num">' + fmt(p.rho) + '</td><td class="num">' + fmtCi(p.rhoCi) + '</td></tr>';
      }).join('') + '</tbody></table>';
    el('deltaTable').innerHTML = '<table><caption>יתרון המדד על כל קו בסיס (ρ מדד פחות ρ בסיס)</caption><thead><tr><th scope="col">מול</th><th scope="col">Δρ</th><th scope="col">95% CI</th><th scope="col">מובהק?</th><th scope="col">בכלל ההכרעה?</th></tr></thead><tbody>' +
      v.deltas.map(function (d) {
        return '<tr><th scope="row">' + esc(d.label) + '</th><td class="num">' + fmt(d.delta) + '</td><td class="num">' + fmtCi(d.ci) + '</td><td>' + (d.ci[0] != null && d.ci[0] > 0 ? 'כן' : 'לא') + '</td><td>' + (d.inVerdict ? 'כן' : 'לא') + '</td></tr>';
      }).join('') + '</tbody></table>';
    const g = v.gemTest;
    el('gemTestLine').textContent = 'יהלומים מול «מועדפי הדירוג» (דירוג קונבנציונלי באחוזון 70+ ומדד טכני 50-): ' + g.nGems + ' יהלומים ו-' + g.nFavourites + ' מועדפים במבחן. ממוצע היעד (z בתפקיד): ' + fmt(g.gemMean) + ' מול ' + fmt(g.favMean) +
      (g.ci[0] != null ? '; הפרש ' + G.ltr(g.diff) + ' ' + fmtCi(g.ci) + (sig(g.ci) ? ' — מובהק.' : ' — לא מובהק.') : ' — מעט מדי שחקנים כדי לחשב רווח סמך (צריך 5+ בכל קבוצה).');
    renderReliability();
  }

  function renderReliability() {
    const r = G.reliability(state.data, el('splitSelect').value);
    el('reliabilityTable').innerHTML = '<table><caption>חזרתיות — ' + esc(r.splitLabel) + ' (' + r.n + ' שחקנים)</caption><thead><tr><th scope="col">מדד</th><th scope="col">ρ אימון↔מבחן</th><th scope="col">95% CI</th></tr></thead><tbody>' +
      r.items.map(function (it) {
        return '<tr class="' + (it.id === 'tdi' ? 'index-row' : '') + '"><th scope="row">' + esc(it.label) + '</th><td class="num">' + fmt(it.rho) + '</td><td class="num">' + fmtCi(it.ci) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderHeadline(token) {
    if (!state.canValidate) {
      el('headline').className = 'verdict mixed';
      el('headline').textContent = 'הנתונים שלכם נטענו. בלי teamMatchNo אין אימות מוחזק — הפירוק, המדד והיהלומים תיאוריים בלבד.';
      return;
    }
    const keys = [];
    Object.keys(G.SPLITS).forEach(function (s) { Object.keys(G.OUTCOMES).forEach(function (o) { keys.push([s, o]); }); });
    const results = [];
    (function next(i) {
      if (token !== state.token) return;
      if (i < keys.length) { results.push(validation(keys[i][0], keys[i][1])); setTimeout(function () { next(i + 1); }, 0); return; }
      const found = results.filter(function (v) { return v.signal; }).length;
      if (results.every(function (v) { return v.n < 30; })) {
        el('headline').className = 'verdict mixed';
        el('headline').textContent = 'מעט מדי שחקנים עם דקות גם באימון וגם במבחן (' + Math.max.apply(null, results.map(function (v) { return v.n; })) + ' לכל היותר; צריך 30) — אין אימות. הפירוק, המדד והיהלומים תיאוריים בלבד.';
        return;
      }
      const convBeaten = results.filter(function (v) { return v.deltas.some(function (d) { return d.vs === 'conventional' && d.ci[0] > 0; }); }).length;
      const physBeaten = results.filter(function (v) { return v.deltas.some(function (d) { return d.vs === 'physical' && d.ci[0] > 0; }); }).length;
      const box = el('headline');
      box.className = 'verdict ' + (found ? 'found' : 'mixed');
      box.textContent = found
        ? 'נמצא אות ב-' + found + ' מתוך ' + results.length + ' מבחנים מוחזקים: המדד הטכני-החלטתי ניבא את היעד טוב יותר מהדירוג הקונבנציונלי ומהדקות. פרטים ורווחי סמך למטה.'
        : 'לא נמצא אות מלא: בכל ' + results.length + ' המבחנים המוחזקים (2 פיצולים × 3 יעדים) המדד הטכני-החלטתי לא ניבא טוב יותר גם מהדירוג הקונבנציונלי וגם מהדקות באופן מובהק. ' +
          'הוא כן עקף באופן מובהק את הנקודות הפיזיות לבדן ב-' + physBeaten + ' מתוך ' + results.length + ', ואת הדירוג הקונבנציונלי ב-' + convBeaten + ' מתוך ' + results.length + '. התוצאה מוצגת כמו שהיא.';
    }(0));
  }

  // ---- lifecycle ----------------------------------------------------------------
  function useDataset(data, heights, label, canValidate) {
    state.data = data;
    state.heights = heights;
    state.label = label;
    state.cache = {};
    state.canValidate = canValidate;
    state.token += 1;
    state.tournament90 = G.buildTournament(data, { minMinutes: 90 });
    if (heights) G.attachHeights(state.tournament90, heights);
    el('sourceTag').textContent = label;
    el('resetSource').hidden = data === state.base.matches;
    renderPremise();
    renderShare();
    renderGems();
    renderValidation();
    const token = state.token;
    setTimeout(function () { renderHeadline(token); }, 0);
  }

  function onCsv(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const parsed = G.parseCsv(String(reader.result || ''));
      if (!parsed.ok) { el('csvStatus').textContent = 'הקובץ לא נטען: ' + parsed.errors.join('; '); return; }
      const players = G.aggregatePlayers(parsed.rows).length;
      el('csvStatus').textContent = 'נטענו ' + parsed.rows.length + ' שורות, ' + players + ' שחקני שדה.' +
        (parsed.errors.length ? ' הערות: ' + parsed.errors.slice(0, 5).join('; ') + '.' : '') +
        (parsed.unknownColumns.length ? ' עמודות שלא זוהו (לא בשימוש): ' + parsed.unknownColumns.join(', ') + '.' : '') +
        (parsed.canValidate ? ' יש teamMatchNo — האימות רץ.' : ' אין teamMatchNo — אין אימות.');
      useDataset({ rows: parsed.rows }, null, 'הנתונים שלכם: ' + file.name, parsed.canValidate);
    };
    reader.readAsText(file);
  }

  function init(loaded) {
    state.base = loaded;
    renderStatic();
    el('splitSelect').addEventListener('change', renderValidation);
    el('outcomeSelect').addEventListener('change', renderValidation);
    el('gemRole').addEventListener('change', renderGems);
    el('gemMin').addEventListener('change', renderGems);
    el('sharePlayer').addEventListener('change', renderSharePlayer);
    el('csvFile').addEventListener('change', onCsv);
    el('resetSource').addEventListener('click', function () {
      el('csvFile').value = '';
      el('csvStatus').textContent = '';
      useDataset(state.base.matches, state.base.heights, 'מונדיאל 2018 (Open Data)', true);
    });
    useDataset(loaded.matches, loaded.heights, 'מונדיאל 2018 (Open Data)', true);
    const first = state.tournament90.find(function (p) { return /Finnbogason/.test(p.name); });
    if (first) { el('sharePlayer').value = first.id; renderSharePlayer(); }
  }

  G.loadData(function (path) { return fetch('../' + path); })
    .then(init)
    .catch(function (err) {
      el('headline').textContent = 'טעינת הנתונים נכשלה (' + err.message + '). פתחו את הדף דרך GitHub Pages או שרת סטטי.';
    });
}());
