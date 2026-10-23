const { test, expect } = require('@playwright/test');

test('visits are counted without cookies, and shown to the admin', async ({ page, context }) => {
  const sent = [];
  page.on('request', (r) => { if (/\/api\/v(\/|$)/.test(r.url())) sent.push({ url: r.url(), body: r.postDataJSON() }); });
  await page.goto('/?utm_source=instagram');
  await expect.poll(() => sent.filter((s) => s.url.endsWith('/api/v')).length).toBe(1);
  expect(sent[0].body).toMatchObject({ path: '/', landing: true, tag: 'instagram' });

  await page.goto('/timetable');
  await expect.poll(() => sent.filter((s) => s.url.endsWith('/api/v')).length).toBe(2);
  // Pressing "Call us" is counted (the call itself is cancelled, as the test browser can't phone anyone).
  await page.evaluate(() => addEventListener('click', (e) => e.preventDefault()));
  await page.locator('a[href^="tel:"]').first().dispatchEvent('click');
  await expect.poll(() => sent.some((s) => s.url.endsWith('/api/v/event') && s.body.name === 'call')).toBe(true);
  expect((await context.cookies()).length).toBe(0);

  const login = await page.request.post('/api/auth/login', { headers: { 'X-LAB-CSRF': '1' }, data: { identifier: 'admin@londonacademyofbhangra.org', password: 'e2e-admin-password' } });
  expect(login.ok()).toBeTruthy();
  await page.goto('/admin/visitors');
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible();
  await expect(page.locator('.vz-stat').first()).not.toContainText(/^0/);
  await expect(page.locator('.vz-table')).toContainText('Timetable');
  await page.getByRole('button', { name: 'Last 12 months' }).click();
  await expect(page.locator('.vz-day')).toHaveCount(12);
  await expect(page.getByRole('heading', { name: 'People visiting each month' })).toBeVisible();
});
