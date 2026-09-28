/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader executes project TypeScript without adding a test runtime dependency. */
/* Targeted regression checks; fixtures are test inputs, never application data. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const original = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  if (id.startsWith('@/')) id = path.join(root, 'src', id.slice(2));
  return original.call(this, id, ...args);
};
const load = Module._load;
Module._load = function(id, ...args) { return id === 'server-only' ? {} : load.call(this, id, ...args); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { generateKeywordCandidates, extractDesignAttributes } = require('../src/lib/keyword-candidates.ts');
const { analyzeProducts } = require('../src/lib/analysis.ts');
const { refineDesignProposals } = require('../src/lib/design-model.ts');
const product = (asin, title, attributes = []) => ({ asin, title, image: 'https://example.com/test.jpg', url: 'https://amazon.com/dp/' + asin, price: 20, rating: 4, reviewCount: 10, monthlyBought: null, page: 1, details: { bullets: [], attributes, colors: [] } });
async function main() {
  const anchor = product('TEST000001', 'Womens long sleeve button down shirts', ['泡泡袖', '荷叶边', '宽松版型']);
  const bare = { ...anchor, details: undefined };
  const items = generateKeywordCandidates('womens shirts', [bare, ...Array.from({ length: 20 }, (_, i) => product('COMP' + String(i).padStart(6, '0'), 'Womens long sleeve button down office shirts'))], [anchor]);
  for (const label of ['泡泡袖', '荷叶边', '宽松版型']) assert(items.some((item) => item.sourceLabels.includes(label) && item.selected), label + ' must reach query');
  assert(items.filter((item) => item.selected).length <= 20);
  assert(extractDesignAttributes('Womens Puff Long Sleeve Button Down Shirts').includes('泡泡袖'));
  assert(!generateKeywordCandidates('mens pants', [product('TEST000002', 'women button down shirts')]).some((item) => item.keyword.includes('shirts')));
  const a = product('TEST000003', 'Womens cotton long sleeve shirts');
  const b = product('TEST000004', 'Womens puff sleeve ruffle shirts');
  const report = analyzeProducts('womens shirts', [a, b], [a]);
  assert(report.designProposals.every((item) => item.sourceFeature !== '长袖' || item.targetFeature !== '泡泡袖'));
  assert(report.designProposals.every((item) => item.risk === '待核验'));
  console.log('PASS: anchor detail preservation, feature coverage, budget, category, attribute semantics');
  if (!process.argv.includes('--live')) return;
  require('@next/env').loadEnvConfig(root);
  const { validateKeywordsWithXydc } = require('../src/lib/xydc-mcp.ts');
  const query = 'Womens Puff Long Sleeve Button Down Shirts';
  const search = await fetch('http://127.0.0.1:3000/api/amazon/search?q=' + encodeURIComponent(query) + '&page=1').then((response) => response.json());
  assert(search.products.length > 1);
  const anchors = [search.products[0]];
  const candidates = generateKeywordCandidates(query, search.products, anchors).filter((item) => item.selected);
  const validation = await validateKeywordsWithXydc(candidates);
  assert(validation.evidence.some((item) => item.status === 'matched'), validation.message);
  for (const group of validation.demandGroups) {
    const rows = validation.evidence.filter((item) => group.matchedKeywords.includes(item.keyword));
    const values = rows.filter((item) => item.weeklySearchVolume !== null);
    assert.equal(group.totalWeeklySearchVolume, values.length ? values.reduce((sum, item) => sum + item.weeklySearchVolume, 0) : null);
    const weighted = rows.filter((item) => item.weeklySearchVolume > 0 && item.competitiveDifficulty !== null);
    const expected = weighted.length ? weighted.reduce((sum, item) => sum + item.weeklySearchVolume * item.competitiveDifficulty, 0) / weighted.reduce((sum, item) => sum + item.weeklySearchVolume, 0) : null;
    assert.equal(group.weightedCompetitiveDifficulty, expected);
  }
  const realReport = analyzeProducts(query, search.products, anchors, validation);
  assert(realReport.designProposals.length > 0);
  const status = await refineDesignProposals(realReport, anchors);
  assert(status.startsWith('DeepSeek'), status);
  console.log(JSON.stringify({ products: search.products.length, keywords: validation.evidence.map((item) => ({ keyword: item.keyword, volume: item.weeklySearchVolume, competition: item.competitiveDifficulty })), proposals: realReport.designProposals.map((item) => ({ id: item.id, action: item.action, reason: item.reason })), status }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
