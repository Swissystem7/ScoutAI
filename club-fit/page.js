(function () {
  'use strict';
  const C = window.ScoutAIClubFit;
  const CUSTOM = '__custom__';
  const TAG = { stable: 'יציב', partial: 'חלקי', noise: 'רעש' };
  const state = { data: null, model: null, custom: C.neutralZ(), stab: {}, userModel: null };

  function el(id) { return document.getElementById(id); }
  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(x) { return x == null ? '—' : String(x); }
  function fmtCi(ci) { return ci && ci[0] != null ? '[' + ci[0] + ', ' + ci[1] + ']' : '—'; }
  function sign(x) { return (x > 0 ? '+' : '') + x; }

  function teamStab(splitId) {
    const key = 'team|' + splitId;
    if (!state.stab[key]) state.stab[key] = C.teamStability(state.data, splitId);
    return state.stab[key];
  }
  function fitStab(splitId) {
    const key = 'fit|' + splitId;
    if (!state.stab[key]) state.stab[key] = C.fitStability(state.data, splitId);
    return state.stab[key];
  }
  function ownTeam(splitId) {
    const key = 'own|' + splitId;
    if (!state.stab[key]) state.stab[key] = C.ownTeamRecognition(state.data, splitId);
    return state.stab[key];
  }

  function selection() {
    const team = el('teamSelect').value;
    const isCustom = team === CUSTOM;
    return {
      isCustom: isCustom,
      team: isCustom ? null : team,
      z: isCustom ? state.custom : C.teamZ(state.model, team),
      role: el('roleSelect').value,
      minMinutes: Number(el('minSelect').value),
      excludeOwn: el('excludeOwn').checked
    };
  }

  function writeHash() {
    const s = selection();
    const parts = ['team=' + encodeURIComponent(s.isCustom ? 'custom' : s.team), 'role=' + s.role];
    if (s.isCustom) parts.push('z=' + C.DIM_IDS.map(function (d) { return state.custom[d]; }).join(','));
    try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) { /* ignore */ }
  }
  function readHash() {
    const h = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i > 0) h[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    return h;
  }

  function zBar(z) {
    const w = Math.min(50, Math.abs(z) / 2.5 * 50);
    const style = z >= 0 ? 'inset-inline-start:50%;width:' + w + '%' : 'inset-inline-start:' + (50 - w) + '%;width:' + w + '%';
    return '<div class="zbar" role="img" aria-label="z ' + z + '"><span class="' + (z < 0 ? 'neg' : '') + '" style="' + style + '"></span></div>';
  }

  function renderProfile() {
    const s = selection();
    const stab = teamStab('oddEven');
    const byDim = {};
    stab.dims.forEach(function (d) { byDim[d.id] = d; });
    const team = s.isCustom ? null : state.model.teams.find(function (t) { return t.team === s.team; });
    el('customBox').hidden = !s.isCustom;
    el('profileTable').innerHTML = '<table><caption>פרופיל סגנון — ' + esc(s.isCustom ? 'מותאם אישית' : s.team + ' (' + team.matches + ' משחקים)') + '</caption><thead><tr><th scope="col">ממד</th><th scope="col">ערך</th><th scope="col">z מול 32 נבחרות</th><th scope="col"></th><th scope="col">יציבות</th></tr></thead><tbody>' +
      C.STYLE_DIMS.map(function (d) {
        const z = s.z[d.id];
        const raw = s.isCustom ? C.rawFromZ(state.model.stats, d.id, z) : team.raw[d.id];
        const v = byDim[d.id];
        return '<tr><th scope="row">' + esc(d.label) + '</th><td class="num">' + esc(C.formatDimValue(d, raw)) + '</td><td class="num">' + sign(z) + '</td><td>' + zBar(z) + '</td>' +
          '<td><span class="tag ' + v.verdict + '">' + TAG[v.verdict] + '</span> <span class="muted" dir="ltr">ρ=' + v.rho + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderSliders() {
    el('sliders').innerHTML = C.STYLE_DIMS.map(function (d) {
      const z = state.custom[d.id];
      return '<div class="slider"><label for="z_' + d.id + '"><span>' + esc(d.label) + '</span><output id="o_' + d.id + '" for="z_' + d.id + '">' + sign(z) + ' (' + esc(C.formatDimValue(d, C.rawFromZ(state.model.stats, d.id, z))) + ')</output></label>' +
        '<input type="range" dir="ltr" id="z_' + d.id + '" data-dim="' + d.id + '" min="-2" max="2" step="0.1" value="' + z + '"></div>';
    }).join('');
    el('sliders').querySelectorAll('input[type=range]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const d = C.STYLE_DIMS.find(function (x) { return x.id === inp.dataset.dim; });
        state.custom[d.id] = Math.round(Number(inp.value) * 10) / 10;
        el('o_' + d.id).textContent = sign(state.custom[d.id]) + ' (' + C.formatDimValue(d, C.rawFromZ(state.model.stats, d.id, state.custom[d.id])) + ')';
        renderAll();
      });
    });
  }

  function renderWeights(list) {
    el('weightsTable').innerHTML = '<table><caption>משקלות לעמדה «' + esc(C.ROLES[list.role].label) + '»</caption><thead><tr><th scope="col">פעולה</th><th scope="col">בסיס</th><th scope="col">אצל הפרופיל</th><th scope="col">מה הזיז</th></tr></thead><tbody>' +
      list.weights.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (w) {
        const moved = w.drivers.filter(function (d) { return Math.abs(d.delta) >= 0.05; }).map(function (d) {
          const dim = C.STYLE_DIMS.find(function (x) { return x.id === d.dim; });
          return esc(dim.short) + ' ' + sign(Math.round(d.delta * 100) / 100);
        }).join(', ');
        const cls = Math.abs(w.weight - w.base) >= 0.3 ? 'hl' : '';
        return '<tr class="' + cls + '"><th scope="row">' + esc(C.METRICS[w.metric].label) + '</th><td class="num">' + w.base + '</td><td class="num">' + w.weight + '</td><td class="muted">' + (moved || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function shiftTag(row) {
    if (!row.rankShift) return '<span class="shift">= כמו ניטרלי</span>';
    return '<span class="shift ' + (row.rankShift > 0 ? 'up' : 'down') + '">' + (row.rankShift > 0 ? '↑ ' : '↓ ') + Math.abs(row.rankShift) + ' מול ניטרלי</span>';
  }

  function playerCard(row, miss) {
    const reasons = row.reasons.length
      ? row.reasons.map(function (r) { return '<li>' + esc(r.text) + '</li>'; }).join('')
      : '<li>אין רכיב מעל החציון בעמדה.</li>';
    return '<li class="player' + (miss ? ' miss' : '') + '"><h3><span>' + row.rank + '. ' + esc(row.name) + '</span><span class="muted">' + esc(row.team) + ' · ' + esc(row.position) + ' · ' + row.minutes + ' דק׳ ב-' + row.matches + ' משחקים</span>' +
      '<strong class="fit" dir="ltr">' + row.fit + '</strong></h3>' + shiftTag(row) +
      (miss ? '<p><strong>למה לא:</strong> ' + esc(row.whyNot) + '</p>' : '') +
      '<ul>' + reasons + '</ul></li>';
  }

  function renderShortlist() {
    const s = selection();
    const list = C.shortlist(state.model, s.z, s.role, {
      minMinutes: s.minMinutes, top: 10, nearMiss: 5,
      excludeTeam: s.excludeOwn ? s.team : null, teamName: s.isCustom ? 'הפרופיל המותאם' : s.team
    });
    renderWeights(list);
    el('shortlistMeta').textContent = list.n + ' שחקנים בעמדה «' + list.roleLabel + '» עם ' + s.minMinutes + '+ דקות' +
      (s.excludeOwn && s.team ? ' (בלי שחקני ' + s.team + ')' : '') + '. ρ בין הדירוג הזה לדירוג העמדה הניטרלי: ' + fmt(list.rhoVsNeutral) +
      ' — ככל שקרוב ל-1, הקבוצה משנה פחות את הרשימה.';
    el('shortlistList').innerHTML = list.shortlist.map(function (r) { return playerCard(r, false); }).join('') || '<li>אין שחקנים שעומדים בסף.</li>';
    el('nearList').innerHTML = list.nearMisses.map(function (r) { return playerCard(r, true); }).join('') || '<li class="muted">אין.</li>';
  }

  function renderValidation() {
    const splitId = el('splitSelect').value;
    const ts = teamStab(splitId);
    el('teamStabTable').innerHTML = '<table><caption>יציבות פרופיל — ' + esc(ts.splitLabel) + ' (' + ts.nTeams + ' נבחרות)</caption><thead><tr><th scope="col">ממד</th><th scope="col">ρ חצי↔חצי</th><th scope="col">95% CI</th><th scope="col">הכרעה</th></tr></thead><tbody>' +
      ts.dims.map(function (d) {
        return '<tr><th scope="row">' + esc(d.label) + '</th><td class="num">' + fmt(d.rho) + '</td><td class="num">' + fmtCi(d.ci) + '</td><td><span class="tag ' + d.verdict + '">' + TAG[d.verdict] + '</span></td></tr>';
      }).join('') + '</tbody></table>';
    el('fingerprint').textContent = 'טביעת אצבע: לכל נבחרת, הפרופיל מהחצי השני הכי קרוב לפרופיל שלה מהחצי הראשון ב-' + ts.fingerprintHits + ' מתוך ' + ts.nTeams +
      ' נבחרות (במקרה: ' + ts.fingerprintExpectedByChance + '). כל תשעת הממדים יחד עדיין לא «מזהים» קבוצה באופן אמין מ-1–4 משחקים.';

    const fs = fitStab(splitId);
    const box = el('fitVerdict');
    box.className = 'verdict ' + (fs.fitVerdict === 'stable' ? 'found' : fs.fitVerdict === 'partial' ? 'partial' : 'none');
    box.textContent = fs.verdict;
    el('fitStabTable').innerHTML = '<table><caption>ρ בין חצאי המשחקים (' + fs.n + ' שחקנים)</caption><thead><tr><th scope="col">מה נמדד</th><th scope="col">ρ</th><th scope="col">95% CI</th></tr></thead><tbody>' +
      fs.items.map(function (it) {
        return '<tr class="' + (it.kind === 'fit' ? 'hl' : '') + '"><th scope="row">' + esc(it.label) + (it.kind === 'baseline' ? ' <span class="muted">(קו בסיס)</span>' : '') + '</th><td class="num">' + fmt(it.rho) + '</td><td class="num">' + fmtCi(it.ci) + '</td></tr>';
      }).join('') + '</tbody></table>';

    const ot = ownTeam(splitId);
    const ob = el('ownTeam');
    ob.className = 'verdict ' + (ot.signal ? 'found' : 'none');
    ob.textContent = (ot.signal ? 'נמצא אות: ' : 'לא נמצא אות: ') + 'הקבוצה של השחקן נמצאת בממוצע באחוזון ' + ot.meanPct + ' ' + fmtCi(ot.ci) +
      ' בין 32 הקבוצות (במקרה: 50), על ' + ot.n + ' שחקנים מ-' + ot.nTeams + ' נבחרות. ' +
      (ot.signal ? '' : 'כלומר: עם 1–4 משחקים לפרופיל, המודל לא מזהה ששחקנים «מתאימים» למערכת שלהם יותר מאשר לאחרות.');
  }

  function renderDiversity() {
    el('diversityTable').innerHTML = '<table><caption>לכל עמדה: הדמיון בין הרשימות של כל זוג קבוצות (180+ דקות)</caption><thead><tr><th scope="col">עמדה</th><th scope="col">שחקנים</th><th scope="col">ρ ממוצע בין רשימות</th><th scope="col">חפיפה ממוצעת בעשירייה</th></tr></thead><tbody>' +
      C.ROLE_IDS.map(function (r) {
        const d = C.listDiversity(state.model, r);
        return '<tr><th scope="row">' + esc(C.ROLES[r].label) + '</th><td class="num">' + d.n + '</td><td class="num">' + fmt(d.meanRho) + '</td><td class="num">' + fmt(d.meanTop10Overlap) + ' / 10</td></tr>';
      }).join('') + '</tbody></table><p class="muted">ρ גבוה = הקבוצה משנה את הסדר רק בשוליים; חפיפה 6 מתוך 10 = ארבעה שמות בעשירייה מתחלפים כשמחליפים קבוצה.</p>';
  }

  function renderHeadline() {
    const ts = teamStab('oddEven');
    const fs = fitStab('oddEven');
    const ot = ownTeam('oddEven');
    const stable = ts.dims.filter(function (d) { return d.verdict === 'stable'; }).map(function (d) { return d.label; });
    const noise = ts.dims.filter(function (d) { return d.verdict === 'noise'; }).map(function (d) { return d.label; });
    const box = el('headline');
    box.className = 'verdict ' + (fs.specificSignal && !ot.signal ? 'partial' : fs.specificSignal ? 'found' : 'none');
    box.textContent = 'תוצאת האימות (חצי-מדגם): ' + stable.length + ' מתוך ' + ts.dims.length + ' ממדי סגנון יציבים (' + stable.join(', ') + '); ' +
      noise.length + ' הם רעש (' + noise.join(', ') + '). ציון ההתאמה של שחקן חוזר חלקית (ρ=' + fs.items[0].rho + ')' +
      (fs.specificSignal ? ', והחלק הייחודי לקבוצה חוזר (ρ=' + fs.items[1].rho + ' ' + fmtCi(fs.items[1].ci) + ')' : ', והחלק הייחודי לקבוצה לא עובר את הרף') +
      '. בדיקת השפיות (שחקן מתאים לקבוצה שלו) — ' + (ot.signal ? 'עברה' : 'לא עברה') + '. זה כלי לסינון ראשוני עם סיבות שקופות — לא ניבוי הצלחה.';
  }

  function renderUser() {
    if (!state.userModel) return;
    const s = selection();
    const list = C.shortlist(state.userModel, s.z, s.role, { minMinutes: 0, top: 10, nearMiss: 3, teamName: s.isCustom ? 'הפרופיל המותאם' : s.team });
    const prov = state.userModel.provenance;
    el('byodStatus').textContent = (prov === C.USER_PROVENANCE ? 'USER_LICENSED_DATA — ' : 'נראה כמו Open Data — לימוד/מחקר בלבד. ') +
      state.userModel.players.length + ' שחקני שדה, ' + state.userModel.metrics.length + ' עמודות פעולה. בעמדה «' + list.roleLabel + '»: ' + list.n + ' שחקנים.' +
      (state.userErrors && state.userErrors.length ? ' הערות: ' + state.userErrors.slice(0, 3).join(' · ') : '');
    el('byodList').innerHTML = list.shortlist.map(function (r) { return playerCard(r, false); }).join('') +
      list.nearMisses.map(function (r) { return playerCard(r, true); }).join('') || '<li class="muted">אין שחקנים בעמדה הזו בקובץ.</li>';
  }

  function loadUserCsv(text) {
    const parsed = C.parseUserCsv(text);
    if (!parsed.ok) {
      state.userModel = null;
      el('byodList').innerHTML = '';
      el('byodStatus').textContent = 'הקובץ לא נטען: ' + parsed.errors.join(' · ');
      return;
    }
    state.userErrors = parsed.errors;
    state.userModel = C.buildUserModel(parsed, state.model.teams, state.model.stats, state.data.playerMatches);
    renderUser();
  }

  function renderAll() {
    renderProfile();
    renderShortlist();
    renderUser();
    writeHash();
  }

  function init(data) {
    state.data = data;
    state.model = C.buildModel(data);
    el('teamSelect').innerHTML = state.model.teams.map(function (t) {
      return '<option value="' + esc(t.team) + '">' + esc(t.team) + '</option>';
    }).join('') + '<option value="' + CUSTOM + '">פרופיל מותאם אישית (סליידרים)</option>';
    el('roleSelect').innerHTML = C.ROLE_IDS.map(function (r) {
      return '<option value="' + r + '">' + esc(C.ROLES[r].label) + '</option>';
    }).join('');
    el('splitSelect').innerHTML = Object.keys(C.SPLITS).map(function (id) {
      return '<option value="' + id + '">' + esc(C.SPLITS[id].label) + '</option>';
    }).join('');
    el('csvFields').textContent = C.METRIC_IDS.map(function (k) { return C.METRICS[k].fields; }).join(', ');
    el('dimList').innerHTML = C.STYLE_DIMS.map(function (d) {
      return '<li><strong>' + esc(d.label) + '</strong> — ' + esc(d.definition) + '<br><span class="muted">שדות: <code dir="ltr">' + esc(d.fields) + '</code></span></li>';
    }).join('');

    const h = readHash();
    el('teamSelect').value = 'Spain';
    el('roleSelect').value = 'ST';
    if (h.team === 'custom') {
      el('teamSelect').value = CUSTOM;
      if (h.z) h.z.split(',').forEach(function (v, i) {
        const n = Number(v);
        if (C.DIM_IDS[i] && Number.isFinite(n)) state.custom[C.DIM_IDS[i]] = Math.max(-2, Math.min(2, n));
      });
    } else if (h.team && state.model.teams.some(function (t) { return t.team === h.team; })) {
      el('teamSelect').value = h.team;
    }
    if (h.role && C.ROLES[h.role]) el('roleSelect').value = h.role;
    state.lastTeam = el('teamSelect').value === CUSTOM ? 'Spain' : el('teamSelect').value;
    el('copyName').textContent = state.lastTeam;
    renderSliders();
    renderAll();

    el('teamSelect').addEventListener('change', function () {
      if (el('teamSelect').value !== CUSTOM) { state.lastTeam = el('teamSelect').value; el('copyName').textContent = state.lastTeam; }
      renderAll();
    });
    el('roleSelect').addEventListener('change', renderAll);
    el('minSelect').addEventListener('change', renderAll);
    el('excludeOwn').addEventListener('change', renderAll);
    el('copyFrom').addEventListener('click', function () {
      const z = C.teamZ(state.model, state.lastTeam);
      C.DIM_IDS.forEach(function (d) { state.custom[d] = Math.max(-2, Math.min(2, Math.round(z[d] * 10) / 10)); });
      renderSliders(); renderAll();
    });
    el('resetSliders').addEventListener('click', function () {
      state.custom = C.neutralZ(); renderSliders(); renderAll();
    });
    el('csvFile').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () { loadUserCsv(String(reader.result || '')); };
      reader.readAsText(f);
    });
    el('loadExample').addEventListener('click', function () { loadUserCsv(C.EXAMPLE_CSV); });
    el('splitSelect').addEventListener('change', renderValidation);

    setTimeout(function () {
      renderValidation();
      renderProfile();
      renderDiversity();
      renderHeadline();
    }, 0);
  }

  C.loadData(function (path) { return fetch('../' + path); })
    .then(init)
    .catch(function (err) {
      el('headline').textContent = 'טעינת הנתונים נכשלה (' + err.message + '). פתחו את הדף דרך GitHub Pages או שרת סטטי.';
    });
}());
