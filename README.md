# ScoutAI

ScoutAI הוא **דמו מקומי ודטרמיניסטי** (HTML יחיד + fixture לוגי).

## מה הדמו כן עושה
- מציג UI מקומי לדוגמת זרימת ניתוח.
- מסווג קלט וידאו כ-`LOCAL_VIDEO` (בחירה/קריאה בדפדפן בלבד).
- מציג מדדים כ-`DEMO_METRIC` (fixture דטרמיניסטי לפי seed, לא מדידה מהווידאו).

## מה הדמו לא עושה
- `VERIFIED_ANALYSIS_SERVICE` אינו זמין.
- אין backend, אין upload, אין fetch/XHR/beacon.
- אין פתיחת ניסיון, אין מכירות, אין שליחת PDF/Email, אין OAuth/תשלום.
- אין פלט מקצועי/רפואי/גיוסי/חוזי.

## בדיקות
- הרצת בדיקות אוטומטיות: `node --test /home/runner/work/ScoutAI/ScoutAI/tests/*.test.js`
- תיעוד תוצאות: `/home/runner/work/ScoutAI/ScoutAI/TEST_EVIDENCE.md`
