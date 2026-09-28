/* ערוץ פנייה פרטי — ערך אחד שהבעלים ממלא.
 *
 * CONTACT ריק = הרכיב [data-contact] נשאר מוסתר, ומוצג טופס ה-issue בעברית ([data-contact-fallback]).
 * כדי לפתוח ערוץ פרטי: כתבו כאן קישור https:// (למשל טופס) או mailto:כתובת@דומיין. אין לשים ערך שלא אומת.
 * כל ערך אחר (טקסט, http://, javascript:, מספר טלפון גולמי) נדחה והרכיב נשאר מוסתר.
 */
(function (root) {
  'use strict';

  const CONTACT = '';

  function contactHref(value) {
    const v = String(value == null ? '' : value).trim();
    if (/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+$/i.test(v)) return v;
    if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
    return '';
  }

  function renderContact(doc, value) {
    const href = contactHref(value);
    const slots = Array.from(doc.querySelectorAll('[data-contact]'));
    const fallbacks = Array.from(doc.querySelectorAll('[data-contact-fallback]'));
    slots.forEach(function (el) {
      el.hidden = !href;
      const link = el.querySelector('a');
      if (href && link) link.setAttribute('href', href);
    });
    fallbacks.forEach(function (el) { el.hidden = !!href; });
    return !!href;
  }

  const api = { CONTACT: CONTACT, contactHref: contactHref, renderContact: renderContact };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root && root.document) {
    const run = function () { renderContact(root.document, CONTACT); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run);
    else run();
  }
})(typeof window !== 'undefined' ? window : null);
