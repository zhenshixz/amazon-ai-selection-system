/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const live=process.argv.includes('--live');
 const browserReport=process.argv.includes('--browser-report');
 const saved=JSON.parse(fs.readFileSync('.runtime/acceptance/'+(browserReport?'public-browser-report':live?'beta-first-live':'beta-first-saved-input')+'.json','utf8'));
 const source=browserReport?{report:saved.analysis,anchors:saved.anchors}:saved;
 if(process.argv.includes('--fresh-run'))source.report.generatedAt=new Date().toISOString();
 const publicUrl=fs.readFileSync('.runtime/public-url.txt','utf8').trim();
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),posts=[];
 const ids=new Set();
 page.on('request',r=>{if(r.url().includes('/api/design-images')&&r.method()==='POST')posts.push(r.postDataJSON());});
 page.on('response',async r=>{if(r.url().includes('/api/design-images')&&r.request().method()==='POST'){try{const j=await r.json();if(j.id)ids.add(j.id);console.log('IMAGE_CREATED',j.id,j.status,j.error||'');}catch{console.log('IMAGE_RESPONSE_NOT_JSON',r.status());}}});
 await page.goto(publicUrl,{timeout:30000});
 await page.evaluate(s=>sessionStorage.setItem('amazon-selection-report-v4',JSON.stringify({analysis:s.report,anchors:s.anchors})),source);
 await page.reload();await page.locator('.design-card').first().waitFor();
 const deadline=Date.now()+270000;let jobs=[];
 while(Date.now()<deadline){
  await page.waitForTimeout(3000);
  if(ids.size)jobs=await Promise.all([...ids].map(id=>page.request.get(publicUrl+'/api/design-images?id='+id,{timeout:20000}).then(r=>r.json())));
  console.log('IMAGE_STATUS',jobs.map(j=>j.status+':'+(j.phase||j.error||'')).join(' | '));
  if(ids.size===source.report.designProposals.length&&jobs.every(j=>j.status!=='running'))break;
  if(posts.length&&ids.size===0&&Date.now()>deadline-240000)break;
 }
 assert.equal(posts.length,source.report.designProposals.length,'one auto POST per proposal');
 for(const request of posts)assert(source.report.designProposals.some(p=>p.action===request.prompt),'exact recommended instruction must reach API');
 const count=posts.length;await page.reload();await page.waitForTimeout(2500);assert.equal(posts.length,count,'refresh must not generate');
 await page.locator('.design-section').screenshot({path:'.runtime/acceptance/beta-live-images.png'});
 fs.writeFileSync('.runtime/acceptance/beta-live-images.json',JSON.stringify({testedAt:new Date().toISOString(),source:browserReport?'2026-09-17 public browser report; current image calls':live?'current Amazon collection and current model/image calls':'historical real product subset; current model and image calls',publicUrl,posts:posts.length,jobs},null,2));
 console.log('IMAGE_RESULT',JSON.stringify(jobs.map(j=>({id:j.id,status:j.status,error:j.error,before:j.beforeReview,after:j.afterReview}))));
 assert.equal(jobs.length,source.report.designProposals.length);
 assert(jobs.length>0&&jobs.every(j=>j.status==='complete'),'every generated edit must pass review');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
