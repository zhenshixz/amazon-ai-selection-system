/* eslint-disable @typescript-eslint/no-require-imports */
require('./verify-design.cjs');
const fs=require('node:fs');
const {generateKeywordCandidates}=require('../src/lib/keyword-candidates.ts');
const base='http://127.0.0.1:3000';
async function json(path,body){const r=await fetch(base+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});const data=await r.json();if(!r.ok)throw Error(data.error||String(r.status));return data;}
(async()=>{
 const query='Womens Puff Long Sleeve Button Down Shirts';
 const historical=process.argv.includes('--saved')?JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json','utf8')):null;
 const pages=[];
 if(historical){pages.push({page:1,products:historical.report.topProducts,source:'historical-real-subset',fetchedAt:historical.report.generatedAt,cached:true});console.log('HISTORICAL_INPUT',historical.report.generatedAt,'not a new market collection');}
 else for(const n of [1,2,3]){try{const p=await json('/api/amazon/search?q='+encodeURIComponent(query)+'&page='+n);pages.push(p);console.log('SEARCH',n,p.products.length,p.source,p.cached,p.fetchedAt);}catch(e){console.log('SEARCH_FAILED',n,e.message);}}
 if(!pages.length)throw Error('No live sample; cannot proceed.');
 const products=[...new Map(pages.flatMap(p=>p.products).map(p=>[p.asin,p])).values()];
 const anchors=historical?[historical.anchors[0]]:[products.find(p=>!p.isSponsored)||products[0]];
 if(!historical)try {const d=await json('/api/amazon/product?asin='+anchors[0].asin+'&image='+encodeURIComponent(anchors[0].image));anchors[0].details=d.details;console.log('DETAIL',anchors[0].asin,d.details?.completeness,d.details?.visualStatus);}catch(e){console.log('DETAIL_FAILED',e.message);}
 const candidates=generateKeywordCandidates(query,products,anchors).filter(c=>c.selected);
 const validation=await json('/api/keywords/validate',{candidates});
 console.log('KEYWORDS',validation.status,validation.evidence?.filter(e=>e.status==='matched').length,validation.demandGroups?.filter(g=>g.label.includes('组合')).map(g=>({label:g.label,volume:g.totalWeeklySearchVolume,competition:g.weightedCompetitiveDifficulty})));
 const r=await fetch(base+'/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,products,anchors,keywordValidation:validation}),signal:AbortSignal.timeout(300000)});
 if(!r.ok)throw Error('Analysis HTTP '+r.status);
 const reader=r.body.getReader();const decoder=new TextDecoder();let buffer='',report;
 function consume(line){if(!line.trim())return;const e=JSON.parse(line);if(e.type==='stage'&&e.status==='complete')console.log('STAGE',e.index,e.summary);if(e.type==='error')throw Error(e.error);if(e.type==='result')report=e.result;}
 while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(done)break;}consume(buffer);
 if(!report)throw Error('No completed report');
 fs.writeFileSync('.runtime/acceptance/'+(historical?'beta-first-saved-input':'beta-first-live')+'.json',JSON.stringify({query,pages:pages.map(p=>({page:p.page,fetchedAt:p.fetchedAt,source:p.source,cached:p.cached})),report,anchors},null,2));
 console.log('REPORT',JSON.stringify({count:report.productCount,method:report.analysisMeta.method,proposals:report.designProposals.map(p=>({target:p.targetFeature,level:p.evidenceLevel,action:p.action}))}));
})().catch(e=>{console.error('LIVE_BLOCKED',e.message);process.exitCode=1;});
