/* eslint-disable @typescript-eslint/no-require-imports */
// Real public browser workflow. Stops before report to avoid duplicate paid image generation.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/TS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage();page.setDefaultTimeout(120000);
 const base=fs.readFileSync('.runtime/public-url.txt','utf8').trim();
 await page.goto(base);await page.getByRole('button',{name:/开始选品/}).click();
 await page.getByRole('textbox',{name:'Amazon 商品关键词',exact:true}).fill('Womens Puff Long Sleeve Button Down Shirts');
 await page.getByRole('button',{name:'实时搜索',exact:true}).click();
 await page.getByRole('button',{name:'收藏商品',exact:true}).first().click();
 await page.getByRole('button',{name:/下一步：提取信息/}).click();
 await page.getByRole('button',{name:'一键提取 Listing 信息',exact:true}).click();
 await page.getByRole('button',{name:/下一步：竞品搜索/}).click();
 await page.getByRole('button',{name:'一键提取前 3 页竞品',exact:true}).click();
 await page.getByRole('button',{name:'一键提取前 3 页竞品',exact:true}).waitFor();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('一键提取前 3 页竞品'))?.disabled,{},{timeout:120000});
 const partial=page.getByRole('checkbox',{name:'使用部分样本继续'});
 if(await partial.count()){await partial.check();console.log('PARTIAL_SAMPLE explicitly acknowledged');}
 await page.getByRole('button',{name:/下一步：关键词验证/}).click();
 console.log('PASS public: start, keyword search, select, extract, collect, partial acknowledgement, keyword page');
 await page.screenshot({path:'.runtime/acceptance/public-workflow-keywords.png',fullPage:true});
 assert((await page.locator('body').innerText()).includes('设计共性转关键词验证'));
 await page.getByRole('button',{name:'查询真实关键词数据',exact:true}).click();
 await page.getByRole('button',{name:'重新查询西柚数据',exact:true}).waitFor();
 await page.getByRole('button',{name:/下一步：AI 分析/}).click();
 await page.getByRole('button',{name:/查看分析报告/}).waitFor({timeout:300000});
 const saved=await page.evaluate(()=>sessionStorage.getItem('amazon-selection-report-v4'));
 assert(saved);const report=JSON.parse(saved);assert(report.analysis.designProposals.length);
 fs.writeFileSync('.runtime/acceptance/public-browser-report.json',JSON.stringify(report,null,2));
 console.log('PASS public through real keyword query and completed analysis',report.analysis.productCount,'products',report.analysis.dataQuality.successfulPages);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
