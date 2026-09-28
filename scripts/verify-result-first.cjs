/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const base = fs.readFileSync('.runtime/public-url.txt', 'utf8').trim();
  const saved = JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json', 'utf8'));
  const id = '26145245aae89d019f9a689d18bb517a198ab3405304be28bc51bf3db0736902';
  const response = await fetch(base + '/api/design-images?id=' + id);
  assert.equal(response.status, 200);
  const job = await response.json();
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const paidRequests = [];
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/design-images')) paidRequests.push(r.url()); });
    await page.goto(base);
    await page.evaluate(({ saved, job }) => {
      sessionStorage.setItem('amazon-selection-report-v4', JSON.stringify({ analysis: saved.report, anchors: saved.anchors }));
      const p = saved.report.designProposals[0];
      localStorage.setItem(`design-image:${saved.report.generatedAt}:${saved.anchors[0].asin}:${p.id}:${p.targetFeature}`, JSON.stringify(job));
    }, { saved, job });
    await page.reload();
    const card = page.locator('.design-card').first();
    const result = card.locator('.proposal-result-image img');
    await result.waitFor();
    await result.evaluate(img => img.decode());
    assert.equal(await card.locator('textarea').count(), 0);
    assert.equal(await card.locator('.proposal-reference').isVisible(), false);
    assert(await card.locator('.proposal-result-description').innerText().then(t => t.includes(job.prompt)));
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: '.runtime/acceptance/result-first-public.png' });
    await page.reload();
    await page.locator('.design-card').first().locator('.proposal-result-image img').waitFor();
    await page.locator('.design-card').first().getByRole('button', { name: '与原图对比', exact: true }).click();
    await page.getByRole('dialog', { name: '改款同尺寸对比' }).waitFor();
    await page.getByRole('button', { name: '关闭对比', exact: true }).click();
    await page.locator('.design-card').first().getByRole('button', { name: '自定义改款 / 修改指令', exact: true }).click();
    assert(await page.locator('.design-card').first().getByLabel('改款图片指令').isVisible());
    assert.deepEqual(errors, []);
    assert.deepEqual(paidRequests, []);
    console.log('PASS public: generated image visible without click, survives reload, evidence collapsed, custom editor and comparison work, no generation requests');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
