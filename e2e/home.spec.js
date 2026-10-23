const { test, expect } = require('@playwright/test');

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the academy name, punchline and the main actions', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/London\s+Academy\s+of\s+Bhangra/);
    await expect(page.locator('.home-tag')).toContainText('Bringing bhangra from the pind to the people');
    await expect(page.locator('.home-tag em')).toHaveText(['pind', 'people']);
    await expect(page.locator('.home-lede b')).toHaveText('Thursday at 7:30pm');
    await expect(page.locator('.home-acts').getByRole('link', { name: 'Get directions', exact: true })).toHaveAttribute('href', /google\.com\/maps/);
  });

  test('fits one screen on a computer; on a phone the picture wall stays visible and the page scrolls to the footer', async ({ page, isMobile }) => {
    await page.locator('.m-grid').waitFor();
    const m = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
      wall: document.querySelector('.m-grid').getBoundingClientRect().height,
    }));
    expect(m.x).toBe(0);
    if (isMobile) {
      expect(m.wall).toBeGreaterThanOrEqual(300);
      await expect(page.locator('.site-foot')).toBeVisible();
    } else {
      expect(m.y).toBe(0);
    }
  });

  test('on a short phone screen the picture wall is not squeezed out', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 553 });
    await page.reload();
    const wall = await page.locator('.m-grid').evaluate((el) => el.getBoundingClientRect().height);
    expect(wall).toBeGreaterThanOrEqual(300);
  });

  test('the picture wall moves, and the pause button stops it', async ({ page }) => {
    await page.waitForTimeout(2600);
    const col = page.locator('.m-col.c1');
    const y = () => col.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
    await page.locator('#motion-btn').click();
    await expect(page.locator('#motion-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(200);
    const a = await y();
    await page.waitForTimeout(600);
    expect(Math.abs((await y()) - a)).toBeLessThan(0.5);
    await page.locator('#motion-btn').click();
    await page.waitForTimeout(600);
    expect(Math.abs((await y()) - a)).toBeGreaterThan(2);
  });

  test('fills the picture wall with Instagram photos', async ({ page }) => {
    const images = ['/img/og-backdrop.jpg', '/img/icon-512.png', '/img/apple-touch-icon.png', '/img/icon-192.png'];
    await page.route('**/api/instagram', (route) => route.fulfill({ json: { posts: images.map((image, i) => ({ id: String(i), image, caption: 'Class', permalink: 'https://instagram.com/', timestamp: '2026-10-01T18:00:00Z' })) } }));
    await page.goto('/');
    await expect(page.locator('.m-cell.ph.is-photo').first()).toBeAttached();
  });

  test('the menu opens with every page and the phone numbers, and closes with Escape', async ({ page }) => {
    const btn = page.locator('#menu-toggle');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const menu = page.locator('#menu-inner');
    await expect(menu.getByRole('link', { name: /Pricing/ })).toBeVisible();
    await expect(menu.locator('.contact-us')).toContainText('Ravi 07851 564285');
    await expect(menu.locator('.contact-us')).toContainText('Gurdeep 07538 687118');
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('Call us lets you choose Ravi or Gurdeep', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The Call buttons are for phones; computers list the numbers in the menu.');
    await page.locator('.home-acts [data-call]').click();
    const pop = page.getByRole('dialog', { name: 'Who would you like to call?' });
    await expect(pop).toBeVisible();
    await expect(pop.getByRole('link', { name: /Ravi/ })).toHaveAttribute('href', 'tel:07851564285');
    await expect(pop.getByRole('link', { name: /Gurdeep/ })).toHaveAttribute('href', 'tel:07538687118');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
  });

  test('leaving the home page puts the header back and lets pages scroll', async ({ page }) => {
    await page.goto('/');
    await page.goto('/timetable');
    await expect(page.locator('body')).not.toHaveClass(/on-home/);
    await expect(page.locator('#hdr')).toBeVisible();
    await expect(page.locator('.site-foot')).toBeVisible();
  });

  test('has no script errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.getByRole('heading', { level: 1 }).waitFor();
    expect(errors).toEqual([]);
  });
});

test.describe('timetable page', () => {
  test('shows the class with its next date and a calendar file', async ({ page }) => {
    await page.goto('/timetable');
    const tile = page.locator('.class-tile').first();
    await expect(tile).toContainText('Bhangra');
    await expect(tile).toContainText(/Next: \w+day \d+ \w+/);
    const cal = tile.getByRole('link', { name: 'Add to my calendar' });
    await expect(cal).toHaveAttribute('download', /\.ics$/);
    const [download] = await Promise.all([page.waitForEvent('download'), cal.click()]);
    const ics = require('node:fs').readFileSync(await download.path(), 'utf8');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
  });
});
