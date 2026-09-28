/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
const assert=require('node:assert/strict');
const {generateKeywordCandidates,productDesignText,extractDesignAttributes}=require('../src/lib/keyword-candidates.ts');
const {analyzeProducts}=require('../src/lib/analysis.ts');
const {assessDemandGroups}=require('../src/lib/xydc-mcp.ts');
const {refineDesignProposals}=require('../src/lib/design-model.ts');
const product=(asin,title)=>({asin,title,image:'https://m.media-amazon.com/images/I/test.jpg',url:'https://amazon.com/dp/'+asin,price:20,rating:4,reviewCount:10,monthlyBought:null,page:1,details:{bullets:[],attributes:[],colors:[]}});
(async()=>{
 const anchor=product('TEST000001','mens slim fit cotton pants');
 const competitor=product('TEST000002','mens wide leg linen pants');
 const plain=product('TEST000003','mens pants');
 const onlyFibre=product('TEST000004','mens cotton pants');
 assert.equal(analyzeProducts('mens pants',[plain,onlyFibre],[plain]).designProposals.length,0,'pure fibre composition is not a visible image-edit direction');
 const candidates=generateKeywordCandidates('mens pants',[anchor,competitor],[anchor]);
 const combo=candidates.find(c=>c.source==='design-combination'&&c.sourceLabels.includes('宽腿版型'));
 assert(combo,'fixture should have co-occurring cross-dimension combination');
 const group={id:combo.demandGroupId,label:combo.demandGroupLabel,requiredElements:combo.requiredElements,matchedKeywords:[combo.keyword],keywords:[combo.keyword],totalWeeklySearchVolume:1000,weightedCompetitiveDifficulty:20,periodFrom:'2026-09-01',periodTo:'2026-09-07',assessment:'优先验证'};
 const validation={candidates,evidence:[],demandGroups:[group]};
 const report=analyzeProducts('mens pants',[anchor,competitor],[anchor],validation);
 assert(report.designProposals.every(p=>p.targetFeatures.some(label=>!['棉质','亚麻面料','速干','吸湿排汗','抗皱'].includes(label))),'image proposals require a visible change, not only fibre or performance');
 assert.equal(report.designProposals[0].targetFeatures.length,2);
 assert.equal(report.designProposals[0].keywordDemandGroup.id,group.id);
 assert.equal(report.designProposals[0].evidenceLevel,'verified');
 assert(!analyzeProducts('mens pants',[anchor,competitor],[anchor],{...validation,demandGroups:[]}).designProposals.some(p=>p.targetFeatures.length>1),'no invented combination evidence');
 const corrected={...anchor,featureCorrections:{'修身版型':false,'宽腿版型':true}};
 assert(!extractDesignAttributes(productDesignText(corrected)).includes('修身版型'));
 assert(extractDesignAttributes(productDesignText(corrected)).includes('宽腿版型'));
 const r2=analyzeProducts('mens pants',[anchor,competitor],[corrected],validation);
 for(const proposal of r2.designProposals) if(proposal.targetFeatures.includes('宽腿版型')) assert(proposal.retainedFeatures.includes('宽腿版型'),'existing part of combination must be retained');
 const groups=assessDemandGroups([group,{...group,id:'other',totalWeeklySearchVolume:500,weightedCompetitiveDifficulty:50},{...group,id:'old',periodFrom:'2026-08-01',periodTo:'2026-08-07',totalWeeklySearchVolume:999999}]);
 assert.equal(groups[2].assessment,'数据不足');
 assert.equal(groups[0].assessment,'优先验证');
 const originalFetch=global.fetch, originalKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test-only';
 global.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({proposals:report.designProposals.map(p=>({id:p.id,action:`具体改款：将裤腿调整为${p.targetFeature}，只修改给定目标结构。`,rationale:'依据所提供的原款和商品证据，先做对照打样。',nextValidation:'核对原款结构，验证打样与成本。',evidenceAsins:[p.product.asin]}))})}}]}));
 try{const status=await refineDesignProposals(report,[anchor]);assert(status.startsWith('DeepSeek'));assert(report.designProposals.every(p=>p.action.startsWith('具体改款：')));}finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=originalKey;}
 console.log('PASS: independent combination evidence enters proposal; no-data combination excluded; corrections override extraction; existing combination feature retained; cross-week comparison excluded; model action becomes generation instruction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
