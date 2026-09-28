/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [], docCalls = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    // A saved report enables all navigation steps. Block any legacy auto-generation.
    await context.route('**/api/**', async route => {
      const req = route.request();
      if (req.frame().url().includes('/requirements/')) docCalls.push(req.url());
      if (req.url().includes('/api/design-images')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Documentation acceptance: generation blocked"}' });
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000');
    const saved = JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json', 'utf8'));
    await page.evaluate(saved => sessionStorage.setItem('amazon-selection-report-v4', JSON.stringify({ analysis: saved.report, anchors: saved.anchors })), saved);
    await page.reload();
    const names = ['总览', '收藏商品', '提取信息', '竞品搜索', '关键词验证', 'AI 分析', '分析报告'];
    for (const [step, name] of names.entries()) {
      await page.locator('.step-button').filter({ hasText: name }).click();
      if (step === 1) await page.getByRole('textbox', { name: 'Amazon 商品关键词', exact: true }).fill('preserve my input');
      const popupReady = page.waitForEvent('popup');
      await page.getByRole('link', { name: '需求文档 · ' + name }).click();
      const doc = await popupReady;
      await doc.waitForLoadState('networkidle');
      assert.equal(new URL(doc.url()).pathname, '/requirements/' + step);
      for (const id of ['revisions', 'overview', 'screens', 'modules', 'acceptance']) assert.equal(await doc.locator('#' + id).count(), 1);
      assert(await doc.locator('#revisions').evaluate(el => el.getBoundingClientRect().top < 250));
      await doc.locator('#screens').scrollIntoViewIfNeeded();
      await doc.waitForFunction(() => [...document.querySelectorAll('#screens img')].every(img => img.complete && img.naturalWidth > 0));
      await doc.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      assert(await doc.locator('.spec-site').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 18);
      assert.equal(await doc.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      if (step === 0) {
        assert.equal(await doc.locator('.spec-flow li').count(), 3);
        assert.equal(await doc.locator('#revisions').count(), 1);
        await doc.screenshot({ path: '.runtime/acceptance/requirements-home-v2.png' });
      }
      if (step === 6) {
        assert.equal(await doc.locator('.spec-module').count(), 18);
        assert.equal(await doc.locator('.spec-api').count(), 0);
        assert.equal(await doc.locator('#report table').count(), 18);
        assert(await doc.locator('#report tbody tr').count() >= 60);
        assert(!(await doc.locator('#report').innerText()).includes('待修复'));
        await doc.locator('#module-8').scrollIntoViewIfNeeded();
        await doc.screenshot({ path: '.runtime/acceptance/requirements-report-v2.png' });
        await doc.setViewportSize({ width: 390, height: 844 });
        await doc.evaluate(() => window.scrollTo(0, 0));
        assert.equal(await doc.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        await doc.screenshot({ path: '.runtime/acceptance/requirements-mobile-v2.png' });
      }
      await doc.close();
      if (step === 1) assert.equal(await page.getByRole('textbox', { name: 'Amazon 商品关键词', exact: true }).inputValue(), 'preserve my input');
    }
    const publicUrl = fs.readFileSync('.runtime/public-url.txt', 'utf8').trim();
    await page.goto(publicUrl, { timeout: 30000 });
    const publicPopup = page.waitForEvent('popup');
    await page.getByRole('link', { name: '需求文档 · 总览' }).click();
    const publicDoc = await publicPopup;
    await publicDoc.waitForLoadState('networkidle');
    assert.equal(new URL(publicDoc.url()).origin, publicUrl);
    assert.equal(await publicDoc.locator('#revisions').count(), 1);
    assert.equal(await publicDoc.locator('header #revisions').count(), 1);
    await publicDoc.locator('#revisions summary').click();
    assert.equal(await publicDoc.locator('#revisions tbody tr').count(), 1);
    assert((await publicDoc.locator('#revisions tbody').innerText()).includes('BETA'));
    const reportResponse = await publicDoc.goto(publicUrl + '/requirements/6', { timeout: 30000 });
    assert.equal(reportResponse.status(), 200);
    assert.equal(await publicDoc.locator('.spec-module').count(), 18);
    await publicDoc.goto(publicUrl + '/requirements/data', { timeout: 30000 });
    assert.equal(await publicDoc.locator('#scenarios > .spec-module').count(), 5);
    assert.equal(await publicDoc.locator('.reader-tech').count(), 5);
    await publicDoc.locator('.reader-tech summary').first().click();
    assert(await publicDoc.locator('.spec-api').first().isVisible());
    await publicDoc.screenshot({path:'.runtime/acceptance/requirements-data-v3.png'});
    const badRoute = await context.request.get('http://127.0.0.1:3000/requirements/99');
    assert.equal(badRoute.status(), 404);
    assert.deepEqual(errors, []);
    assert.deepEqual(docCalls, []);
    console.log('PASS: 7 new-tab entries, top revisions, screenshots loaded, input preserved, 18 report sections, separate data page with 5 scenarios and expandable APIs, desktop/mobile, no document API calls, invalid route 404, public accessible: ' + publicUrl);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
