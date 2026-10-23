const { test, expect } = require('@playwright/test');

test('a member pays for a class with Monzo and a teacher sees it on the class page', async ({ page, context, browserName }, info) => {
  const email = `pay-${info.project.name}-${Date.now()}@test.local`;
  await context.route('https://monzo.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Monzo (test)</h1>' }));

  await page.goto('/register');
  await page.fill('input[name=name]', 'Simran Kaur');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'password123');
  await page.check('input[value="16plus"]', { force: true });
  await page.check('input[name=acceptPrivacy]', { force: true });
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/account/);

  const pay = page.locator('#pay-section');
  await expect(pay.getByRole('heading', { name: 'Pay for a class' })).toBeVisible();
  const date = await pay.locator('#pay-date').inputValue();
  await expect(pay.locator('#pay-ref')).toContainText('SIMRAN KAUR');
  await expect(pay).toContainText('take a screenshot of the confirmation');

  // Monzo only opens once they've ticked that payments are not transferable.
  await expect(pay).toContainText('Class payments are not transferable');
  await expect(pay.getByRole('link', { name: /Pay £7 with Monzo/ })).toHaveAttribute('aria-disabled', 'true');
  await pay.getByRole('link', { name: /Pay £7 with Monzo/ }).click({ force: true });
  await expect(pay.locator('.pay-terms')).toHaveClass(/is-needed/);
  expect(context.pages().length).toBe(1);
  await pay.getByRole('checkbox').check();
  const [monzo] = await Promise.all([context.waitForEvent('page'), pay.getByRole('link', { name: /Pay £7 with Monzo/ }).click()]);
  expect(monzo.url()).toContain('monzo.com/pay/');
  await monzo.close();

  await expect(pay.getByRole('heading', { name: 'Did your payment go through?' })).toBeVisible();
  await expect(pay).toContainText("Take a screenshot of Monzo's payment confirmation");
  await pay.getByRole('button', { name: "Yes, I've paid" }).click();
  await expect(pay.locator('.pay-done')).toContainText('Paid online');
  await expect(pay.locator('.pay-list')).toContainText('Paid online');

  // The teacher's view: an admin opens that class.
  await page.request.post('/api/auth/logout', { headers: { 'X-LAB-CSRF': '1' } });
  await page.request.post('/api/auth/login', { headers: { 'X-LAB-CSRF': '1' }, data: { identifier: 'admin@londonacademyofbhangra.org', password: 'e2e-admin-password' } });
  const created = await page.request.post('/api/staff/sessions', { headers: { 'X-LAB-CSRF': '1' }, data: { title: 'Bhangra', date, start_time: '19:30' } });
  const { session } = await created.json();
  await page.goto(`/admin/sessions/${session.id}`);
  const box = page.locator('#session-pay');
  await expect(box.locator('.pay-list')).toContainText('Simran Kaur');
  await box.getByRole('button', { name: 'Received' }).first().click();
  await expect(box.getByRole('button', { name: 'Received' }).first()).toHaveAttribute('aria-pressed', 'true');
});
