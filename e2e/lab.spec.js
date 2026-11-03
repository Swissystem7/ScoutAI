// Main user flows of the ScoutAI lab (index.html), run on desktop and a
// 360px-wide mobile viewport (see playwright.config.js). Hebrew RTL page:
// assertions use roles, labels, ids and visible text, not CSS.
'use strict';

const { test, expect } = require('./fixtures');

async function openLab(page, hash) {
  await page.goto('/' + (hash || ''));
  await expect(page.locator('#tableStatus')).toContainText('שחקנים אחרי סף');
}

function slider(page, name) {
  return page.getByRole('slider', { name: name });
}

test.describe('first visit', function () {
  test('the lab loads the local Open Data layer and shows the ranking', async function ({ page }) {
    await openLab(page);
    await expect(page).toHaveTitle(/ScoutAI/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ScoutAI');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#tableStatus')).toContainText('STATSBOMB_OPEN_DATA: 240 שחקנים אחרי סף 270 דקות');
    await expect(page.locator('#playerTable tbody tr')).toHaveCount(240);
    await expect(page.locator('#formulaLine')).toHaveText('ציון = (40×Grit + 30×Involvement + 30×Clutch) / 100');
    await expect(page.locator('#courseProgress')).toContainText('צעד 1 מתוך 8');
    await expect(page.locator('#byodStatus')).toContainText('לא נטען קובץ');
  });

  test('the page does not scroll sideways', async function ({ page }) {
    await openLab(page);
    const widths = await page.evaluate(function () {
      return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});

test.describe('build a metric', function () {
  test('moving a weight re-ranks, writes the share hash, and reset restores 40/30/30', async function ({ page }) {
    await openLab(page);
    const reset = page.getByRole('button', { name: 'איפוס למדד ברירת מחדל (40/30/30)' });
    await expect(reset).toBeDisabled();

    await slider(page, 'Grit — מאמץ').fill('70');
    await expect(page.locator('#formulaLine')).toContainText('70×Grit');
    await expect(page).toHaveURL(/#g=70&i=30&c=30&min=270&npos=0/);
    await expect(reset).toBeEnabled();

    await reset.click();
    await expect(slider(page, 'Grit — מאמץ')).toHaveValue('40');
    await expect(page.locator('#formulaLine')).toHaveText('ציון = (40×Grit + 30×Involvement + 30×Clutch) / 100');
    await expect(reset).toBeDisabled();
  });

  test('raising the minutes threshold shrinks the ranking', async function ({ page }) {
    await openLab(page);
    await slider(page, 'סף דקות מינימלי').fill('540');
    await expect(page.locator('#tableStatus')).toContainText('אחרי סף 540 דקות');
    const count = await page.locator('#playerTable tbody tr').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(240);
  });

  test('a shared link restores the weights and the position toggle', async function ({ page }) {
    await openLab(page, '#g=10&i=20&c=70&min=360&npos=1');
    await expect(slider(page, 'Grit — מאמץ')).toHaveValue('10');
    await expect(slider(page, 'Involvement — מעורבות')).toHaveValue('20');
    await expect(slider(page, 'Clutch — הכרעה')).toHaveValue('70');
    await expect(slider(page, 'סף דקות מינימלי')).toHaveValue('360');
    await expect(page.getByRole('checkbox', { name: /נרמול לפי עמדה/ })).toBeChecked();
    await expect(page.locator('#tableStatus')).toContainText('אחרי סף 360 דקות');
  });

  test('the guided exercise hint applies 70/20/10 with position normalisation', async function ({ page }) {
    await openLab(page);
    await page.getByRole('button', { name: /הציעו נקודת התחלה/ }).click();
    await expect(slider(page, 'Grit — מאמץ')).toHaveValue('70');
    await expect(slider(page, 'Involvement — מעורבות')).toHaveValue('20');
    await expect(slider(page, 'Clutch — הכרעה')).toHaveValue('10');
    await expect(page.getByRole('checkbox', { name: /נרמול לפי עמדה/ })).toBeChecked();
    await expect(page.getByRole('button', { name: /איפוס תרגיל/ })).toBeEnabled();
  });
});

test.describe('find and inspect a player', function () {
  test('search by team, then clear the filter', async function ({ page }) {
    await openLab(page);
    const search = page.getByRole('searchbox', { name: 'חיפוש שחקן לפי שם או נבחרת' });
    await search.fill('France');
    await expect(page.locator('#tableStatus')).toContainText(/מוצגים \d+ מתוך 240 שחקנים \(סינון: "France"\)/);
    const teams = await page.locator('#playerTable tbody tr td:nth-of-type(2)').allTextContents();
    expect(teams.length).toBeGreaterThan(0);
    for (const team of teams) expect(team).toBe('France');

    await page.getByRole('button', { name: 'נקה סינון' }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('#playerTable tbody tr')).toHaveCount(240);
  });

  test('filter by position group', async function ({ page }) {
    await openLab(page);
    await page.getByLabel('סינון לפי קבוצת עמדה').selectOption('GK');
    await expect(page.locator('#tableStatus')).toContainText('סינון: שוערים (GK)');
    const positions = await page.locator('#playerTable tbody tr td:nth-of-type(1) .muted').allTextContents();
    expect(positions.length).toBeGreaterThan(0);
    for (const pos of positions) expect(pos.startsWith('GK')).toBe(true);
  });

  test('choosing a player drives the lesson, the hash and the radar comparison', async function ({ page }) {
    await openLab(page);
    await page.getByRole('searchbox', { name: 'חיפוש שחקן לפי שם או נבחרת' }).fill('Kanté');
    const row = page.locator('#playerTable tbody tr', { hasText: 'Kanté' }).first();
    await row.click();
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#lessonStatus')).toContainText('Kanté');
    await expect(page).toHaveURL(/sel=[^&]*Kant/);

    const compare = page.getByLabel('השוו את השחקן הנבחר מול');
    const options = compare.locator('option');
    expect(await options.count()).toBeGreaterThan(1);
    const value = await options.nth(1).getAttribute('value');
    await compare.selectOption(value);
    // The button's accessible name names both players once a comparison is on.
    const clear = page.getByRole('button', { name: /^בטלו את השוואת .+ וחזרו להצגת .*Kanté/ });
    await expect(clear).toBeEnabled();
    await expect(page).toHaveURL(/cmp=/);
    await clear.click();
    await expect(page).not.toHaveURL(/cmp=/);
    await expect(page.locator('#clearCompare')).toBeDisabled();
  });
});

test.describe('course and data layers', function () {
  test('the 8-step course can be paged', async function ({ page }) {
    await openLab(page);
    const step2 = page.locator('#courseNav').getByRole('button', { name: /^צעד 2 מתוך 8/ });
    await step2.click();
    await expect(page.locator('#courseProgress')).toContainText('צעד 2 מתוך 8');
    await expect(step2).toHaveAttribute('aria-current', 'step');
  });

  test('load the synthetic example, then return to the World Cup demo', async function ({ page }) {
    await openLab(page);
    const restore = page.getByRole('button', { name: 'חזרו לדמו מונדיאל 2018' });
    await expect(restore).toBeDisabled();
    await page.getByRole('button', { name: 'טענו דוגמה סינתטית' }).click();
    await expect(page.locator('#byodStatus')).toContainText('SYNTHETIC_EXAMPLE');
    await expect(page.locator('#tableStatus')).not.toContainText('STATSBOMB_OPEN_DATA');
    await expect(restore).toBeEnabled();

    await restore.click();
    await expect(page.locator('#tableStatus')).toContainText('STATSBOMB_OPEN_DATA: 240 שחקנים');
  });

  test('the BYOD run button stays locked until a file and the licence box are given', async function ({ page }) {
    await openLab(page);
    await expect(page.getByRole('button', { name: 'הריצו על הקובץ שלי' })).toBeDisabled();
  });
});
