/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
process.env.AMAZON_PROXY_URL = 'off';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { searchAmazon } = require('../src/lib/amazon.ts');
async function main() {
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'selection-search-test-')));
  let calls = 0;
  global.fetch = async (url) => { calls++; return new Response('unavailable', { status: url.startsWith('https://r.jina.ai') ? 429 : 503 }); };
  const failed = await Promise.allSettled([searchAmazon('test failure', 1), searchAmazon('test failure', 1)]);
  assert.equal(calls, 2, 'concurrent same query must share direct/reader request');
  assert(failed.every((item) => item.status === 'rejected' && item.reason.message.includes('503') && item.reason.message.includes('429')));
  await assert.rejects(searchAmazon('test failure', 1));
  assert.equal(calls, 2, 'cooldown must avoid retry amplification');
  global.fetch = async (url) => { calls++; assert(url.startsWith('https://r.jina.ai')); return new Response('<div data-component-type="s-search-result" data-asin="TEST000001"><h2>Test shirt</h2><img class="s-image" src="https://example.com/test.jpg"></div>'); };
  const result = await searchAmazon('test success', 1);
  assert.equal(result.products.length, 1);
  assert.equal(calls, 3, 'direct circuit must use reader');
  global.amazonSearchCache.clear();
  const restored = await searchAmazon('test success', 1);
  assert(restored.cached);
  assert.equal(calls, 3, 'fresh disk snapshot must avoid new upstream calls');
  const transport = require('../src/lib/amazon-proxy.ts');
  const actualProxy = transport.fetchAmazonViaProxy;
  let readerProxyCalls = 0;
  transport.fetchAmazonViaProxy = async (url) => {
    if (!url.startsWith('https://r.jina.ai')) return null;
    readerProxyCalls++;
    return new Response('<div data-component-type="s-search-result" data-asin="TEST000002"><h2>Recovered shirt</h2><img class="s-image" src="https://example.com/test.jpg"></div>');
  };
  global.fetch = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); };
  const recovered = await searchAmazon('reader proxy recovery', 1);
  assert.equal(recovered.products[0].asin, 'TEST000002');
  assert.equal(readerProxyCalls, 1);
  transport.fetchAmazonViaProxy = async () => null;
  global.fetch = async () => new Response('<html><h1>Service unavailable</h1></html>');
  await assert.rejects(require('../src/lib/amazon.ts').getAmazonProductDetails('TEST000003'), /商品读取暂时失败/);
  transport.fetchAmazonViaProxy = actualProxy;
  console.log('PASS: reader network failure recovers via proxy; non-product detail page rejected');
  console.log('PASS: concurrent dedupe, both failure causes retained, cooldown, direct circuit, persistent fresh snapshot');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
