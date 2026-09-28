/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import { RequirementsNavigation } from "@/components/requirements-navigation";
import { pageRequirements, requirementRevisions, requirementVersion } from "@/lib/page-requirements";
import { apiContracts } from "@/lib/requirements-detail";
import { readerPages, simpleActions, dataScenarios } from "@/lib/requirements-reader";
import { reportFieldRequirements } from "@/lib/report-field-requirements";
import { analysisModelInputs, analysisModelOutputs } from "@/lib/analysis-model-requirements";
import "../requirements.css";

export function generateStaticParams() { return [...pageRequirements.map((_, step) => ({ step: String(step) })), { step: "data" }]; }
export async function generateMetadata({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return { title: `${step === "data" ? "数据与AI说明" : pageRequirements[Number(step)]?.title ?? "页面"} · 需求文档` };
}
function Table({ heads, rows }: { heads: string[]; rows: string[][] }) {
  return <div className="spec-table-wrap" tabIndex={0}><table><thead><tr>{heads.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function Shot({ file, caption }: { file: string; caption: string }) {
  return <figure className="reader-shot"><a href={`/requirements-images/${file}.png`} target="_blank" rel="noopener noreferrer"><img src={`/requirements-images/${file}.png`} alt={caption} loading="lazy" /></a><figcaption>{caption} · 点击图片可打开原尺寸大图</figcaption></figure>;
}
export default async function RequirementsPage({ params }: { params: Promise<{ step: string }> }) {
  const { step: raw } = await params;
  if (!/^[0-6]$/.test(raw) && raw !== "data") notFound();
  const isData = raw === "data", step = isData ? 0 : Number(raw), reader = readerPages[step];
  return <div className="spec-site"><header className="spec-top"><Link href="/requirements/0" className="spec-brand"><span className="spec-logo">A</span><span>Amazon AI <small>需求说明</small></span></Link><details id="revisions" className="spec-version-history"><summary>产品版本历史 <span className="spec-version">当前 {requirementVersion}</span></summary><p>按BETA、v1.0、v1.1等产品版本记录需求迭代。日期为需求基线记录日期，不是产品发布日期；修订人与确认人分别记录，未确认的信息不代填。</p><Table heads={["产品版本", "记录日期", "修订人", "确认人", "阶段", "需求变更内容"]} rows={requirementRevisions.map(r => [r.version, r.date, r.author, r.reviewer, r.status, r.change])}/></details></header><div className="spec-layout">
    <RequirementsNavigation current={raw} />
    <main className="spec-main" id="document">
      <div className="spec-hero"><p className="spec-eyebrow">{isData ? "数据来源与实现分工" : `第${step + 1}页 · 页面需求`}</p><h1>{isData ? "数据、API与大模型" : step === 0 ? "整体需求与首页" : pageRequirements[step].title}</h1><p>{isData ? "按业务场景讲清楚：要什么数据、去哪里拿、怎么处理、哪里用AI、失败怎么办。" : reader.intro}</p></div>
      {isData ? <>
        <section id="scenarios" className="spec-section"><h2>各场景如何取得关键数据</h2><p>API是系统之间取数据的接口；MCP是调用工具的一种方式，不是数据本身。当前关键词数据来自西柚，商品资料来自亚马逊公开页面。</p>{dataScenarios.map(s => <article className="spec-module" id={s.id} key={s.id}><div className="spec-module-heading"><h3>{s.name}</h3></div><dl><div><dt>需要提供什么</dt><dd>{s.input}</dd></div><div><dt>从哪里取得</dt><dd>{s.source}</dd></div><div><dt>系统怎么处理</dt><dd>{s.process}</dd></div><div><dt>用于哪里</dt><dd>{s.output}</dd></div><div className="spec-check"><dt>用不用大模型</dt><dd>{s.ai}</dd></div><div className="spec-gap"><dt>失败怎么办</dt><dd>{s.failure}</dd></div></dl><details className="reader-tech"><summary>技术对接细节：接口、参数、返回与缓存</summary>{[s.api, ...(s.id === "analysis" ? ["model"] : [])].map(key => { const a = apiContracts[key]; return <div key={key} className="spec-api"><h3>{a.title}</h3><dl>{[["何时调用", a.trigger], ["传入什么", a.request], ["对接过程", a.processing], ["返回什么", a.response], ["异常处理", a.failure], ["缓存与额度", a.cost]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>; })}</details></article>)}</section>
        <section id="model-inputs" className="spec-section"><h2>AI分析：实际传给大模型什么</h2><p>运营点击“下一步：AI分析”后，浏览器先把搜索词、竞品、锚点和已查询的西柚结果交给本系统后端。后端补充最多12款竞品详情、计算指标并选出候选方案。到最后一个阶段才细化方案：有候选、已配置模型且未命中缓存时，向文字大模型发起一次请求。模型收到的是下面的证据包，而不是完整的竞品搜索结果。</p><Table heads={["内容", "对应字段", "传入目的与范围"]} rows={analysisModelInputs}/><h3>模型需要返回什么</h3><Table heads={["返回字段", "在报告里怎么用"]} rows={analysisModelOutputs}/><p>例：原款是纯色衬衫、竞品有条纹，西柚对“条纹”需求组返回了有效数据。程序先决定“条纹”是候选方向；模型再写清条纹加在衣身或袖片的具体动作和需要保留的结构。若原款是否已有条纹还不确定，模型必须要求先核验，不能直接断言原款没有。</p><p>价格、评分、评论数、周搜索量、竞争难度、统计周期及相对机会判断由采集结果和程序产生。模型可以读取方案附带的需求组来解释依据，不能重新计算或编造这些值；没有独立组合数据时，不能把两个单特征相加说成组合需求。</p><p>后端检查方案数量、编号、全部目标标签和引用 ASIN。通过后才采用模型的动作；调用失败或校验不通过时，保留程序原有方案并说明降级。原款看图识别、文字方案细化、改款图生成与前后图片核验是不同调用，不能把报告中的一次文字分析理解为“整份报告都由大模型生成”。</p></section>
        <section id="division" className="spec-section"><h2>程序与AI怎么分工</h2><Table heads={["交给程序", "交给模型", "最后由人确认"]} rows={[["采集、商品去重、加总、价格区间、同义需求合并", "看图提取可见设计；结合已有数据解释建议；生成改款图", "原款特征是否识别对、图是否改对、工艺成本是否能落地"],["不让模型编造价格、搜索量、销量或成功率", "不把模型判断当成西柚数据，也不把生成成功当改款正确", "自定义改变方向后，需要重新验证需求，不能照搬旧结论"]]}/><p>所有供应商密钥放在服务器。浏览器只向当前网站发请求，再由服务器调用供应商；阅读文档不调用这些收费服务。相同数据短期可复用，但商品、关键词与模型各自的缓存时长不同，详见上方技术展开。</p><p>当前没有接入Keepa、SIF、卖家精灵或亚马逊官方商品API。后续替换数据源时，仍需保留来源、统计日期、缺失原因，不能混用不同口径。</p></section>
        <section id="metrics" className="spec-section"><h2>关键指标，用日常语言解释</h2><Table heads={["指标", "应该怎么读"]} rows={[["周搜索量", "这一周关键词被搜索了多少次。同一人可能搜多次，因此不是人数。"],["竞争难度", "西柚提供的竞争指标。数值可能超过100，不是百分比；一组词汇总时，搜索多的词影响更大。"],["CPC", "广告点击一次的参考价格，不是你账户实际支付的费用。"],["点击转化率", "供应商返回的点击后转化指标；具体单位仍需供应商确认，不能直接当你店铺的转化率。"],["ABA与BSR", "ABA描述搜索词的搜索排名；BSR描述商品在某个类目的销售排名，它们不是同一种排名。"],["资料完整度", "6类资料拿到几类：4类约67%。不代表设计理解完整，也不代表卖点一定已经拿到。"],["详情覆盖", "100款里20款取得过详情，就是20%。不代表这20款的资料每项都齐全。"],["设计占比", "统计样本中哪些设计出现过。长袖和泡泡袖可同时出现，不能把这类图理解为互不重叠的市场份额。"]]}/></section>
      </> : <>
        <section id="overview" className="spec-section"><h2>这页怎么用</h2><ol className="spec-flow">{reader.flow.map((s,i) => <li key={s}><b>{i+1}</b><span>{s}</span>{i < reader.flow.length-1 && <i aria-hidden="true">↓</i>}</li>)}</ol>{step === 0 && <><h3>整体使用场景与完整流程</h3><p>运营先找原款、查需求；产品人员再看改款与依据、决定是否打样。当前以美国站服装为主要验证范围，公司内部使用。</p><div className="spec-dataflow">{["搜商品", "选锚点", "拆设计", "采竞品", "查关键词", "出建议", "看改款图", "人工评审"].map((s,i) => <span key={s}>{i+1}. {s}{i<7 ? " →" : ""}</span>)}</div><p>采集失败可以只重试失败页；关键词无数据不能当成没有需求；生图失败需要明确提示。运营确认方向后，仍需核对工艺、成本并测试市场反应。</p></>}</section>
        <section id="screens" className="spec-section"><h2>对照页面看操作</h2><Shot file={`page-${step}`} caption={`${pageRequirements[step].title}页面实拍（2026-09-17）。${step > 0 ? "使用已保存的真实商品资料和历史报告回放操作，不代表今日重新采集或生成。" : "展示当前入口。"}`}/><h3>主要操作入口</h3><Shot file={`controls-${step}`} caption="当前页面按钮区域；按钮名称与下面说明对应"/><Table heads={["在图中找到", "点击后会怎样 / 什么时候能点"]} rows={simpleActions[step]}/></section>
        <section id="modules" className="spec-section"><h2>页面内容与规则</h2>{reader.rules.map(([title, text]) => <article className="reader-rule" key={title}><h3>{title}</h3><p>{text}</p></article>)}<p className="reader-data-link">{step === 5 ? "AI分析具体传给大模型哪些资料？" : "想看这些数据具体怎么拿？"}<Link href={step === 5 ? "/requirements/data#model-inputs" : "/requirements/data"}>{step === 5 ? "查看实际输入、输出与校验 →" : "查看“数据、API与大模型” →"}</Link></p></section>
        {step === 6 && <section id="report" className="spec-section"><h2>报告字段与展示规则</h2><p>以下按模块定义字段含义、数据获取和页面应如何展示，作为产品需求与验收依据；实现状态另见内部核查清单。截图用于定位区域，数值为历史报告资料。</p><nav className="report-field-index" aria-label="报告模块目录">{reportFieldRequirements.map((m,i) => <a href={`#module-${i}`} key={m.title}>{i+1}. {m.title}</a>)}</nav>{reportFieldRequirements.map((m,i) => <article className="spec-module" id={`module-${i}`} key={m.title}><div className="spec-module-heading"><span>{i+1}</span><h3>{m.title}</h3></div><p className="spec-scene">{m.purpose}</p><Table heads={["字段", "含义 / 用户看什么", "获取与计算", "展示与交互规则"]} rows={m.fields}/>{[2,4,8,11,14,16,17].includes(i) && <Shot file={`report-${i}`} caption={`${m.title}所在区域 · 历史报告实拍`}/>}</article>)}</section>}
        <section id="acceptance" className="spec-section"><h2>验收时重点看什么</h2><ul className="spec-acceptance">{reader.checks.map(s => <li key={s}>{s}</li>)}</ul><p className="spec-lead">以上是业务应达到的要求，不是全部已通过的声明。当前不足已在相关说明中写明；本轮只调整需求文档与阅读方式。</p></section>
      </>}
      <footer className="spec-footer"><span>{requirementVersion} · 公司内部评审</span><a href="#document">返回顶部 ↑</a></footer>
    </main></div></div>;
}
