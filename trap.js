(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAITrap = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, lo, hi) {
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function mean(values) {
    const nums = (values || []).filter(function (n) { return Number.isFinite(Number(n)); });
    if (!nums.length) return 0;
    return nums.reduce(function (sum, n) { return sum + Number(n); }, 0) / nums.length;
  }

  const SANDBOX_PLAYERS = Object.freeze([
    Object.freeze({ id: 'hold', name: 'קשר מחזיק', team: 'קבוצה א׳', position: 'MF', statScore: 44, note: 'נפח הגנה גבוה, תיבה כמעט ריקה' }),
    Object.freeze({ id: 'flash', name: 'כנף מבריקה', team: 'קבוצה ב׳', position: 'FW', statScore: 86, note: 'xG ומסירות מפתח — הסטטיסטיקה אוהבת' }),
    Object.freeze({ id: 'box', name: 'חלוץ רחבה', team: 'קבוצה ג׳', position: 'FW', statScore: 79, note: 'נגיעות ברחבה ובעיטות למסגרת' }),
    Object.freeze({ id: 'cb', name: 'בלם ראשון', team: 'קבוצה א׳', position: 'DF', statScore: 51, note: 'תיקולים וחטיפות, מעט יצירה' }),
    Object.freeze({ id: 'am', name: 'קשר התקפי', team: 'קבוצה ד׳', position: 'MF', statScore: 72, note: 'התקדמות ומסירות מפתח' }),
    Object.freeze({ id: 'fb', name: 'מגן מתפרץ', team: 'קבוצה ב׳', position: 'DF', statScore: 58, note: 'חפיפה קדימה + הגנה בינונית' }),
    Object.freeze({ id: 'st2', name: 'חלוץ מחליף', team: 'קבוצה ה׳', position: 'FW', statScore: 39, note: 'דקות מעטות, סטט חלש במדגם' }),
    Object.freeze({ id: 'dm', name: 'קשר קצב', team: 'קבוצה ו׳', position: 'MF', statScore: 47, note: 'לחיצות רבות, מעט סיום' })
  ]);

  const DEFAULT_INVENTED_NAME = 'פיצ\'ר מומצא';

  const ATTIC_SOURCE = Object.freeze({
    path: 'attic/proof-demo.js',
    review: 'הביקורת העצמאית כינתה את זה פסאודו-מדע מעגלי. הסקריפט הועבר ל-attic/ ואינו ראיה מדעית.',
    assertion: 'grinders.every((g) => g.upside.index > control.upside.index)',
    originalClaimHe: 'הגריינדרים (Kanté/Vardy, סטט נמוך) מדורגים מעל ה-Flashy Winger (סטט גבוה). המנוע מצא את מה שהסטטיסטיקה החמיצה.',
    disclaimerHe: 'הערכים בארכיון הוקלדו ביד אחרי שנבחרה המסקנה. הם אינם מדידת פנים, אינם נתוני אירוע, ואינם מחושבים בדף הזה.'
  });

  const ATTIC_ARCHIVED_FEATURES = Object.freeze({
    kante: Object.freeze({
      jawSquareness: 0.85,
      chinProjection: 0.8,
      foreheadHeight: 0.6,
      eyeSize: 0.7,
      browDensity: 0.55,
      faceAspect: 0.35
    }),
    vardy: Object.freeze({
      jawSquareness: 0.8,
      chinProjection: 0.85,
      noseBridgeConvex: 0.7,
      eyeProtrusion: 0.7,
      foreheadLines: 0.65,
      faceAspect: 0.6
    }),
    flashy: Object.freeze({
      jawSquareness: 0.35,
      chinProjection: 0.3,
      browTilt: 0.8,
      lipFullness: 0.7,
      foreheadLines: 0.3
    })
  });

  function archivedHandFedScore(featureMap) {
    return round1(100 * mean(Object.keys(featureMap || {}).map(function (key) {
      return featureMap[key];
    })));
  }

  const ATTIC_PLAYERS = Object.freeze([
    Object.freeze({
      id: 'kante',
      name: "N'Golo Kanté",
      role: 'grinder',
      statScore: 42,
      momentumRaw: 88,
      story: 'בארכיון: סיפור מתועד של מנוע ומאמץ — לא מדידת פנים.',
      archivedFeatures: ATTIC_ARCHIVED_FEATURES.kante,
      archivedInvented: archivedHandFedScore(ATTIC_ARCHIVED_FEATURES.kante)
    }),
    Object.freeze({
      id: 'vardy',
      name: 'Jamie Vardy',
      role: 'grinder',
      statScore: 38,
      momentumRaw: 82,
      story: 'בארכיון: ליגה נמוכה בלי עקבות סטט — לא מדידת פנים.',
      archivedFeatures: ATTIC_ARCHIVED_FEATURES.vardy,
      archivedInvented: archivedHandFedScore(ATTIC_ARCHIVED_FEATURES.vardy)
    }),
    Object.freeze({
      id: 'flashy',
      name: 'Flashy Winger (control)',
      role: 'control',
      statScore: 84,
      momentumRaw: 25,
      story: 'בארכיון: ביקורת עם סטט גבוה — הוקלדו לו ערכים נמוכים בפיצ\'ר המומצא.',
      archivedFeatures: ATTIC_ARCHIVED_FEATURES.flashy,
      archivedInvented: archivedHandFedScore(ATTIC_ARCHIVED_FEATURES.flashy)
    })
  ]);

  const WALKTHROUGH_STEPS = Object.freeze([
    Object.freeze({
      id: 'conclusion-first',
      title: '1. קודם בוחרים מסקנה',
      body: 'ב-attic/proof-demo.js המסקנה נבחרה לפני הפיצ\'ר: קאנטה ווארדי חייבים לנצח את «כנף מבריקה» עם סטט 84. זו לא השערת מחקר — זו תוצאה שהוחלט עליה מראש.'
    }),
    Object.freeze({
      id: 'stats-contradict',
      title: '2. הסטטיסטיקה סותרת את המסקנה',
      body: 'סטט בלבד: כנף מבריקה 84, קאנטה 42, וארדי 38. בלי פיצ\'ר מומצא המסקנה נכשלת. זה הרגע שבו מדד ישר אומר «ההשערה נפלה» — או שבו ממציאים רכיב חדש.'
    }),
    Object.freeze({
      id: 'invent-feature',
      title: '3. ממציאים פיצ\'ר שמצדיק אותה',
      body: 'בארכיון קראו לרכיב «פרופיל אנרגיית פנים»: ריבוע לסת, בליטת סנטר, ועוד שדות. לא מדדו פנים. הקלידו מספרים גבוהים למועדפים ונמוכים לביקורת. הדף הזה לא מחשב פנים — הוא רק מציג את מה שהוקלד.'
    }),
    Object.freeze({
      id: 'tune-until-true',
      title: '4. מכוונים עד שהמסקנה מופיעה',
      body: 'הזיזו את ערכי הפיצ\'ר ואת המשקל. כשהמספרים «הנכונים» מספיק גבוהים אצל הגריינדרים, הדירוג מתהפך. זו לא תגלית — זו כיוונון.'
    }),
    Object.freeze({
      id: 'write-proof',
      title: '5. כותבים בדיקת «הוכחה» על אותו מדגם',
      body: 'הסקריפט בדק: האם כל גריינדר מעל הביקורת? ואז הדפיס «עבר». אותם שחקנים, אותם מספרים שהוקלדו כדי לייצר את המעבר. האימות הוא המסקנה בתחפושת.'
    }),
    Object.freeze({
      id: 'why-nothing',
      title: '6. למה זה לא הוכיח כלום',
      body: 'הפיצ\'ר נבחר אחרי המסקנה. הערכים הוקלדו ביד. הנוסחה גם תגמלה סטט נמוך כ«פוטנציאל נסתר». לא היה מדגם החזקה, לא משקלות רשומות מראש, לא חיזוי עונה הבאה. מעגל סגור.'
    })
  ]);

  const FALSIFICATION_ITEMS = Object.freeze([
    Object.freeze({
      id: 'outOfSample',
      label: 'מדגם החזקה',
      question: 'האם המדד נבדק מחוץ למדגם ששימש לבנייה?',
      why: 'אם אותם שחקנים משמשים גם לכיול וגם ל«הוכחה», ההצלחה מובטחת מראש.'
    }),
    Object.freeze({
      id: 'preregistered',
      label: 'משקלות רשומות מראש',
      question: 'האם המשקלות נרשמו לפני שראיתם דירוג?',
      why: 'סליידר אחרי שרואים מי עלה הוא כיול למסקנה, לא מדידה.'
    }),
    Object.freeze({
      id: 'nextSeason',
      label: 'חיזוי עונה הבאה',
      question: 'האם המדד חוזה את העונה הבאה — לא רק מסביר את זו שכבר ראיתם?',
      why: 'מדד שרק מסדר מחדש את העבר בלי תחזית ניתנת להפרכה הוא סיפור, לא מודל.'
    }),
    Object.freeze({
      id: 'featureTiming',
      label: 'תזמון הפיצ\'ר',
      question: 'האם הפיצ\'ר נבחר לפני שראיתם מי «צריך» לנצח?',
      why: 'פיצ\'ר שנולד אחרי המסקנה הוא צידוק, לא גילוי.'
    }),
    Object.freeze({
      id: 'independentMeasure',
      label: 'מדידה בלתי תלויה',
      question: 'האם ערכי הפיצ\'ר נמדדו ממקור שלא יודע את המסקנה?',
      why: 'מספר שהוקלד ביד אחרי שבוחרים מנצח אינו תצפית.'
    }),
    Object.freeze({
      id: 'controlUntouched',
      label: 'ביקורת לא מכווננת',
      question: 'האם יש שחקן ביקורת שלא כוונו לו ערכים כדי להפסיד?',
      why: 'בארכיון לכנף המבריקה הוקלדו ערכים נמוכים בכוונה. בלי ביקורת חסינה אין הפרכה.'
    })
  ]);

  function defaultValues(players, fill) {
    const values = {};
    (players || []).forEach(function (player) {
      values[player.id] = fill == null ? 50 : clamp(fill, 0, 100);
    });
    return values;
  }

  function normalizeInventedSpec(spec, players) {
    const roster = players && players.length ? players : SANDBOX_PLAYERS;
    const src = spec || {};
    const values = defaultValues(roster, 50);
    const incoming = src.values && typeof src.values === 'object' ? src.values : {};
    roster.forEach(function (player) {
      if (incoming[player.id] != null) values[player.id] = round1(clamp(incoming[player.id], 0, 100));
    });
    return {
      name: String(src.name == null || src.name === '' ? DEFAULT_INVENTED_NAME : src.name).slice(0, 80),
      weight: round1(clamp(src.weight, 0, 100)),
      values: values,
      mode: src.mode === 'atticUpside' ? 'atticUpside' : 'linear'
    };
  }

  function inventedOf(player, spec) {
    const raw = spec && spec.values ? spec.values[player.id] : null;
    if (Number.isFinite(Number(raw))) return round1(clamp(raw, 0, 100));
    if (Number.isFinite(Number(player.archivedInvented))) return round1(player.archivedInvented);
    return 50;
  }

  function linearScore(player, spec) {
    const metric = normalizeInventedSpec(spec, [player]);
    const w = metric.weight / 100;
    const invented = inventedOf(player, metric);
    return round1((1 - w) * Number(player.statScore) + w * invented);
  }

  function atticStyleUpside(player, spec) {
    const invented = inventedOf(player, spec);
    const momentum = Number.isFinite(Number(player.momentumRaw)) ? Number(player.momentumRaw) : invented;
    const underval = 100 - Number(player.statScore);
    const signal = 0.55 * invented + 0.45 * momentum;
    return Math.round(100 * Math.sqrt((signal / 100) * (underval / 100)));
  }

  function playerScore(player, spec) {
    const metric = normalizeInventedSpec(spec, [player]);
    if (metric.mode === 'atticUpside') return atticStyleUpside(player, metric);
    return linearScore(player, metric);
  }

  function rankRoster(players, spec) {
    const roster = (players || []).slice();
    const metric = normalizeInventedSpec(spec, roster);
    return roster
      .map(function (player) {
        const invented = inventedOf(player, metric);
        return {
          id: player.id,
          name: player.name,
          team: player.team || '',
          position: player.position || '',
          role: player.role || '',
          note: player.note || player.story || '',
          statScore: Number(player.statScore),
          invented: invented,
          score: playerScore(player, metric)
        };
      })
      .sort(function (a, b) {
        const delta = b.score - a.score;
        if (delta !== 0) return delta;
        return String(a.name).localeCompare(String(b.name), 'he');
      })
      .map(function (row, index) {
        return Object.assign({}, row, { rank: index + 1 });
      });
  }

  function attachDeltas(current, baseline) {
    const byId = {};
    (baseline || []).forEach(function (row) { byId[row.id] = row; });
    return (current || []).map(function (row) {
      const prev = byId[row.id];
      return Object.assign({}, row, {
        deltaRank: prev ? prev.rank - row.rank : 0,
        deltaScore: prev ? round1(row.score - prev.score) : 0,
        baselineRank: prev ? prev.rank : null,
        baselineScore: prev ? prev.score : null
      });
    });
  }

  function rankingSwings(rows) {
    return (rows || [])
      .filter(function (row) { return row.deltaRank; })
      .slice()
      .sort(function (a, b) { return Math.abs(b.deltaRank) - Math.abs(a.deltaRank); });
  }

  function deriveRanking(players, spec) {
    const roster = players || SANDBOX_PLAYERS;
    const metric = normalizeInventedSpec(spec, roster);
    const baseline = rankRoster(roster, { name: metric.name, weight: 0, values: metric.values, mode: 'linear' });
    const current = attachDeltas(rankRoster(roster, metric), baseline);
    return {
      spec: metric,
      formula: formatInventedFormula(metric),
      baseline: baseline,
      rows: current,
      swings: rankingSwings(current),
      leader: current[0] || null,
      baselineLeader: baseline[0] || null
    };
  }

  function formatInventedFormula(spec) {
    const metric = normalizeInventedSpec(spec, SANDBOX_PLAYERS);
    if (metric.mode === 'atticUpside') {
      return 'שחזור רעיוני (לא המנוע הישן): 100 × √(אות × (100−סטט)/10000), אות = 0.55×פיצ\'ר + 0.45×מומנטום';
    }
    return 'ציון = (1 − ' + metric.weight + '/100)×סטט + (' + metric.weight + '/100)×«' + metric.name + '»';
  }

  function archivedAtticSpec(options) {
    const extra = options || {};
    const values = {};
    ATTIC_PLAYERS.forEach(function (player) {
      values[player.id] = player.archivedInvented;
    });
    return normalizeInventedSpec({
      name: extra.name || 'ממוצע המספרים שהוקלדו בארכיון',
      weight: extra.weight == null ? 80 : extra.weight,
      values: values,
      mode: extra.mode || 'linear'
    }, ATTIC_PLAYERS);
  }

  function atticConclusionHolds(rows) {
    const control = (rows || []).find(function (row) { return row.role === 'control' || /control/i.test(row.name); });
    const grinders = (rows || []).filter(function (row) { return row.role === 'grinder'; });
    if (!control || grinders.length < 2) return false;
    return grinders.every(function (row) { return row.score > control.score; });
  }

  function evaluateAtticWalkthrough(spec) {
    const metric = normalizeInventedSpec(spec, ATTIC_PLAYERS);
    const view = deriveRanking(ATTIC_PLAYERS, metric);
    const holds = atticConclusionHolds(view.rows);
    const usedArchive = ATTIC_PLAYERS.every(function (player) {
      return Math.abs(inventedOf(player, metric) - player.archivedInvented) <= 1;
    });
    return {
      spec: metric,
      rows: view.rows,
      swings: view.swings,
      formula: view.formula,
      holds: holds,
      usedArchive: usedArchive,
      circular: holds && (usedArchive || metric.weight >= 50),
      assertion: ATTIC_SOURCE.assertion,
      proofLine: holds
        ? 'תוצאת ההוכחה: עבר — הגריינדרים מעל הביקורת. זה אותו תנאי כמו בארכיון, על מספרים שכוונו כדי לקיים אותו.'
        : 'תוצאת ההוכחה: נכשל — הסטטיסטיקה עדיין מדרגת את הביקורת מעל הגריינדרים. המסקנה טרם «הופיעה».'
    };
  }

  function valuesDifferFromNeutral(spec, players, neutral) {
    const metric = normalizeInventedSpec(spec, players);
    const fill = neutral == null ? 50 : neutral;
    return (players || []).some(function (player) {
      return Math.abs(metric.values[player.id] - fill) > 0.05;
    });
  }

  function inferBuilderContext(spec, meta) {
    const roster = (meta && meta.players) || SANDBOX_PLAYERS;
    const metric = normalizeInventedSpec(spec, roster);
    const history = meta || {};
    const differentiated = valuesDifferFromNeutral(metric, roster, 50);
    const weightOn = metric.weight > 0;
    const tuned = !!(history.tunedAfterSeeingRank || history.autoFitted || (differentiated && weightOn));
    return {
      featureName: metric.name,
      weight: metric.weight,
      differentiated: differentiated,
      tunedAfterSeeingRank: tuned,
      autoFitted: !!history.autoFitted,
      sameSample: history.sameSample !== false,
      hasHoldout: !!history.hasHoldout,
      hasNextSeason: !!history.hasNextSeason,
      valuesHandTyped: history.valuesHandTyped !== false
    };
  }

  function inferFalsificationAnswers(context) {
    const ctx = context || {};
    return {
      outOfSample: ctx.hasHoldout ? 'yes' : 'no',
      preregistered: ctx.tunedAfterSeeingRank || ctx.autoFitted ? 'no' : 'unknown',
      nextSeason: ctx.hasNextSeason ? 'yes' : 'no',
      featureTiming: ctx.tunedAfterSeeingRank || ctx.autoFitted ? 'no' : 'unknown',
      independentMeasure: ctx.valuesHandTyped === false ? 'yes' : 'no',
      controlUntouched: ctx.autoFitted ? 'no' : 'unknown'
    };
  }

  function evaluateFalsification(answers, spec, meta) {
    const context = inferBuilderContext(spec, meta);
    const inferred = inferFalsificationAnswers(context);
    const given = answers && typeof answers === 'object' ? answers : {};
    const items = FALSIFICATION_ITEMS.map(function (item) {
      const inferredAnswer = inferred[item.id] || 'unknown';
      const answer = given[item.id] || inferredAnswer;
      const pass = answer === 'yes';
      let detail = '';
      if (item.id === 'outOfSample') {
        detail = context.hasHoldout
          ? 'סימנתם שיש מדגם החזקה נפרד.'
          : 'בארגז החול ובארכיון אותם שחקנים משמשים לכיול ולדירוג.';
      } else if (item.id === 'preregistered') {
        detail = context.tunedAfterSeeingRank
          ? 'המשקל או הערכים זזו אחרי שנראה דירוג — לא נרשם מראש.'
          : 'אין עדות לרישום מראש. סליידר חי אינו פרוטוקול.';
      } else if (item.id === 'nextSeason') {
        detail = 'במודול הזה אין נתוני עונה הבאה. שום ציון כאן לא נבדק מול 2019 או כל עונה אחרת.';
      } else if (item.id === 'featureTiming') {
        detail = context.tunedAfterSeeingRank
          ? 'הפיצ\'ר קיבל ערכים או משקל אחרי הבסיס — זה תזמון של צידוק.'
          : 'אם נתתם שם לפיצ\'ר רק אחרי שראיתם מי מאחור, התזמון חשוד.';
      } else if (item.id === 'independentMeasure') {
        detail = 'הערכים מוקלדים בארגז או הועתקו מארכיון שהוקלד ביד. אין מכשיר מדידה.';
      } else if (item.id === 'controlUntouched') {
        detail = context.autoFitted
          ? 'ההתאמה האוטומטית מורידה במכוון את מי שלא נבחר.'
          : 'בדקו אם הורדתם ביד את מי ש«צריך» להפסיד.';
      }
      return {
        id: item.id,
        label: item.label,
        question: item.question,
        why: item.why,
        answer: answer,
        inferred: inferredAnswer,
        pass: pass,
        detail: detail
      };
    });
    const passed = items.filter(function (item) { return item.pass; }).length;
    const failed = items.length - passed;
    return {
      context: context,
      items: items,
      passed: passed,
      failed: failed,
      total: items.length,
      summary: failed
        ? 'המדד נכשל ב־' + failed + ' מתוך ' + items.length + ' בדיקות הפרכה. זה לא באג בממשק — זו המלכודת.'
        : 'כל הבדיקות סומנו כעברו. אם זה קרה בלי מדגם החזקה אמיתי ועונה הבאה, בדקו שוב בכנות.'
    };
  }

  function autoFitInvented(players, targetId, weight) {
    const roster = players || SANDBOX_PLAYERS;
    const values = {};
    roster.forEach(function (player) {
      values[player.id] = player.id === targetId ? 95 : 18;
    });
    return normalizeInventedSpec({
      name: 'פיצ\'ר שכוונן למנצח שנבחר',
      weight: weight == null ? 70 : weight,
      values: values
    }, roster);
  }

  function homepageMetricContext(spec) {
    const grit = clamp(spec && spec.grit, 0, 100);
    const involvement = clamp(spec && spec.involvement, 0, 100);
    const clutch = clamp(spec && spec.clutch, 0, 100);
    return inferBuilderContext({
      name: 'Grit/Involvement/Clutch מהמעבדה',
      weight: 0,
      values: {}
    }, {
      sameSample: true,
      hasHoldout: false,
      hasNextSeason: false,
      valuesHandTyped: true,
      tunedAfterSeeingRank: (grit !== 40 || involvement !== 30 || clutch !== 30)
    });
  }

  return {
    clamp: clamp,
    round1: round1,
    round2: round2,
    mean: mean,
    SANDBOX_PLAYERS: SANDBOX_PLAYERS,
    DEFAULT_INVENTED_NAME: DEFAULT_INVENTED_NAME,
    ATTIC_SOURCE: ATTIC_SOURCE,
    ATTIC_ARCHIVED_FEATURES: ATTIC_ARCHIVED_FEATURES,
    ATTIC_PLAYERS: ATTIC_PLAYERS,
    WALKTHROUGH_STEPS: WALKTHROUGH_STEPS,
    FALSIFICATION_ITEMS: FALSIFICATION_ITEMS,
    archivedHandFedScore: archivedHandFedScore,
    normalizeInventedSpec: normalizeInventedSpec,
    linearScore: linearScore,
    atticStyleUpside: atticStyleUpside,
    playerScore: playerScore,
    rankRoster: rankRoster,
    attachDeltas: attachDeltas,
    rankingSwings: rankingSwings,
    deriveRanking: deriveRanking,
    formatInventedFormula: formatInventedFormula,
    archivedAtticSpec: archivedAtticSpec,
    atticConclusionHolds: atticConclusionHolds,
    evaluateAtticWalkthrough: evaluateAtticWalkthrough,
    inferBuilderContext: inferBuilderContext,
    inferFalsificationAnswers: inferFalsificationAnswers,
    evaluateFalsification: evaluateFalsification,
    autoFitInvented: autoFitInvented,
    homepageMetricContext: homepageMetricContext,
    defaultValues: defaultValues
  };
}));
