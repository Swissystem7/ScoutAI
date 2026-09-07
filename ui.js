(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIUi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deltaCell(value) {
    if (value == null || value === 0) return '<span class="muted">0</span>';
    const cls = value > 0 ? 'up' : 'down';
    const sign = value > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + escapeHtml(value) + '</span>';
  }

  function renderOptions(options) {
    return (options || []).map(function (opt) {
      return '<option value="' + escapeHtml(opt.value) + '">' + escapeHtml(opt.label) + '</option>';
    }).join('');
  }

  function quizMarkup(lesson, current, courseQuiz) {
    const quizTable = courseQuiz || {};
    const entry = quizTable[lesson && lesson.id];
    if (!entry) {
      return '<p class="muted">התרגיל חי במעבדת הבלמים למעלה — הזיזו משקלות עד שהבדיקה ירוקה.</p>';
    }
    const selected = current && current.selected;
    const explorer = current && current.explorer;
    const fields = entry.fields || [];
    if (!fields.length) {
      return '<p class="muted">' + escapeHtml(entry.emptyMessage ||
        'התרגיל חי במעבדת הבלמים למעלה — הזיזו משקלות עד שהבדיקה ירוקה.') + '</p>';
    }
    return fields.map(function (field) {
      if (field.kind === 'number') {
        const press = selected && selected.counts ? (selected.counts.pressures || 0) : '—';
        const mins = selected ? (selected.minutes || 0) : '—';
        const who = selected ? selected.name : 'השחקן הנבחר';
        const label = String(field.label || '')
          .replace('{who}', who)
          .replace('{press}', String(press))
          .replace('{mins}', String(mins));
        return '<label for="' + escapeHtml(field.controlId) + '">' + escapeHtml(label) + '</label>' +
          '<input id="' + escapeHtml(field.controlId) + '" type="number" step="0.01" inputmode="decimal" placeholder="' +
          escapeHtml(field.placeholder || '') + '">';
      }
      let options = (field.options || []).slice();
      if (field.dynamicCaps) {
        const capped = (explorer && explorer.capped) || [];
        const used = ((explorer && explorer.rows) || []).filter(function (row) { return row.usedInScore; });
        const seen = {};
        const dynamic = [];
        capped.forEach(function (row) {
          seen[row.key] = true;
          dynamic.push({ value: row.key, label: row.label + ' (' + row.key + ')' });
        });
        used.forEach(function (row) {
          if (seen[row.key]) return;
          if (dynamic.length >= 6) return;
          seen[row.key] = true;
          dynamic.push({ value: row.key, label: row.label + ' (' + row.key + ')' });
        });
        // Keep blank first, then dynamic keys, then static non-blank options (e.g. none).
        const blank = options.filter(function (opt) { return opt.value === ''; });
        const rest = options.filter(function (opt) { return opt.value !== ''; });
        options = blank.concat(dynamic).concat(rest);
      }
      const who = selected ? selected.name : 'השחקן הנבחר';
      const label = String(field.label || '').replace('{who}', who);
      return '<label for="' + escapeHtml(field.controlId) + '">' + escapeHtml(label) + '</label>' +
        '<select id="' + escapeHtml(field.controlId) + '">' + renderOptions(options) + '</select>';
    }).join('');
  }

  function quizControlMap(courseQuiz) {
    const map = {};
    const table = courseQuiz || {};
    Object.keys(table).forEach(function (lessonId) {
      const fields = table[lessonId].fields || [];
      fields.forEach(function (field) {
        if (field.controlId && field.key) map[field.controlId] = field.key;
      });
    });
    return map;
  }

  return {
    escapeHtml: escapeHtml,
    deltaCell: deltaCell,
    quizMarkup: quizMarkup,
    quizControlMap: quizControlMap
  };
}));
