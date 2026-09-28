/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createImageJob, readImageJob } = require('../src/lib/image-jobs.ts');
const { reviewGarmentEdit } = require('../src/lib/image-review.ts');
async function wait(id) {
  for (let i = 0; i < 140; i++) { const job = await readImageJob(id); if (job && job.status !== 'running') return job; await new Promise((r) => setTimeout(r, 2000)); }
  throw new Error('Timed out; files retained');
}
async function main() {
  const original = await fs.readFile('.runtime/design-images/7739d3b4bf5650d95fdbe3b98ca5cf0b6c51cc22f5484cc522734ead75e9fae9.original');
  const oldImage = await fs.readFile('.runtime/design-images/7739d3b4bf5650d95fdbe3b98ca5cf0b6c51cc22f5484cc522734ead75e9fae9.image');
  const oldReview = await reviewGarmentEdit('仅将装饰调整为荷叶边。', original, oldImage);
  console.log('Historical unchanged result:', JSON.stringify(oldReview));
  assert.notEqual(oldReview.decision, 'pass');
  const common = { model: 'gemini-3.1-flash-image-preview', anchorAsin: 'B0F4D8KJQ1', imageUrl: 'https://m.media-amazon.com/images/I/61wquTwHLEL._AC_UL320_.jpg', keep: ['衣身颜色', '长袖', '领口', '纽扣门襟'], nonce: 'structural-review-20260909-v1' };
  const blocked = await wait((await createImageJob({ ...common, prompt: '仅将装饰调整为荷叶边。' })).id);
  console.log('Ambiguous request:', JSON.stringify(blocked));
  assert.equal(blocked.status, 'needs_revision');
  const generated = await wait((await createImageJob({ ...common, prompt: '去掉左右袖口外翻的荷叶边和松紧褶皱，将两个袖口都改成平直窄袖口。不改变袖长、衣身、领口、纽扣门襟、颜色及背景。' })).id);
  console.log('Concrete structural edit:', JSON.stringify(generated));
  assert.equal(generated.status, 'complete', generated.error);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
