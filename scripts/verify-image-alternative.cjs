/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const s=JSON.parse(fs.readFileSync('.runtime/acceptance/beta-first-live.json','utf8'));
 const p=s.report.designProposals[Number(process.argv[4]||0)],a=s.anchors[0],base=fs.readFileSync('.runtime/public-url.txt','utf8').trim();
 const response=await fetch(base+'/api/design-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:process.argv[2]||'gemini-3.1-flash-lite-image',anchorAsin:a.asin,imageUrl:a.image,prompt:p.action,keep:p.retainedFeatures,nonce:process.argv[3]||'beta-alternative-20260917-one'}),signal:AbortSignal.timeout(20000)});
 let job=await response.json();if(!response.ok)throw Error(job.error);
 console.log('ALTERNATIVE_CREATED',job.id);const deadline=Date.now()+260000;
 while(job.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,5000));job=await fetch(base+'/api/design-images?id='+job.id).then(r=>r.json());console.log(job.status,job.phase||job.error);}
 fs.writeFileSync('.runtime/acceptance/beta-alternative-image.json',JSON.stringify(job,null,2));
 console.log('RESULT',JSON.stringify(job));assert.equal(job.status,'complete');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
