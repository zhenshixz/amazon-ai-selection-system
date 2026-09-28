/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const { chromium } = require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  fs.mkdirSync('public/requirements-images', { recursive: true });
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    const saved = JSON.parse(fs.readFileSync('.runtime/acceptance/targeted-Womens-Puff-Long-Sleeve-Button-Down-Shirts.json','utf8'));
    const snapshots=fs.readdirSync('.runtime/search-cache').map(f=>JSON.parse(fs.readFileSync('.runtime/search-cache/'+f,'utf8')));
    // Replay only recorded detail responses; never invoke paid services for documentation.
    await page.route('**/api/**', route => {
      const url=new URL(route.request().url());
      const anchor=saved.anchors.find(a=>a.asin===url.searchParams.get('asin'));
      if(url.pathname==='/api/amazon/search') {
        const cached=snapshots.find(s=>s.query===saved.report.query && s.page===Number(url.searchParams.get('page')));
        if(cached) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(cached)});
      }
      if(url.pathname==='/api/amazon/product' && anchor?.details) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({asin:anchor.asin,details:anchor.details})});
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'文档截图未执行新的数据查询或付费生成'})});
    });
    await page.goto('http://127.0.0.1:3000');
    await page.evaluate(saved => {sessionStorage.setItem('amazon-selection-report-v4',JSON.stringify({analysis:saved.report,anchors:saved.anchors}));localStorage.setItem('amazon-selection-theme','light');},saved);
    await page.reload();
    await page.addStyleTag({content:'html,body,*{scroll-behavior:auto!important}.app-footer{visibility:hidden!important}'});
    const names=['总览','收藏商品','提取信息','竞品搜索','关键词验证','AI 分析','分析报告'];
    for(let step=0;step<7;step++) {
      await page.locator('.step-button').filter({hasText:names[step]}).click();
      if(step===1) {
        await page.getByRole('textbox',{name:'Amazon 商品关键词',exact:true}).fill(saved.report.query);
        await page.getByRole('button',{name:'实时搜索',exact:true}).click();
        await page.getByRole('button',{name:'实时搜索',exact:true}).waitFor();
      }
      if(step===2) {
        await page.getByRole('button',{name:/一键提取 Listing 信息/}).click();
        await page.getByRole('button',{name:/重新提取 Listing 信息/}).waitFor();
      }
      if(step===3) {
        await page.getByRole('button',{name:/一键提取前 3 页竞品/}).click();
        await page.getByRole('button',{name:/下一步：关键词验证/}).waitFor({state:'visible'});
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('下一步：关键词验证')&&!b.disabled));
      }
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({path:`public/requirements-images/page-${step}.png`,animations:'disabled'});
      let control = page.locator('main .primary-button').first();
      if(step===6) control=page.getByRole('button',{name:/自定义改款/}).first();
      if(!await control.count()) control=page.locator('.step-header');
      await control.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await control.screenshot({path:`public/requirements-images/controls-${step}.png`,animations:'disabled'});
      if(step===3) await page.getByRole('button',{name:/下一步：关键词验证/}).click();
      if(step===6) {
        const names={2:'需求组与关键词竞争验证',4:'执行摘要',8:'竞品设计分布',11:'产品明细表',14:'改款参考方案',16:'改款依据说明表',17:'改款策略建议'};
        for(const [id,title] of Object.entries(names)) {
          const section=page.locator('.report-section').filter({has:page.getByRole('heading',{name:title,exact:true})});
          if(await section.count()!==1) throw new Error('Missing section '+title);
          await section.screenshot({path:`public/requirements-images/report-${id}.png`});
        }
      }
      if(step===1 || step===4) {
        await page.reload();
        await page.addStyleTag({content:'html,body,*{scroll-behavior:auto!important}.app-footer{visibility:hidden!important}'});
      }
    }
    console.log('Captured seven pages, seven controls and seven report regions; historical data only, API calls blocked.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
