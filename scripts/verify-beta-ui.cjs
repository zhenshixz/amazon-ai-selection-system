/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const posts=[];let accept=false,job;
 await page.route('**/api/design-images**',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST'){
   const body=req.postDataJSON();posts.push(body);
   if(!accept)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test outage"}'});
   job={...body,id:'a'.repeat(64),status:'complete',createdAt:new Date().toISOString()};
   return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify(job)});
  }
  if(url.searchParams.has('file'))return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(job)});
 });
 await page.goto('http://127.0.0.1:3000');
 const saved=JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json','utf8'));
 await page.evaluate(s=>{localStorage.clear();sessionStorage.setItem('amazon-selection-report-v4',JSON.stringify({analysis:s.report,anchors:s.anchors}));},saved);
 await page.reload();await page.locator('.design-card').first().waitFor();const cards=await page.locator('.design-card').count();
 await page.waitForTimeout(3500);assert.equal(posts.length,cards,'exactly one automatic submit per card during failure');
 await page.reload();await page.locator('.design-card').first().waitFor();await page.waitForTimeout(1600);assert.equal(posts.length,cards,'refresh must not resubmit failed creation');
 accept=true;const first=page.locator('.design-card').first();
 await first.getByRole('button',{name:'自定义改款 / 修改指令'}).click();
 const instruction='只将衣服颜色改为海军蓝，其他结构和背景保持不变。';
 await first.getByRole('textbox',{name:'改款图片指令'}).fill(instruction);
 await first.getByRole('checkbox').check();await first.getByRole('button',{name:'确认生成一张（计费）',exact:true}).click();
 await first.getByRole('button',{name:'放大改款图并对比原图'}).waitFor();assert.equal(posts.length,cards+1);assert.equal(posts.at(-1).prompt,instruction);
 assert((await first.innerText()).includes('不作为本次新方向的验证结论'));
 await page.reload();await page.locator('.design-card').first().getByRole('button',{name:'放大改款图并对比原图'}).waitFor();assert.equal(posts.length,cards+1,'restore does not generate');
 await page.locator('.step-button').filter({hasText:'提取信息'}).click();
 const editor=page.locator('.anchor-feature-editor').first();await editor.locator('summary').click();
 await editor.getByRole('combobox',{name:saved.anchors[0].asin+' 泡泡袖',exact:true}).selectOption('false');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('amazon-selection-report-v4')),null,'correction invalidates saved report');
 assert(await page.locator('.step-button').filter({hasText:'分析报告'}).isDisabled());
 assert(!(await editor.locator('.tag-list').innerText()).includes('泡泡袖'));
 await page.screenshot({path:'.runtime/acceptance/beta-corrections.png'});
 console.log('PASS: one automatic attempt, reload no retry, manual generation and restore, custom evidence warning, correction clears report and disables downstream navigation. All image calls intercepted; no costs.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
