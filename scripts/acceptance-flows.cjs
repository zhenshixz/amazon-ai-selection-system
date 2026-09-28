/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { searchAmazon, getAmazonProductDetails } = require('../src/lib/amazon.ts');
const { generateKeywordCandidates, matchDemandGroup } = require('../src/lib/keyword-candidates.ts');
const { validateKeywordsWithXydc } = require('../src/lib/xydc-mcp.ts');
const { runAnalysisPipeline } = require('../src/lib/analysis-pipeline.ts');
async function flow(query) {
  console.log('START', query);
  const pages = [];
  for (const page of [1, 2, 3]) {
    try { pages.push(await searchAmazon(query, page)); } catch(e) { console.log('PAGE PARTIAL', query, page, e.message); }
  }
  if (!pages.length) throw new Error(query + ': no live products');
  const products = Array.from(new Map(pages.flatMap((page) => page.products).map((item) => [item.asin, item])).values());
  const anchors = products.slice(0, 2);
  for (const anchor of anchors) { try { anchor.details = await getAmazonProductDetails(anchor.asin); } catch(e) { console.log('DETAIL PARTIAL', anchor.asin, e.message); } }
  const candidates = generateKeywordCandidates(query, products, anchors);
  const selected = candidates.filter((item) => item.selected);
  assert(selected.length <= 20);
  const groups = selected.filter((item) => item.source === 'design-combination');
  for (const item of groups) assert(item.evidenceCount > 0);
  const single = candidates.find((item) => item.source === 'design-feature');
  if (single) assert.equal(matchDemandGroup(single.keyword, candidates).demandGroupId, single.demandGroupId);
  console.log('KEYWORDS', query, selected.length, 'combo expressions', groups.length);
  const validation = await validateKeywordsWithXydc(selected);
  for (const group of validation.demandGroups ?? []) {
    const rows = validation.evidence.filter((item) => group.matchedKeywords.includes(item.keyword) && item.weeklySearchVolume !== null);
    assert.equal(group.totalWeeklySearchVolume, rows.length ? rows.reduce((sum, item) => sum + item.weeklySearchVolume, 0) : null);
  }
  const report = await runAnalysisPipeline(query, products, anchors, validation, (event) => { if(event.status === 'complete') console.log('STAGE', query, event.index, event.summary); });
  assert.equal(report.productCount, products.length);
  const summary = { query, pages: pages.map((page) => page.page), products: products.length, anchors: anchors.map((item) => ({ asin: item.asin, features: item.details?.attributes ?? [] })), keywords: selected.length, matched: validation.evidence.filter((item) => item.status === 'matched').length, combinations: (validation.demandGroups ?? []).filter((item) => item.label.includes('组合')), proposals: report.designProposals.map((item) => ({ target: item.targetFeature, group: item.keywordDemandGroup?.label, action: item.action })), method: report.analysisMeta.method };
  await fs.mkdir('.runtime/acceptance', { recursive: true });
  await fs.writeFile('.runtime/acceptance/' + query.replace(/[^a-z0-9]+/gi, '-') + '.json', JSON.stringify({ summary, report, anchors }, null, 2));
  console.log('RESULT', JSON.stringify(summary));
}
(async()=> { for (const query of ['Womens Puff Long Sleeve Button Down Shirts', 'mens dress pants', 'womens summer dresses']) { try { await flow(query); } catch(e) { console.error('FAILED', query, e.message); process.exitCode = 1; } } })();
