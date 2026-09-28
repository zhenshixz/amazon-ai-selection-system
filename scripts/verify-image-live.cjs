/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit live verification: two paid image edits, persisted by the real job implementation.
require('./verify-design.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const { createImageJob, readImageJob, IMAGE_MODELS } = require('../src/lib/image-jobs.ts');
async function main() {
  const response = await fetch('http://127.0.0.1:3000/api/amazon/search?q=Womens%20Puff%20Long%20Sleeve%20Button%20Down%20Shirts&page=1');
  const search = await response.json();
  if (!search.products?.length) throw new Error(search.error || 'No real products');
  const anchor = search.products[0];
  console.log(JSON.stringify({ anchor: anchor.asin, title: anchor.title, image: anchor.image }));
  const jobs = await Promise.all(IMAGE_MODELS.map((model) => createImageJob({ model, anchorAsin: anchor.asin, imageUrl: anchor.image, prompt: '只将衣服面料颜色改为深海军蓝。保持袖型、袖长、领口、纽扣门襟、版型、模特和背景不变。', keep: ['袖型', '袖长', '领口', '门襟', '版型'], nonce: 'real-garment-20260909-v1' })));
  for (let i = 0; i < 80; i++) {
    const current = await Promise.all(jobs.map((job) => readImageJob(job.id)));
    if (current.every((job) => job && job.status !== 'running')) { console.log(JSON.stringify(current, null, 2)); if (current.some((job) => job.status !== 'complete')) process.exitCode = 1; return; }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Timed out; job files retained, do not automatically regenerate.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
