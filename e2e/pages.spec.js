// Secondary pages a first-time visitor reaches from the lab: the feature trap,
// the licence page and the workshop offer. Desktop + 360px mobile.
'use strict';

const { test, expect } = require('./fixtures');

test('lab -> feature trap -> back to the lab', async function ({ page }) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'מעבר לחלקי המעבדה' })
    .getByRole('link', { name: "מלכודת הפיצ'רים המשכנעים" }).click();
  await expect(page).toHaveURL(/\/trap\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText("מלכודת הפיצ'רים המשכנעים");
  await expect(page.getByRole('heading', { name: "1. הוסף פיצ'ר" })).toBeVisible();

  await page.getByRole('link', { name: 'חזרה למעבדת המדד' }).first().click();
  await expect(page.locator('#tableStatus')).toContainText('STATSBOMB_OPEN_DATA');
});

test('licence page explains what is allowed and links back to the lab', async function ({ page }) {
  await page.goto('/licence.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מה מותר ומה אסור');
  await page.getByRole('link', { name: 'המעבדה', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ScoutAI');
});

test('workshop offer page has no sign-up form', async function ({ page }) {
  await page.goto('/offer.html');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
});

for (const path of ['/trap/', '/licence.html', '/offer.html']) {
  test(path + ' does not scroll sideways', async function ({ page }) {
    await page.goto(path);
    const widths = await page.evaluate(function () {
      return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}
