/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { analyzeProducts } = require('../src/lib/analysis.ts');
async function main() {
  const base = 'http://127.0.0.1:3000';
  const id = '26145245aae89d019f9a689d18bb517a198ab3405304be28bc51bf3db0736902';
  const job = await fetch(`${base}/api/design-images?id=${id}`).then((r) => r.json());
  assert.equal(job.status, 'complete');
  const query = 'Womens Puff Long Sleeve Button Down Shirts';
  const saved = JSON.parse(require('node:fs').readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json', 'utf8'));
  const search = { products: Array.from(new Map([...saved.anchors, ...saved.report.topProducts].map(p => [p.asin, p])).values()) };
  const anchor = search.products.find((p) => p.asin === job.anchorAsin);
  assert(anchor);
  const report = analyzeProducts(query, search.products, [anchor]);
  assert(report.designProposals.length);
  const duplicate = await fetch(`${base}/api/design-images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: job.model, anchorAsin: anchor.asin, imageUrl: 'https://m.media-amazon.com/images/I/61wquTwHLEL._AC_UL320_.jpg', prompt: job.prompt, keep: ['衣身颜色', '长袖', '领口', '纽扣门襟'], nonce: 'structural-review-20260909-v1' }) }).then((r) => r.json());
  assert.equal(duplicate.id, id);
  assert.equal(duplicate.status, 'complete');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(({ report, anchor, job }) => {
      sessionStorage.setItem('amazon-selection-report-v4', JSON.stringify({ analysis: report, anchors: [anchor] }));
      localStorage.setItem(`design-image:${report.generatedAt}:${anchor.asin}:${report.designProposals[0].id}:${report.designProposals[0].targetFeature}`, JSON.stringify(job));
    }, { report, anchor, job });
    await page.reload();
    await page.getByRole('button', { name: '查看改款图 / 原图对比' }).click();
    const panel = page.locator('.design-image-panel').first();
    await panel.getByAltText('AI 改款概念图').waitFor();
    await panel.getByAltText('AI 改款概念图').evaluate((img) => img.decode());
    assert(await panel.getByRole('button', { name: '重新生成一张（再次计费）' }).isDisabled());
    const download = panel.getByRole('link', { name: '下载改款图' });
    const response = await fetch(base + await download.getAttribute('href'));
    assert.equal(response.status, 200);
    assert(response.headers.get('content-disposition').includes('attachment'));
    await panel.screenshot({ path: '.runtime/design-images/report-image-panel.png' });
    assert(!(await page.locator('body').innerText()).includes('锚点该项未识别'));
    await panel.getByAltText('AI 改款概念图').click();
    const dialog = page.getByRole('dialog', { name: '改款同尺寸对比' });
    const boxes = await dialog.locator('img').evaluateAll((images) => images.map((img) => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })));
    assert.deepEqual(boxes[0], boxes[1]);
    await dialog.screenshot({ path: '.runtime/design-images/structural-comparison.png' });
    await page.getByRole('button', { name: '关闭对比' }).click();
    assert.deepEqual(errors, []);
    console.log('PASS: deployed API, duplicate reuse without generation, report restore, confirmation guard, comparison image decoding, download, no browser errors');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
