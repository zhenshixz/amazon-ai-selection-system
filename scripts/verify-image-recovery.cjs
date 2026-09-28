/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),base=fs.readFileSync('.runtime/public-url.txt','utf8').trim(),s=JSON.parse(fs.readFileSync('.runtime/acceptance/public-browser-report.json','utf8'));
 let posts=0;page.on('request',r=>{if(r.url().includes('/api/design-images')&&r.method()==='POST')posts++;});
 await page.goto(base);await page.evaluate(s=>sessionStorage.setItem('amazon-selection-report-v4',JSON.stringify(s)),s);await page.reload();await page.locator('.design-card').first().waitFor();await page.waitForTimeout(3000);
 for(let i=0;i<s.analysis.designProposals.length;i++){
  const card=page.locator('.design-card').nth(i);
  if(await card.getByRole('button',{name:'放大改款图并对比原图'}).count()){console.log('RESTORED',i);continue;}
  await card.getByRole('button',{name:'自定义改款 / 修改指令'}).click();await card.getByRole('checkbox').check();
  const response=page.waitForResponse(r=>r.url().includes('/api/design-images')&&r.request().method()==='POST');
  await card.getByRole('button',{name:'重新生成一张（再次计费）',exact:true}).click();const job=await(await response).json();assert(job.id,job.error);console.log('RETRY',i,job.id);
  let current=job;const end=Date.now()+240000;
  while(current.status==='running'&&Date.now()<end){await page.waitForTimeout(4000);try{const r=await page.request.get(base+'/api/design-images?id='+job.id);if(r.ok())current=await r.json();}catch{/* GET only, never retry POST */}}
  console.log('RESULT',i,current.status,current.error||current.afterReview?.reason);assert.equal(current.status,'complete');
 }
 const before=posts;await page.reload();await page.waitForTimeout(3500);assert.equal(posts,before);
 assert.equal(await page.getByRole('button',{name:'放大改款图并对比原图'}).count(),s.analysis.designProposals.length);
 await page.locator('.design-section').screenshot({path:'.runtime/acceptance/retest-0918-report.png'});
 const jobs=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('design-image:')&&!k.endsWith(':attempted')).map(k=>JSON.parse(localStorage.getItem(k))));
 fs.writeFileSync('.runtime/acceptance/retest-0918-report.json',JSON.stringify({testedAt:new Date().toISOString(),posts,jobs},null,2));console.log('PASS all report images complete; refresh restores without POST');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
