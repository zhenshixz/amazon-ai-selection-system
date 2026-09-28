/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const {chromium}=require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage();let posts=0;
  await page.route('**/api/design-images**',route=>{if(route.request().method()==='POST')posts++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"audit simulated outage"}'});});
  await page.goto('http://127.0.0.1:3000');
  const saved=JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json','utf8'));
  await page.evaluate(saved=>{localStorage.clear();sessionStorage.setItem('amazon-selection-report-v4',JSON.stringify({analysis:saved.report,anchors:saved.anchors}));},saved);
  await page.reload();
  await page.locator('.design-card').first().waitFor();
  const cards=await page.locator('.design-card').count();
  await page.waitForTimeout(4200);
  console.log(JSON.stringify({check:'auto-generation-on-503',cards,posts,repeated:posts>cards,upstreamCalls:0}));
  const publicUrl=fs.readFileSync('.runtime/public-url.txt','utf8').trim();
  const response=await page.request.get(publicUrl+'/api/health',{timeout:20000});
  console.log(JSON.stringify({check:'public-health',status:response.status(),note:'Health only; not upstream collection or generation acceptance'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
