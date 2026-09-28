/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { enrichAnchorVision } = require('../src/lib/anchor-vision.ts');
const { analyzeProducts } = require('../src/lib/analysis.ts');
const { refineDesignProposals } = require('../src/lib/design-model.ts');
const { generateKeywordCandidates, matchDemandGroup } = require('../src/lib/keyword-candidates.ts');
(async () => {
  for (const file of fs.readdirSync('.runtime/acceptance').filter(f => f.endsWith('.json') && !f.startsWith('targeted-'))) {
    if (process.argv[2] && !file.includes(process.argv[2])) continue;
    const saved = JSON.parse(fs.readFileSync('.runtime/acceptance/' + file, 'utf8'));
    const anchors = saved.anchors;
    anchors[0].details = await enrichAnchorVision(anchors[0].details, anchors[0].image);
    assert(anchors[0].details.visualStatus?.startsWith('图片识别完成'), anchors[0].details.visualStatus);
    const products = saved.report.topProducts;
    const candidates = generateKeywordCandidates(saved.summary.query, products, anchors);
    assert(candidates.filter(c => c.selected).length <= 20);
    for (const c of candidates.filter(c => c.source === 'design-combination')) assert(c.evidenceCount > 0);
    const report = analyzeProducts(saved.summary.query, products, anchors, saved.report.keywordValidation);
    for (const proposal of report.designProposals) assert(!anchors[0].details.visualAttributes.includes(proposal.targetFeature), 'already visible: ' + proposal.targetFeature);
    const status = await refineDesignProposals(report, anchors);
    assert(status.startsWith('DeepSeek'), status);
    const result = { query: saved.summary.query, scope: 'saved real product subset; no new market sample', visual: anchors[0].details.visualAttributes, status, proposals: report.designProposals.map(p => p.targetFeature) };
    fs.writeFileSync('.runtime/acceptance/targeted-' + file, JSON.stringify({ result, report, anchors }, null, 2));
    console.log(JSON.stringify(result));
  }
  const candidate = { source: 'design-feature', requiredElements: ['men/mens/male', 'wide leg', 'pants'], demandGroupId: 'wide-men', sourceLabels: ['阔腿'] };
  assert.equal(matchDemandGroup('wide leg pants for men', [candidate])?.demandGroupId, 'wide-men');
  assert(!matchDemandGroup('wide leg pants for women', [candidate]));
  console.log('PASS: live vision, model wording, existing-feature exclusion, combination evidence, manual grouping');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
