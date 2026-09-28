"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Image from "next/image";
import { AnchorFeatureEditor } from "./anchor-feature-editor";
import { DesignImageEditor } from "./design-image-editor";
import { RequirementsDialog } from "./requirements-dialog";
import {
  Activity, AlertTriangle, ArrowRight, BadgeDollarSign, BarChart3, Check,
  CheckCircle2, ChevronRight, Database, ExternalLink, FileSearch,
  FileText, Gauge, Heart, Home, Info, Layers3, LoaderCircle, Moon, RefreshCw,
  MapPin, PackageSearch, Palette, Plus, Search, Shirt, Sparkles, Star, Sun, Target,
  Timer, TrendingUp, Trash2, Waypoints, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { generateKeywordCandidates, matchDemandGroup, extractDesignAttributes, productDesignText } from "@/lib/keyword-candidates";
import type {
  AmazonProduct, AnalysisResult, AnalysisStreamEvent, KeywordCandidate,
  KeywordDemandGroup, KeywordEvidence, KeywordValidationResult, SearchResponse,
} from "@/types/product";

const DEFAULT_QUERY = "Womens Puff Long Sleeve Button Down Shirts";
const REPORT_STORAGE_KEY = "amazon-selection-report-v4";
const REPORT_COLORS = ["#536fe8", "#2aa66f", "#e65d69", "#efad32", "#7d65cf", "#2999a5"];
const steps = [
  { label: "总览", icon: Home }, { label: "收藏商品", icon: Heart },
  { label: "提取信息", icon: FileSearch }, { label: "竞品搜索", icon: PackageSearch },
  { label: "关键词验证", icon: Waypoints }, { label: "AI 分析", icon: Sparkles },
  { label: "分析报告", icon: BarChart3 },
];
const analysisStages = [
  "数据清洗与标准化", "价格与需求指标统计", "竞品详情与设计特征补充", "价格带竞争格局分析",
  "市场结构与机会识别", "锚点商品交叉对比", "选品建议与参考方案生成",
];
const featureFallback = ["本次未取得"];
const COLOR_SWATCHES: Record<string, string> = {
  "白色": "#f8fafc", "蓝色": "#4169e1", "黑色": "#171717", "绿色": "#23865f",
  "粉色": "#f59bae", "红色": "#d91f3c", "米色": "#c9aa7d", "灰色": "#9097a4",
};

type LoadState = "idle" | "loading" | "success" | "error";
type ExtractionState = Record<string, { state: LoadState; message: string }>;
type PageState = Record<number, { state: LoadState; count: number; message: string }>;
type AnalysisStageState = Record<number, {
  status: "running" | "complete";
  processed: number;
  summary: string;
  durationMs?: number;
}>;

class ApiRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ApiRequestError";
    this.retryable = retryable;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchApi(input: RequestInfo | URL, init?: RequestInit, attempts = 3) {
  let lastError: Error = new ApiRequestError("网络请求失败");
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const response = await fetch(input, { ...init, cache: "no-store" });
      if (response.ok) return response;
      const text = await response.text();
      let message = `服务返回 HTTP ${response.status}`;
      let upstreamRetryable = true;
      try {
        const payload = JSON.parse(text) as { error?: unknown; retryable?: boolean };
        if (payload.retryable === false) upstreamRetryable = false;
        if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
      } catch {
        // Tunnel and proxy errors may return HTML or an empty body.
      }
      const retryable = upstreamRetryable && (response.status >= 500 || response.status === 408 || response.status === 429);
      throw new ApiRequestError(message, retryable);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("网络请求失败");
      const retryable = !(error instanceof ApiRequestError) || error.retryable;
      if (!retryable || attempt === attempts) break;
      await wait(600 * attempt);
    }
  }
  if (attemptsUsed > 1) throw new ApiRequestError(`${lastError.message}；已自动尝试 ${attemptsUsed} 次，请重试当前步骤。`, false);
  throw lastError;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit, attempts = 3): Promise<T> {
  let lastError: Error = new ApiRequestError("网络请求失败");
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt;
    try {
      const response = await fetchApi(input, init, 1);
      const text = await response.text();
      if (!text.trim()) throw new ApiRequestError("服务返回空响应");
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiRequestError("共享网络返回了非数据页面");
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("网络请求失败");
      const retryable = !(error instanceof ApiRequestError) || error.retryable;
      if (!retryable || attempt === attempts) break;
      await wait(600 * attempt);
    }
  }
  if (attemptsUsed > 1) throw new ApiRequestError(`${lastError.message}；已自动尝试 ${attemptsUsed} 次，请重试当前步骤。`, false);
  throw lastError;
}

function dedupeProducts(items: AmazonProduct[]) {
  return Array.from(new Map(items.map((item) => [item.asin, item])).values());
}
function formatNumber(value: number | null | undefined) {
  return value == null ? "--" : new Intl.NumberFormat("en-US").format(value);
}
function formatPrice(value: number | null | undefined) {
  return value == null ? "--" : `$${value.toFixed(2)}`;
}
function shortTitle(title: string, length = 76) {
  return title.length > length ? `${title.slice(0, length)}...` : title;
}
function daysSince(value: string | null | undefined) {
  if (!value) return "--";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return `${Math.max(0, Math.floor((Date.now() - time) / 86_400_000))} 天`;
}
function formatPriceRange(min: number | null, max: number | null) {
  return min === null || max === null ? "--" : `${formatPrice(min)}-${formatPrice(max)}`;
}
function formatAnalysisDuration(durationMs: number) {
  return durationMs < 100 ? "<0.1 秒（缓存命中）" : `${(durationMs / 1000).toFixed(1)} 秒`;
}
function formatPercent(value: number | null) {
  if (value === null) return "--";
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%`;
}
function formatKeywordMetric(value: number | null) {
  return value === null ? "--" : formatNumber(value);
}
function evidenceTone(item: KeywordEvidence) {
  return item.assessment === "优先验证" ? "success" as const
    : item.assessment === "需求高但竞争强" || item.assessment === "低竞争待验证" ? "warning" as const
      : "neutral" as const;
}
function demandGroupTone(item: KeywordDemandGroup) {
  return item.assessment === "优先验证" ? "success" as const
    : item.assessment === "需求高但竞争强" || item.assessment === "低竞争待验证" ? "warning" as const
      : "neutral" as const;
}
function formatDemandSignal(product: AmazonProduct) {
  if (product.monthlyBoughtText) return product.monthlyBoughtText.replace(" bought in past month", " 月购买下限");
  if (product.reviewCount != null) return `${formatNumber(product.reviewCount)} 条评论`;
  return "暂无公开需求信号";
}
function formatListingSignal(product: AmazonProduct) {
  if (product.details?.firstAvailable) return `已上架 ${daysSince(product.details.firstAvailable)}`;
  if (product.details?.bsr) return product.details.bsr;
  return product.isSponsored ? "广告位在售" : "当前搜索结果在售";
}
function formatColorSignal(product: AmazonProduct) {
  const colors = product.details?.colors ?? [];
  const count = product.details?.colorCount ?? (colors.length || null);
  if (count) return `${count} 个${colors.length ? ` · ${colors.slice(0, 2).join("、")}` : ""}`;
  return "未取得变体列表";
}
function ProductImage({ product, priority = false }: { product: AmazonProduct; priority?: boolean }) {
  return <Image src={product.image} alt={product.title} fill sizes="(max-width: 720px) 100vw, (max-width: 1180px) 50vw, 33vw" className="product-image" priority={priority} unoptimized />;
}

function hasKeywordData(item: KeywordEvidence) {
  return item.status === "matched" && [item.weeklySearchVolume, item.searchFrequencyRank, item.competitiveDifficulty, item.clickConversionRate, item.cpc].some((value) => typeof value === "number" && Number.isFinite(value));
}
function hasDemandGroupData(group: KeywordDemandGroup) {
  return group.matchedKeywords.length > 0 && [group.totalWeeklySearchVolume, group.weightedCompetitiveDifficulty, group.weightedCpc, group.weightedClickConversionRate].some((value) => typeof value === "number" && Number.isFinite(value));
}
function DemandGroupSummary({ groups, report = false }: { groups: KeywordDemandGroup[]; report?: boolean }) {
  groups = groups.filter(hasDemandGroupData);
  if (!groups.length) return null;
  return <div className={`demand-group-summary ${report ? "is-report" : ""}`}>
    <div className="demand-group-summary-head"><div><strong>同义搜索需求汇总</strong><span>同一需求的不同搜索表达合并计算，关键词明细保留在下方。</span></div><StatusBadge tone="live">{groups.length} 个需求组</StatusBadge></div>
    <div className="demand-group-list">{groups.map((group) => <div className="demand-group-row" key={group.id}>
      <div className="demand-group-name"><div><strong>{group.label}</strong><div className="tag-list">{group.requiredElements.map((element) => <span key={element}>{element}</span>)}</div></div><StatusBadge tone={demandGroupTone(group)}>{group.assessment}</StatusBadge></div>
      <dl><div><dt>合计周搜索量</dt><dd>{formatKeywordMetric(group.totalWeeklySearchVolume)}</dd></div><div><dt>有效关键词</dt><dd>{group.matchedKeywords.length}/{group.keywords.length}</dd></div><div><dt>加权竞争难度</dt><dd>{group.weightedCompetitiveDifficulty === null ? "--" : group.weightedCompetitiveDifficulty.toFixed(1)}</dd></div><div><dt>加权 CPC</dt><dd>{group.weightedCpc === null ? "--" : `$${group.weightedCpc.toFixed(2)}`}</dd></div><div><dt>主要流量词</dt><dd>{group.topKeyword ?? "暂无数据"}</dd></div></dl>
      <p>覆盖表达：{group.matchedKeywords.join(" · ")}</p><small>统计周期：{group.periodFrom && group.periodTo ? `${group.periodFrom} 至 ${group.periodTo}` : "未取得一致周期"}</small><small>{group.assessmentReason}</small>
    </div>)}</div>
    <p className="demand-group-method">口径：仅对同组最新一致周期的有效表达去重求和；未知周期不混加。竞争难度、CPC 和转化率仅按已知正搜索量加权。未覆盖表达仍未知，合计不代表全市场或去重买家人数。</p>
  </div>;
}

function StepHeader({ current, maxStep, theme, onNavigate, onToggleTheme }: {
  current: number;
  maxStep: number;
  theme: "light" | "dark";
  onNavigate: (step: number) => void;
  onToggleTheme: () => void;
}) {
  return <header className="step-header"><div className="step-header-inner" aria-label="选品流程">
    {steps.map((item, index) => {
      const Icon = item.icon;
      const complete = index < current;
      const active = index === current;
      const available = index <= maxStep;
      return <div className="step-item" key={item.label}>
        <button className={`step-button ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`} type="button" onClick={() => available && onNavigate(index)} disabled={!available} aria-current={active ? "step" : undefined} title={available ? `前往${item.label}` : `${item.label}尚未开始`}>
          <span className="step-index">{complete ? <Check size={14} /> : index}</span><Icon size={16} /><span>{item.label}</span>
        </button>
        {index < steps.length - 1 && <span className={`step-line ${index < current ? "is-complete" : ""}`} />}
      </div>;
    })}
    <button type="button" className="theme-toggle icon-button" onClick={onToggleTheme} aria-label={theme === "light" ? "切换到夜间模式" : "切换到日间模式"} title={theme === "light" ? "夜间模式" : "日间模式"}>{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
  </div></header>;
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "live" | "success" | "warning" | "neutral" }) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}

function Overview({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const modules = [
    { icon: Search, title: "实时搜索", text: "输入关键词读取 Amazon US 当前结果" },
    { icon: Heart, title: "锚点收藏", text: "选择需要参照和改款的真实商品" },
    { icon: Database, title: "信息提取", text: "结构化详情、价格、评分和设计属性" },
    { icon: BarChart3, title: "竞品分析", text: "汇总前三页样本与价格带、设计信号" },
    { icon: Waypoints, title: "关键词验证", text: "用西柚验证搜索需求、竞争难度和机会" },
    { icon: Palette, title: "改款参考", text: "先以真实竞品图验证方案流程" },
  ];
  return <main className="workspace overview-page">
    <section className="overview-title"><StatusBadge tone="live">AMAZON US 实时公开数据</StatusBadge><h1>智能选品工作台</h1><p>从关键词搜索到竞品报告，用一条清晰流程完成首轮选品判断。</p></section>
    <section className="module-grid" aria-label="功能流程">{modules.map((item, index) => { const Icon = item.icon; return <article className="module-item" key={item.title}><span className="module-number">0{index + 1}</span><Icon size={22} /><h2>{item.title}</h2><p>{item.text}</p></article>; })}</section>
    <section className="workflow-comparison">
      <div><span className="comparison-label muted">传统方式</span><ul><li>逐页打开商品并复制到表格</li><li>人工整理标题和设计特征</li><li>凭经验归纳趋势与改款方向</li></ul><strong>数小时至数天</strong></div>
      <div className="comparison-divider">VS</div>
      <div><span className="comparison-label live">当前流程</span><ul><li>关键词实时搜索并批量收藏</li><li>提取设计共性并转成英文搜索词</li><li>西柚数据验证后生成可追溯报告</li></ul><strong>首轮演示约 3-5 分钟</strong></div>
    </section>
    <button type="button" className="primary-button overview-cta" onClick={onStart}>开始选品 <ArrowRight size={17} /></button>
    <button type="button" className="secondary-button" onClick={onDemo} style={{ marginTop: 12, alignSelf: "center" }}>观看完整演示报告（历史数据回放）</button>
  </main>;
}

function ProductCard({ product, selected, onToggle }: { product: AmazonProduct; selected: boolean; onToggle: (product: AmazonProduct) => void }) {
  return <article className={`product-card ${selected ? "is-selected" : ""}`}>
    <div className="product-media"><ProductImage product={product} />{product.badge && <span className="product-badge">{product.badge}</span>}{product.isSponsored && <span className="sponsored-badge">Sponsored</span>}<button type="button" className="icon-button collect-button" onClick={() => onToggle(product)} aria-label={selected ? "取消收藏" : "收藏商品"} title={selected ? "取消收藏" : "收藏商品"}><Heart size={18} fill={selected ? "currentColor" : "none"} /></button></div>
    <div className="product-body"><a href={product.url} target="_blank" rel="noreferrer" className="product-title">{shortTitle(product.title)} <ExternalLink size={13} /></a><div className="rating-row"><Star size={15} fill="currentColor" /><strong>{product.rating?.toFixed(1) ?? "--"}</strong><span>({formatNumber(product.reviewCount)})</span>{product.isPrime && <span className="prime-mark">prime</span>}</div><div className="product-price-row"><strong>{product.priceText ?? "价格未显示"}</strong><span>{product.monthlyBoughtText ?? "本次未取得月购买量"}</span></div><div className="product-meta"><span>{product.asin}</span><span>第 {product.page} 页 / {product.position}</span></div></div>
  </article>;
}

function CollectionPage(props: {
  keyword: string; setKeyword: (value: string) => void; products: AmazonProduct[];
  selected: Set<string>; state: LoadState; error: string | null; fetchedAt: string | null;
  onSearch: () => void; onToggle: (product: AmazonProduct) => void; onNext: () => void;
}) {
  const { keyword, setKeyword, products, selected, state, error, fetchedAt, onSearch, onToggle, onNext } = props;
  return <main className="workspace content-workspace">
    <section className="page-title-row"><div><span className="eyebrow">STEP 1</span><h1>收藏锚点商品</h1><p>读取 Amazon US 当前关键词的第 1 页搜索结果，再选择需要参照的商品。</p></div><StatusBadge tone="live">LIVE DATA</StatusBadge></section>
    <form className="search-toolbar" onSubmit={(event) => { event.preventDefault(); onSearch(); }}><label className="search-field"><Search size={19} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入 Amazon 商品关键词" aria-label="Amazon 商品关键词" /></label><button type="submit" className="primary-button" disabled={state === "loading" || keyword.trim().length < 2}>{state === "loading" ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}实时搜索</button></form>
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={onSearch}>重试</button></div>}
    {state === "idle" && products.length === 0 && <section className="empty-state"><Search size={32} /><h2>输入关键词开始真实搜索</h2><p>示例关键词已填入，点击“实时搜索”即可读取最新结果。</p></section>}
    {state === "loading" && products.length === 0 && <section className="loading-grid" aria-label="正在搜索">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index} />)}</section>}
    {products.length > 0 && <><div className="result-summary"><span>Amazon 第 1 页读取 <strong>{products.length}</strong> 个真实商品</span><span>数据时间 {fetchedAt ? new Date(fetchedAt).toLocaleString("zh-CN") : "--"}</span><span>来源 amazon.com</span></div><section className="product-grid">{products.map((product) => <ProductCard key={product.asin} product={product} selected={selected.has(product.asin)} onToggle={onToggle} />)}</section></>}
    <div className="sticky-action-bar"><div><Heart size={18} />已收藏 <strong>{selected.size}</strong> 个商品<span>最多选择 9 个锚点</span></div><button type="button" className="primary-button" onClick={onNext} disabled={selected.size === 0}>下一步：提取信息 <ChevronRight size={17} /></button></div>
  </main>;
}

function ExtractionPage({ anchors, extraction, extracting, onExtract, onNext, onCorrect }: { onCorrect: (asin: string, changes: Record<string, boolean>) => void; anchors: AmazonProduct[]; extraction: ExtractionState; extracting: boolean; onExtract: () => void; onNext: () => void }) {
  const completed = anchors.filter((item) => extraction[item.asin]?.state === "success").length;
  const attempted = anchors.filter((item) => ["success", "error"].includes(extraction[item.asin]?.state)).length;
  const completeDetails = anchors.filter((item) => item.details?.extractionStatus === "complete").length;
  const partialDetails = anchors.filter((item) => item.details?.extractionStatus === "partial").length;
  return <main className="workspace content-workspace">
    <section className="page-title-row compact-title"><div><span className="eyebrow">STEP 2</span><h1>收藏商品 Listing 信息提取</h1><p>逐个读取真实详情页，并把可用字段整理成统一结构。</p></div><StatusBadge tone={completed === anchors.length ? "success" : "neutral"}>{completed}/{anchors.length} 完成</StatusBadge></section>
    <section className="anchor-strip">{anchors.map((item) => <article key={item.asin}><div className="anchor-thumb"><ProductImage product={item} /></div><div><strong>{shortTitle(item.title, 46)}</strong><span>{item.asin} · {item.priceText ?? "--"}</span></div></article>)}</section>
    <div className="center-action"><button type="button" className="primary-button" onClick={onExtract} disabled={extracting}>{extracting ? <LoaderCircle className="spin" size={17} /> : <Database size={17} />}{attempted > 0 ? "重新提取 Listing 信息" : "一键提取 Listing 信息"}</button></div>
    {attempted > 0 && <section className="extraction-log" aria-label="提取任务日志">{anchors.map((item) => { const job = extraction[item.asin] ?? { state: "idle", message: "等待提取" }; return <div className={`log-row state-${job.state}`} key={item.asin}><span className="log-icon">{job.state === "loading" && <LoaderCircle className="spin" size={17} />}{job.state === "success" && <CheckCircle2 size={17} />}{job.state === "error" && <AlertTriangle size={17} />}{job.state === "idle" && <span className="idle-dot" />}</span><strong>{item.asin}</strong><span>{shortTitle(item.title, 64)}</span><small>{job.message}</small></div>; })}</section>}
    {attempted > 0 && <section className="data-table-section"><div className="section-heading"><div><h2>结构化商品数据</h2><p>基础字段完整 {completeDetails} 款、部分 {partialDetails} 款；设计特征按可追溯证据单独展示，不与基础字段覆盖率混淆。</p></div><StatusBadge tone={partialDetails ? "warning" : "success"}>字段真实状态</StatusBadge></div><div className="table-scroll"><table className="data-table"><thead><tr><th>商品</th><th>ASIN</th><th>价格</th><th>需求信号</th><th>评分</th><th>颜色变体</th><th>在售信号</th><th>设计特征</th><th>基础字段覆盖</th><th>状态</th></tr></thead><tbody>{anchors.map((item) => { const details = item.details; return <tr key={item.asin}><td className="product-cell"><div className="table-thumb"><ProductImage product={item} /></div><span>{shortTitle(item.title, 42)}</span></td><td>{item.asin}</td><td>{item.priceText ?? "价格未显示"}</td><td>{formatDemandSignal(item)}</td><td>{item.rating?.toFixed(1) ?? "--"} / {formatNumber(item.reviewCount)}</td><td>{formatColorSignal(item)}</td><td>{formatListingSignal(item)}</td><td><div className="tag-list">{(item.featureCorrections ? extractDesignAttributes(productDesignText(item)) : details?.attributes.length ? details.attributes : featureFallback).map((tag) => <span key={tag}>{tag}</span>)}{details?.visualAttributes?.filter(tag => item.featureCorrections?.[tag] !== false).map((tag) => <span key={`visual-${tag}`} title={details.visualSummary}>图像：{tag}</span>)}</div>{details?.visualStatus && <small>{details.visualStatus}</small>}</td><td>{details ? `${details.completeness}%` : "--"}</td><td><StatusBadge tone={details?.extractionStatus === "complete" ? "success" : extraction[item.asin]?.state === "error" ? "neutral" : "warning"}>{details?.extractionStatus === "complete" ? "基础字段完成" : details ? "基础字段部分" : "提取失败"}</StatusBadge></td></tr>; })}</tbody></table></div></section>}
    {anchors.map(item => <AnchorFeatureEditor key={item.asin} product={item} disabled={extracting} onChange={onCorrect} />)}
    <div className="page-footer-actions"><button type="button" className="primary-button" onClick={onNext} disabled={attempted === 0 || extracting}>下一步：竞品搜索 <ChevronRight size={17} /></button></div>
  </main>;
}

function CompetitorPage({ keyword, pageState, products, running, allowPartial, onRun, onRetryPage, onAllowPartial, onNext }: { keyword: string; pageState: PageState; products: AmazonProduct[]; running: boolean; allowPartial: boolean; onRun: () => void; onRetryPage: (page: number) => void; onAllowPartial: (value: boolean) => void; onNext: () => void }) {
  const prices = products.flatMap((item) => item.price == null ? [] : [item.price]);
  const brands = new Set(products.map((item) => item.title.split(/\s+/)[0])).size;
  const successfulPages = [1, 2, 3].filter((page) => pageState[page]?.state === "success").length;
  const failedPages = [1, 2, 3].filter((page) => pageState[page]?.state === "error");
  const rawProductCount = [1, 2, 3].reduce((sum, page) => sum + (pageState[page]?.count ?? 0), 0);
  const duplicateCount = Math.max(0, rawProductCount - products.length);
  const canAnalyze = successfulPages === 3 || (allowPartial && successfulPages > 0);
  return <main className="workspace narrow-workspace">
    <section className="page-title-row compact-title"><div><span className="eyebrow">STEP 3</span><h1>关键词竞品搜索</h1><p>固定同一关键词读取前三页，建立可比较的市场样本。</p></div></section>
    <section className="competitor-query"><label><span>搜索关键词</span><div><Search size={18} /><input value={keyword} readOnly /></div></label><button type="button" className="primary-button" onClick={onRun} disabled={running}>{running ? <LoaderCircle className="spin" size={17} /> : <Layers3 size={17} />}一键提取前 3 页竞品</button></section>
    <section className="page-job-list">{[1, 2, 3].map((page) => { const job = pageState[page] ?? { state: "idle", count: 0, message: "等待开始" }; return <article className={`page-job state-${job.state}`} key={page}><div className="job-status-icon">{job.state === "loading" && <LoaderCircle className="spin" size={18} />}{job.state === "success" && <Check size={18} />}{job.state === "error" && <AlertTriangle size={18} />}{job.state === "idle" && page}</div><div><strong>第 {page} 页</strong><span>{job.message}</span></div>{job.state === "error" ? <button type="button" className="retry-page-button" onClick={() => onRetryPage(page)} disabled={running}><RefreshCw size={15} />重试本页</button> : <span className="job-count">{job.count > 0 ? `${job.count} 个商品` : "--"}</span>}</article>; })}</section>
    {failedPages.length > 0 && <section className="partial-analysis-option"><AlertTriangle size={18} /><div><strong>当前仅成功采集 {successfulPages}/3 页</strong><span>建议先重试失败页；继续分析将明确生成“部分样本报告”。</span></div><label><input type="checkbox" checked={allowPartial} onChange={(event) => onAllowPartial(event.target.checked)} />使用部分样本继续</label></section>}
    {products.length > 0 && <section className="metric-strip"><article><strong>{rawProductCount}</strong><span>{successfulPages} 页原始条数</span></article><article><strong>{duplicateCount}</strong><span>跨页重复 ASIN</span></article><article><strong>{products.length}</strong><span>去重分析商品</span></article><article><strong>{brands}</strong><span>标题品牌词</span></article><article><strong>{prices.length ? `${formatPrice(Math.min(...prices))}-${formatPrice(Math.max(...prices))}` : "--"}</strong><span>公开价格区间</span></article></section>}
    <div className="page-footer-actions"><button type="button" className="primary-button" onClick={onNext} disabled={products.length === 0 || running || !canAnalyze}>下一步：关键词验证 <Waypoints size={17} /></button></div>
  </main>;
}

function KeywordValidationPage({ candidates, validation, state, error, onChange, onValidate, onContinue, onSkip }: {
  candidates: KeywordCandidate[];
  validation: KeywordValidationResult | null;
  state: LoadState;
  error: string | null;
  onChange: (items: KeywordCandidate[]) => void;
  onValidate: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [manualKeyword, setManualKeyword] = useState("");
  const visibleEvidence = (validation?.evidence ?? []).filter(hasKeywordData);
  const selected = candidates.filter((item) => item.selected && item.keyword.trim().length >= 3);
  const update = (id: string, changes: Partial<KeywordCandidate>) => onChange(candidates.map((item) => {
    if (item.id !== id) return item;
    if (changes.keyword === undefined) return { ...item, ...changes };
    const group = matchDemandGroup(changes.keyword, candidates.filter(entry => entry.id !== id));
    return { ...item, ...changes, source: "manual", sourceLabels: group?.sourceLabels ?? ["人工词"], demandGroupId: group?.demandGroupId ?? id, demandGroupLabel: group?.demandGroupLabel ?? "人工补充需求", requiredElements: group?.requiredElements ?? [], evidenceAsins: group?.evidenceAsins ?? [], evidenceQuotes: group?.evidenceQuotes ?? [], evidenceCount: group?.evidenceCount ?? 0, dimension: group?.dimension, selectionReason: "词已修改，重新匹配需求组并查询" };
  }));
  const remove = (id: string) => onChange(candidates.filter((item) => item.id !== id));
  const addManual = () => {
    const keyword = manualKeyword.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
    if (keyword.length < 3 || candidates.some((item) => item.keyword === keyword) || selected.length >= 20) return;
    const id = `manual-${Date.now()}`;
    const group = matchDemandGroup(keyword, candidates);
    onChange([...candidates, { id, keyword, source: "manual", sourceLabels: group?.sourceLabels ?? ["人工补充"], evidenceCount: 0, evidenceAsins: [], selected: true, demandGroupId: group?.demandGroupId ?? id, demandGroupLabel: group?.demandGroupLabel ?? "人工补充需求", requiredElements: group?.requiredElements ?? [] }]);
    setManualKeyword("");
  };
  return <main className="workspace keyword-workspace">
    <section className="page-title-row compact-title"><div><span className="eyebrow">STEP 4</span><h1>设计共性转关键词验证</h1><p>先确认英文词根和组合，再用西柚真实数据验证需求与竞争，结果将直接进入改款依据。</p></div><StatusBadge tone="live">XYDC · US</StatusBadge></section>
    <section className="keyword-flow-band"><div><strong>设计证据</strong><span>Listing 标题 / 详情</span></div><ArrowRight size={18} /><div><strong>英文搜索词</strong><span>人群 + 设计属性 + 品类</span></div><ArrowRight size={18} /><div><strong>需求与竞争</strong><span>西柚 get_keyword_info</span></div><ArrowRight size={18} /><div><strong>改款依据</strong><span>本批次相对判断</span></div></section>
    <section className="keyword-editor"><div className="section-heading"><div><h2>候选关键词</h2><p>同一设计需求自动生成不同搜索表达，全部方向保留，默认优先覆盖不同维度；每轮最多查询 20 个表达。</p></div><StatusBadge tone="neutral">已选 {selected.length}/{candidates.length}</StatusBadge></div>
      <div className="keyword-candidate-list">{candidates.map((item) => <article className={item.selected ? "is-selected" : ""} key={item.id}><input type="checkbox" checked={item.selected} onChange={(event) => update(item.id, { selected: event.target.checked })} aria-label={`选择 ${item.keyword}`} /><div className="keyword-input-wrap"><input value={item.keyword} onChange={(event) => update(item.id, { keyword: event.target.value.toLowerCase() })} aria-label="候选英文关键词" /><span>{item.dimension ? item.dimension + " · " : ""}{item.demandGroupLabel ?? item.sourceLabels.join(" + ")} · {item.evidenceCount ? `${item.evidenceCount} 款 Listing 命中` : "人工词"}</span>{item.selectionReason && <small>{item.selected ? "已选择查询" : "未选择 · 可手动勾选"}</small>}{item.evidenceQuotes?.length ? <details><summary>查看商品依据</summary>{item.evidenceQuotes.map((proof) => <p key={proof.asin}><b>{proof.asin}</b> · {proof.text}</p>)}</details> : null}</div><div className="tag-list">{(item.requiredElements?.length ? item.requiredElements : item.evidenceAsins.slice(0, 3)).map((element) => <span key={element}>{element}</span>)}</div><button type="button" className="icon-button keyword-delete" onClick={() => remove(item.id)} title="删除关键词" aria-label={`删除 ${item.keyword}`}><Trash2 size={17} /></button></article>)}</div>
      <form className="manual-keyword-row" onSubmit={(event) => { event.preventDefault(); addManual(); }}><input value={manualKeyword} onChange={(event) => setManualKeyword(event.target.value)} placeholder="补充英文关键词，例如 wide leg dress pants for women" aria-label="补充英文关键词" /><button type="submit" className="primary-button" disabled={manualKeyword.trim().length < 3 || selected.length >= 20}><Plus size={17} />添加</button></form>
      <div className="keyword-validate-action"><button type="button" className="primary-button" onClick={onValidate} disabled={!selected.length || selected.length > 20 || state === "loading"}>{state === "loading" ? <LoaderCircle className="spin" size={17} /> : <Waypoints size={17} />}{validation ? "重新查询西柚数据" : "查询真实关键词数据"}</button><span>每批最多 10 个词，每轮最多 20 个；仅汇总已返回且周期一致的表达，不代表全市场。</span></div>
    </section>
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={onValidate}>重试</button></div>}
    {validation && <section className="keyword-result"><div className="section-heading"><div><h2>需求组与关键词证据</h2><p>{validation.message} {validation.cached ? "本次命中 30 分钟缓存。" : ""}</p></div><StatusBadge tone={validation.status === "verified" ? "success" : validation.status === "partial" ? "warning" : "neutral"}>{validation.status === "verified" ? "验证完成" : validation.status === "partial" ? "部分返回" : "未完成"}</StatusBadge></div>
      <DemandGroupSummary groups={validation.demandGroups ?? []} />
      {visibleEvidence.length > 0 && <div className="keyword-detail-heading"><strong>关键词原始明细</strong><span>仅展示已取得指标的关键词，数值保持西柚原始返回值。</span></div>}
      {visibleEvidence.length > 0 && <div className="table-scroll"><table className="data-table keyword-table"><thead><tr><th>关键词</th><th>来源设计</th><th>周搜索量</th><th>ABA 排名</th><th>竞争难度</th><th>点击转化率</th><th>CPC</th><th>相对判断</th></tr></thead><tbody>{visibleEvidence.map((item) => <tr key={item.candidateId}><td><strong>{item.keyword}</strong></td><td>{item.sourceLabels.join(" + ")}</td><td>{formatKeywordMetric(item.weeklySearchVolume)}</td><td>{formatKeywordMetric(item.searchFrequencyRank)}</td><td>{formatKeywordMetric(item.competitiveDifficulty)}</td><td>{item.status === "no-data" ? "--" : formatPercent(item.clickConversionRate)}</td><td>{item.status === "no-data" || item.cpc === null ? "--" : `$${item.cpc.toFixed(2)}`}</td><td><StatusBadge tone={evidenceTone(item)}>{item.assessment}</StatusBadge><small>{item.assessmentReason}</small></td></tr>)}</tbody></table></div>}
    </section>}
    <div className="keyword-footer-actions"><button type="button" className="secondary-button" onClick={onSkip} disabled={state === "loading"}>暂不验证，继续分析</button><button type="button" className="primary-button" onClick={onContinue} disabled={!validation || state === "loading"}>下一步：AI 分析 <Sparkles size={17} /></button></div>
  </main>;
}

function AnalysisPage({ stageProgress, analysis, error, onRetry, onReport }: { stageProgress: AnalysisStageState; analysis: AnalysisResult | null; error: string | null; onRetry: () => void; onReport: () => void }) {
  const complete = Boolean(analysis);
  const completedCount = Object.values(stageProgress).filter((stage) => stage.status === "complete").length;
  const percent = complete ? 100 : Math.round((completedCount / analysisStages.length) * 100);
  return <main className="workspace analysis-workspace"><div className="analysis-robot"><Sparkles size={30} /></div><h1>{error ? "分析任务需要处理" : complete ? "分析已完成" : "系统正在执行数据分析..."}</h1><p>进度由后端任务实时回传，分析期间会补充高需求竞品 Listing 详情。</p><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><strong className="progress-percent">{percent}%</strong>{error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={onRetry}><RefreshCw size={15} />重新执行</button></div>}<section className="analysis-stage-list">{analysisStages.map((stage, index) => { const progress = stageProgress[index]; const done = complete || progress?.status === "complete"; const active = !complete && progress?.status === "running"; return <div className={`${done ? "is-complete" : ""} ${active ? "is-active" : ""}`} key={stage}><span>{done ? <Check size={15} /> : active ? <LoaderCircle className="spin" size={15} /> : index + 1}</span><div><strong>{stage}</strong><p>{progress?.summary ?? "等待前置任务完成"}</p></div><small>{done ? progress?.durationMs ? `${progress.durationMs}ms` : "已完成" : active ? `${progress.processed} 项` : "等待"}</small></div>; })}</section>{analysis && <div className="analysis-complete-meta"><Timer size={16} />真实耗时 {formatAnalysisDuration(analysis.analysisMeta.durationMs)} · {analysis.analysisMeta.method}</div>}{analysis && <button type="button" className="primary-button report-button" onClick={onReport}>查看分析报告 <FileText size={17} /></button>}</main>;
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: ComponentType<{ size?: number }>; label: string; value: string; detail: string }) {
  return <article className="metric-card"><span><Icon size={18} /></span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}
function ChartEmpty() { return <div className="chart-empty">当前真实样本中没有可识别数据</div>; }

function ReportPage({ analysis, anchors }: { analysis: AnalysisResult; anchors: AmazonProduct[] }) {
  const [compare, setCompare] = useState<AmazonProduct | null>(null);
  const anchor = anchors[0] ?? analysis.topProduct;
  const proposals = analysis.designProposals;
  const bsrAnchor = anchors.find((item) => item.details?.bsr) ?? anchor;
  const bsrText = bsrAnchor?.details?.bsr ?? null;
  const bsrValue = bsrText?.match(/#[\d,]+/)?.[0] ?? bsrText;
  const dominantPattern = analysis.patternDistribution[0];
  const dominantSleeve = analysis.sleeveDistribution[0];
  const reportColors = analysis.colorSkuDistribution.length ? analysis.colorSkuDistribution : analysis.colorDistribution;
  const keywordValidation = analysis.keywordValidation;
  const keywordEvidence = (keywordValidation?.evidence ?? []).filter(hasKeywordData);
  const matchedKeywords = keywordEvidence.filter((item) => item.status === "matched");
  const secondaryMetric = bsrText
    ? { label: "锚点商品排名", value: bsrValue ?? "本次未取得", detail: `${bsrAnchor?.asin ?? "--"} · ${shortTitle(bsrText.replace(bsrValue ?? "", "").replace(/^\s*in\s*/i, ""), 58)}` }
    : { label: "市场平均评分", value: analysis.averageRating?.toFixed(2) ?? "--", detail: `本次未取得BSR，动态替换 · ${analysis.productCount} 款样本` };
  const reportScope = analysis.dataQuality.successfulPages.length === 3 ? "完整三页报告" : `部分样本报告（${analysis.dataQuality.successfulPages.length}/3 页）`;
  return <main className="report-shell">
    <section className="report-header"><div><span className="eyebrow">AMAZON US · 实时数据报告</span><h1>Amazon 服装竞品分析报告</h1><p>品类关键词：{analysis.query}</p></div><div className="report-meta"><span>生成时间 {new Date(analysis.generatedAt).toLocaleString("zh-CN")}</span><span>分析产品 {anchors.length || analysis.topProducts.length} 款 + Amazon 前 {analysis.dataQuality.successfulPages.length} 页 {analysis.productCount} 款竞品</span><span>公开价格区间 {formatPriceRange(analysis.priceMin, analysis.priceMax)}</span></div></section>
    <section className="report-quality-band"><div><Activity size={19} /><strong>{reportScope}</strong><span>资料覆盖等级 {analysis.dataQuality.conclusionConfidence}</span></div><dl><div><dt>有效商品</dt><dd>{analysis.dataQuality.validProducts}/{analysis.dataQuality.inputProducts}</dd></div><div><dt>价格覆盖</dt><dd>{analysis.dataQuality.priceCoverage}%</dd></div><div><dt>购买量覆盖</dt><dd>{analysis.dataQuality.demandCoverage}%</dd></div><div><dt>详情覆盖</dt><dd>{analysis.dataQuality.detailCoverage}%</dd></div><div><dt>关键词验证</dt><dd>{matchedKeywords.length}/{keywordValidation?.candidates.length ?? 0}</dd></div></dl></section>
    <section className="report-section keyword-report-section"><div className="section-heading"><div><h2><Waypoints size={22} />需求组与关键词竞争验证</h2><p>共同要素 → 多种搜索表达 → 西柚周度指标 → 需求组汇总；仅展示已取得指标的关键词与需求组。</p></div><StatusBadge tone={keywordValidation?.status === "verified" ? "success" : keywordValidation?.status === "partial" ? "warning" : "neutral"}>{keywordValidation?.status === "verified" ? "西柚验证完成" : keywordValidation?.status === "partial" ? "西柚部分返回" : "关键词验证未完成"}</StatusBadge></div>
      <DemandGroupSummary groups={keywordValidation?.demandGroups ?? []} report />
      {keywordEvidence.length > 0 && <div className="keyword-detail-heading"><strong>关键词原始明细</strong><span>逐词数据用于核查需求组汇总结果。</span></div>}
      {keywordEvidence.length ? <div className="table-scroll"><table className="data-table report-table keyword-report-table"><thead><tr><th>设计共性</th><th>英文搜索词</th><th>周搜索量</th><th>ABA 排名</th><th>竞争难度</th><th>点击转化率</th><th>CPC</th><th>机会判断</th></tr></thead><tbody>{keywordEvidence.map((item) => <tr key={item.candidateId}><td><div className="tag-list">{item.sourceLabels.map((label) => <span key={label}>{label}</span>)}</div></td><td><strong>{item.keyword}</strong><small>{item.periodFrom && item.periodTo ? `${item.periodFrom} 至 ${item.periodTo}` : "本次未返回报告周期"}</small></td><td className="keyword-volume">{formatKeywordMetric(item.weeklySearchVolume)}</td><td>{formatKeywordMetric(item.searchFrequencyRank)}</td><td>{formatKeywordMetric(item.competitiveDifficulty)}</td><td>{item.status === "no-data" ? "--" : formatPercent(item.clickConversionRate)}</td><td>{item.status === "no-data" || item.cpc === null ? "--" : `$${item.cpc.toFixed(2)}`}</td><td><StatusBadge tone={evidenceTone(item)}>{item.assessment}</StatusBadge><small>{item.assessmentReason}</small></td></tr>)}</tbody></table></div> : <div className="keyword-report-empty"><AlertTriangle size={20} /><div><strong>本轮没有可用的关键词指标</strong><p>{keywordValidation?.message ?? "未执行西柚关键词验证；报告仅使用 Amazon 公开页面信号。"}</p></div></div>}
      <p className="report-source-note">来源：{keywordValidation?.provider ?? "未接入"} · 站点 {keywordValidation?.country ?? "US"} · 工具 get_keyword_info · {keywordValidation?.fetchedAt ? `获取时间 ${new Date(keywordValidation.fetchedAt).toLocaleString("zh-CN")}` : "无取数时间"}。搜索量按同组关键词去重求和，其余指标按搜索量加权；机会判断是本批需求组之间的相对比较，不等同于成功率预测。</p>
    </section>
    <section className="report-section"><div className="section-heading"><div><h2>执行摘要</h2><p>核心指标根据字段可用性动态选择，不用“未公开”占据关键卡位。</p></div><StatusBadge tone={analysis.dataQuality.conclusionConfidence === "高" ? "success" : "warning"}>{analysis.dataQuality.conclusionConfidence}资料覆盖</StatusBadge></div><div className="report-metrics"><MetricCard icon={TrendingUp} label="需求领先锚点" value={analysis.topProduct?.monthlyBoughtText ? analysis.topProduct.monthlyBoughtText.replace(" bought in past month", " 月购买下限") : `${formatNumber(analysis.topProduct?.reviewCount)} 评论`} detail={`${analysis.topProduct?.asin ?? "--"} · ${shortTitle(analysis.topProduct?.title ?? "暂无", 34)}`} /><MetricCard icon={Gauge} label={secondaryMetric.label} value={secondaryMetric.value} detail={secondaryMetric.detail} /><MetricCard icon={BarChart3} label="常见图案" value={dominantPattern ? `${dominantPattern.name} ${Math.round((dominantPattern.value / Math.max(analysis.productCount, 1)) * 100)}%` : "样本不足"} detail={dominantPattern ? `${dominantPattern.value}/${analysis.productCount} 款标题或详情命中` : "等待更多详情字段"} /><MetricCard icon={Shirt} label="常见袖子标签" value={dominantSleeve?.name ?? "样本不足"} detail={dominantSleeve ? `${dominantSleeve.value} 款竞品使用此设计信号` : "等待更多详情字段"} /><MetricCard icon={BadgeDollarSign} label="价格甜点区" value={formatPriceRange(analysis.priceSweetSpot.min, analysis.priceSweetSpot.max)} detail={analysis.priceSweetSpot.sampleCount >= 3 ? `高需求 Top ${analysis.priceSweetSpot.sampleCount} 样本集中区` : "按有效价格中位数上下 15% 推导"} /></div></section>
    <section className="report-section chart-section"><div className="section-heading"><div><h2>竞品设计分布</h2><p>竞品 {analysis.productCount} 款；颜色统计包含锚点。领口与袖子按标签次数计，多标签可重叠，不是销量份额。</p></div></div><div className="chart-grid">
      <article className="chart-panel"><h3>颜色分布</h3><div className="chart-box">{reportColors.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={reportColors} margin={{ top: 20, right: 10, left: -12, bottom: 0 }}><CartesianGrid stroke="#e8eaf0" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 13, fill: "#667085" }} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#667085" }} /><Tooltip /><Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", fill: "#536078", fontSize: 12 }}>{reportColors.map((item, index) => <Cell key={item.name} fill={COLOR_SWATCHES[item.name] ?? REPORT_COLORS[index % REPORT_COLORS.length]} stroke={item.name === "白色" ? "#cfd5df" : undefined} />)}</Bar></BarChart></ResponsiveContainer> : <ChartEmpty />}</div></article>
      <article className="chart-panel"><h3>领口类型分布</h3><div className="chart-box donut-box">{analysis.necklineDistribution.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analysis.necklineDistribution} dataKey="value" nameKey="name" innerRadius={68} outerRadius={102} paddingAngle={2} label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}>{analysis.necklineDistribution.map((item, index) => <Cell key={item.name} fill={REPORT_COLORS[index % REPORT_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <ChartEmpty />}</div><div className="chart-legend">{analysis.necklineDistribution.map((item, index) => <span key={item.name}><i style={{ background: REPORT_COLORS[index % REPORT_COLORS.length] }} />{item.name} {item.value}</span>)}</div></article>
      <article className="chart-panel"><h3>袖型分布</h3><div className="chart-box donut-box">{analysis.sleeveDistribution.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analysis.sleeveDistribution} dataKey="value" nameKey="name" innerRadius={68} outerRadius={102} paddingAngle={2} label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}>{analysis.sleeveDistribution.map((item, index) => <Cell key={item.name} fill={REPORT_COLORS[index % REPORT_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <ChartEmpty />}</div><div className="chart-legend">{analysis.sleeveDistribution.map((item, index) => <span key={item.name}><i style={{ background: REPORT_COLORS[index % REPORT_COLORS.length] }} />{item.name} {item.value}</span>)}</div></article>
      <article className="chart-panel"><h3>面料 / 图案分布</h3><div className="chart-box">{(analysis.materialDistribution.length || analysis.patternDistribution.length) ? <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={[...analysis.materialDistribution, ...analysis.patternDistribution].slice(0, 7)} margin={{ top: 8, right: 36, left: 18, bottom: 0 }}><CartesianGrid stroke="#e8eaf0" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#667085" }} /><YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 13, fill: "#667085" }} /><Tooltip /><Bar dataKey="value" fill="#536fe8" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#536078", fontSize: 12 }} /></BarChart></ResponsiveContainer> : <ChartEmpty />}</div></article>
    </div></section>
    <section className="report-section"><div className="section-heading"><div><h2>商品颜色覆盖</h2><p>优先使用 Listing 变体颜色；未取得变体时仅使用标题中的明确颜色信号。</p></div><StatusBadge tone={analysis.colorSkuDistribution.length ? "success" : "warning"}>{analysis.colorSkuDistribution.length ? `${analysis.colorSkuDistribution.reduce((sum, item) => sum + item.value, 0)} 个颜色信号` : "覆盖不足"}</StatusBadge></div><div className="color-heatmap">{reportColors.length ? reportColors.map((item) => <div key={item.name}><i style={{ background: COLOR_SWATCHES[item.name] ?? "#7d65cf" }} /><span>{item.name}</span><strong>{item.value}</strong></div>) : <ChartEmpty />}</div></section>
    <section className="report-section"><div className="section-heading"><div><h2>设计特征与使用场景统计</h2><p>服装属性与使用场景保持独立口径，便于定位主流公式、场景卖点和差异化空白。</p></div></div><div className="attribute-group-grid">{analysis.attributeGroups.filter(group => group.items.length > 0).map((group) => <article key={group.name}><h3>{group.name}</h3>{group.items.length ? <ul>{group.items.slice(0, 6).map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.value}</strong></li>)}</ul> : <p>有效字段不足</p>}</article>)}</div></section>
    <section className="report-section product-detail-section"><div className="section-heading"><div><h2><FileText size={22} />产品明细表</h2><p>绿色行是用户收藏锚点；月购买量或上架日期缺失时，使用同一 Amazon 页面中的评论、BSR 等真实公开信号补位。</p></div><StatusBadge tone="neutral">锚点 + 支持竞品</StatusBadge></div><div className="table-scroll"><table className="data-table report-table product-report-table"><thead><tr><th>图片</th><th>产品标题</th><th>价格</th><th>需求信号</th><th>在售信号</th><th>颜色变体</th><th>设计特征</th><th>ASIN</th></tr></thead><tbody>{analysis.topProducts.map((item) => { const proposal = analysis.designProposals.find((entry) => entry.product.asin === item.asin); const tags = item.featureCorrections ? extractDesignAttributes(productDesignText(item)) : item.details?.attributes.length ? item.details.attributes : proposal?.tags ?? featureFallback; const isAnchor = anchors.some((entry) => entry.asin === item.asin); const highDemand = (item.reviewCount ?? 0) >= 2500; return <tr className={isAnchor ? "anchor-row" : ""} key={item.asin}><td><div className="table-thumb report-thumb"><ProductImage product={item} /></div></td><td className="report-title-cell"><a href={item.url} target="_blank" rel="noreferrer">{shortTitle(item.title, 72)}</a><StatusBadge tone={isAnchor ? "success" : "neutral"}>{isAnchor ? "锚点" : "支持竞品"}</StatusBadge></td><td className="price-cell">{item.priceText ?? "价格未显示"}</td><td className={highDemand ? "demand-cell is-hot" : "demand-cell"}>{formatDemandSignal(item)}</td><td>{formatListingSignal(item)}</td><td>{formatColorSignal(item)}</td><td><div className="tag-list feature-tag-list">{tags.slice(0, 4).map((tag, index) => <span className={`tag-tone-${index % 4}`} key={tag}>{tag}</span>)}</div></td><td><a className="asin-link" href={item.url} target="_blank" rel="noreferrer">{item.asin}</a></td></tr>; })}</tbody></table></div></section>
    <section className="report-section insight-section"><div className="section-heading"><div><h2><Sparkles size={22} />选品建议与差异化机会</h2><p>将市场分布、锚点特征与公开需求信号交叉比较。</p></div></div><div className="insight-list">{analysis.insights.map((item) => { const visualTone = /机会|升级|突破|差异|功能/.test(item.title) ? "opportunity" : /风险|谨慎|缺失/.test(item.title) ? "warning" : "strategy"; return <article className={`insight-row insight-${visualTone}`} key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>; })}</div></section>
    {anchor && <section className="report-section anchor-report-section"><div className="section-heading"><div><h2>锚点商品总览</h2><p>先建立改款基准，再进入竞品参考方案；所有信号来自本次 Amazon 公开页面。</p></div><StatusBadge tone={anchor.details?.extractionStatus === "complete" ? "success" : "warning"}>{anchor.details?.extractionStatus === "complete" ? "完整提取" : "部分提取"}</StatusBadge></div><div className="anchor-showcase"><div className="anchor-showcase-image"><ProductImage product={anchor} priority /></div><div className="anchor-showcase-copy"><span className="eyebrow">PRIMARY ANCHOR · {anchor.asin}</span><h3>{anchor.title}</h3><a href={anchor.url} target="_blank" rel="noreferrer">打开 Amazon 商品页 <ExternalLink size={14} /></a><dl><div><dt>价格</dt><dd>{anchor.priceText ?? "价格未显示"}</dd></div><div><dt>需求信号</dt><dd>{formatDemandSignal(anchor)}</dd></div><div><dt>在售信号</dt><dd>{formatListingSignal(anchor)}</dd></div><div><dt>评分 / 评论</dt><dd>{anchor.rating?.toFixed(1) ?? "--"} / {formatNumber(anchor.reviewCount)}</dd></div><div><dt>颜色变体</dt><dd>{formatColorSignal(anchor)}</dd></div><div><dt>详情完整度</dt><dd>{anchor.details ? `${anchor.details.completeness}%` : "待提取"}</dd></div></dl><div className="tag-list">{(anchor.featureCorrections ? extractDesignAttributes(productDesignText(anchor)) : anchor.details?.attributes.length ? anchor.details.attributes : featureFallback).map((tag) => <span key={tag}>{tag}</span>)}</div></div></div></section>}
    <section className="report-section design-section"><div className="section-heading"><div><h2>改款参考方案</h2><p>已生成的改款结果直接展示；改动说明在图下，竞品依据可展开查看。</p></div><StatusBadge tone="warning">AI 改款结果</StatusBadge></div><div className="design-grid">{proposals.map((item) => <article className="design-card" key={item.id}><div className="design-card-head"><strong>{item.id}</strong><span>{item.category}</span></div><DesignImageEditor key={`${analysis.generatedAt}:${item.id}:${item.action}`} anchor={anchor ?? item.product} proposal={item} reportId={analysis.generatedAt} presetJobId={item.demoJobId}><div className="design-copy"><StatusBadge tone={item.evidenceLevel === "verified" ? "success" : "warning"}>{item.evidenceLevel === "verified" ? (item.targetFeatures?.length ?? 1) > 1 ? "组合需求已查询 · 相对判断" : "单特征需求已查询" : "设计假设 · 需求未完整验证"}</StatusBadge><strong>{item.sourceFeature.includes("未识别") ? <>设计方向：{item.targetFeature}</> : <>{item.sourceFeature} <ArrowRight size={14} /> {item.targetFeature}</>}</strong>{item.scenario && !/核验|确认/.test(item.scenario) && <div className="proposal-scenario"><MapPin size={14} />适用场景：{item.scenario}</div>}<p>{item.action ?? shortTitle(item.product.title, 88)}</p>{item.retainedFeatures?.length ? <p>保留：{item.retainedFeatures.join("、")}</p> : null}{item.keywordDemandGroup && hasDemandGroupData(item.keywordDemandGroup) && <p>需求组：{item.keywordDemandGroup.label} · 合计周搜索 {formatKeywordMetric(item.keywordDemandGroup.totalWeeklySearchVolume)} · 竞争 {formatKeywordMetric(item.keywordDemandGroup.weightedCompetitiveDifficulty)}</p>}{item.keywordDemandGroup && hasDemandGroupData(item.keywordDemandGroup) ? <StatusBadge tone={demandGroupTone(item.keywordDemandGroup)}>{item.keywordDemandGroup.assessment} · 需求组口径</StatusBadge> : item.keywordEvidence && hasKeywordData(item.keywordEvidence) ? <div className="proposal-keyword-proof"><Waypoints size={14} /><span>{item.keywordEvidence.keyword}</span><b>{formatKeywordMetric(item.keywordEvidence.weeklySearchVolume)} 周搜索</b><StatusBadge tone={evidenceTone(item.keywordEvidence)}>{item.keywordEvidence.assessment}</StatusBadge></div> : <div className="proposal-keyword-proof is-missing"><AlertTriangle size={14} />关键词数据待验证</div>}<div className="tag-list">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><details className="proposal-evidence"><summary>查看改款依据与参考竞品</summary><p>{item.reason}</p><p>{item.evidence}</p><button type="button" className="proposal-reference" onClick={() => setCompare(item.product)}><div><ProductImage product={item.product} /></div><span>参考竞品 · 非改款结果<br />{shortTitle(item.product.title, 60)}</span></button></details></DesignImageEditor></article>)}</div></section>
    <section className="report-section"><div className="section-heading"><div><h2>改款依据说明表</h2><p>每个方案串联 Listing 设计依据、真实关键词指标、风险与执行动作，便于产品评审。</p></div></div><div className="table-scroll"><table className="data-table report-table rationale-table"><thead><tr><th>方案</th><th>改款方向</th><th>适用场景</th><th>为什么这样改</th><th>竞品验证</th><th>关键词验证</th><th>风险</th><th>参考商品价格（非核价）</th></tr></thead><tbody>{proposals.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td>{item.sourceFeature.includes("未识别") ? `${item.targetFeature}（先确认原款差异）` : `${item.sourceFeature} → ${item.targetFeature}`}</td><td>{item.scenario ?? "待人工确认"}</td><td>{item.reason}</td><td>{item.evidence}</td><td>{item.keywordDemandGroup && hasDemandGroupData(item.keywordDemandGroup) ? <><strong>{item.keywordDemandGroup.label}</strong><br />周搜索合计 {formatKeywordMetric(item.keywordDemandGroup.totalWeeklySearchVolume)} · 加权竞争 {formatKeywordMetric(item.keywordDemandGroup.weightedCompetitiveDifficulty)}<br /><StatusBadge tone={demandGroupTone(item.keywordDemandGroup)}>{item.keywordDemandGroup.assessment}</StatusBadge></> : item.keywordEvidence && hasKeywordData(item.keywordEvidence) ? <><strong>{item.keywordEvidence.keyword}</strong><br />周搜索 {formatKeywordMetric(item.keywordEvidence.weeklySearchVolume)} · 竞争 {formatKeywordMetric(item.keywordEvidence.competitiveDifficulty)}<br /><StatusBadge tone={evidenceTone(item.keywordEvidence)}>{item.keywordEvidence.assessment}</StatusBadge></> : "未匹配关键词证据"}</td><td><StatusBadge tone={item.risk === "低" ? "success" : item.risk === "中" ? "warning" : "neutral"}>{item.risk}</StatusBadge></td><td>{formatPriceRange(item.suggestedPriceMin, item.suggestedPriceMax)}</td></tr>)}</tbody></table></div></section>
<section className="report-section"><div className="section-heading"><div><h2>改款策略建议</h2><p>按本轮证据核验设计，再进行打样与成本确认。</p></div></div><div className="strategy-grid">{analysis.strategies.map((item) => <article className={`strategy-card tone-${item.tone}`} key={item.title}><div><Target size={20} /><strong>{item.title}</strong><span>{item.subtitle}</span></div><p>{item.body}</p><small>{item.proposalIds.length ? `推荐：${item.proposalIds.join(" > ")}` : "当前样本不足，暂不推荐方案"}</small></article>)}</div></section>
    {compare && anchor && <div className="compare-modal" role="dialog" aria-modal="true" aria-label="锚点与参考商品图对比"><button type="button" className="modal-close icon-button" onClick={() => setCompare(null)} aria-label="关闭对比" title="关闭"><X size={24} /></button><div className="compare-grid"><article><span className="compare-pill anchor-pill">锚点原图</span><div className="compare-image"><ProductImage product={anchor} priority /></div><p>{shortTitle(anchor.title, 62)}</p></article><article><span className="compare-pill proposal-pill">参考商品图</span><div className="compare-image"><ProductImage product={compare} priority /></div><p>{shortTitle(compare.title, 62)}</p></article></div></div>}
  </main>;
}

export default function SelectionWorkspace() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(1);
  const [keyword, setKeyword] = useState(DEFAULT_QUERY);
  const [products, setProducts] = useState<AmazonProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchors, setAnchors] = useState<AmazonProduct[]>([]);
  const [searchState, setSearchState] = useState<LoadState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionState>({});
  const [extracting, setExtracting] = useState(false);
  const [pageState, setPageState] = useState<PageState>({});
  const [competitorPages, setCompetitorPages] = useState<Record<number, AmazonProduct[]>>({});
  const [competitorRunning, setCompetitorRunning] = useState(false);
  const [allowPartialAnalysis, setAllowPartialAnalysis] = useState(false);
  const [keywordCandidates, setKeywordCandidates] = useState<KeywordCandidate[]>([]);
  const [keywordValidation, setKeywordValidation] = useState<KeywordValidationResult | null>(null);
  const [keywordValidationState, setKeywordValidationState] = useState<LoadState>("idle");
  const [keywordValidationError, setKeywordValidationError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisStageState>({});
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const evidenceRevision = useRef(0);
  function invalidateEvidence(maximumStep: number) {
    evidenceRevision.current++;
    setKeywordValidation(null); setKeywordValidationState("idle"); setAnalysis(null); setAnalysisProgress({}); setAnalysisError(null); setMaxStep(maximumStep);
    window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
  }
  function correctAnchorFeatures(asin: string, featureCorrections: Record<string, boolean>) {
    evidenceRevision.current++;
    setAnchors(items => items.map(item => item.asin === asin ? { ...item, featureCorrections } : item));
    setKeywordCandidates([]); setKeywordValidation(null); setKeywordValidationState("idle"); setAnalysis(null); setAnalysisProgress({}); setAnalysisError(null); setMaxStep(3);
    window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
  }
  const competitors = dedupeProducts(Object.values(competitorPages).flat());

  useEffect(() => {
    const savedKeyword = window.localStorage.getItem("amazon-selection-keyword");
    const savedTheme = window.localStorage.getItem("amazon-selection-theme");
    const savedReport = window.sessionStorage.getItem(REPORT_STORAGE_KEY);
    window.sessionStorage.removeItem("amazon-selection-report");
    if (savedKeyword) setKeyword(savedKeyword);
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    if (new URLSearchParams(window.location.search).has("demo")) {
      void loadDemo();
      return;
    }
    if (savedReport) {
      try {
        const restored = JSON.parse(savedReport) as { analysis: AnalysisResult; anchors: AmazonProduct[] };
        if (restored.analysis?.query && Array.isArray(restored.anchors)) {
          setAnalysis(restored.analysis); setAnchors(restored.anchors); setKeywordValidation(restored.analysis.keywordValidation ?? null); setMaxStep(6); setStep(6);
        }
      } catch { window.sessionStorage.removeItem(REPORT_STORAGE_KEY); }
    }
  }, []);
  useEffect(() => { window.localStorage.setItem("amazon-selection-keyword", keyword); }, [keyword]);
  useEffect(() => { window.localStorage.setItem("amazon-selection-theme", theme); }, [theme]);
  function advanceTo(next: number) { setStep(next); setMaxStep((value) => Math.max(value, next)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function loadDemo() {
    try {
      const data = await fetchJson<{ analysis: AnalysisResult; anchors: AmazonProduct[] }>("/api/demo/report");
      setAnalysis(data.analysis);
      setAnchors(data.anchors);
      setKeywordValidation(data.analysis.keywordValidation ?? null);
      setKeyword(data.analysis.query);
      setMaxStep(6);
      setStep(6);
      window.scrollTo({ top: 0 });
    } catch (error) {
      window.alert(error instanceof Error ? `演示报告加载失败：${error.message}` : "演示报告加载失败，请确认服务已启动。");
    }
  }

  async function runSearch() {
    invalidateEvidence(1);
    setSearchState("loading"); setSearchError(null);
    try {
      const data = await fetchJson<SearchResponse>(`/api/amazon/search?q=${encodeURIComponent(keyword)}&page=1`);
      setProducts(data.products); setFetchedAt(data.fetchedAt); setSelected(new Set()); setSearchState("success");
      setCompetitorPages({}); setPageState({}); setKeywordCandidates([]); setKeywordValidation(null); setAnalysis(null);
    } catch (error) { setSearchError(error instanceof Error ? error.message : "搜索失败，请稍后重试。"); setSearchState("error"); }
  }
  function toggleProduct(item: AmazonProduct) {
    setSelected((current) => { const next = new Set(current); if (next.has(item.asin)) next.delete(item.asin); else if (next.size < 9) next.add(item.asin); return next; });
  }
  function openExtraction() { invalidateEvidence(2); setAnchors(products.filter((item) => selected.has(item.asin))); setExtraction({}); advanceTo(2); }
  async function extractAnchors() {
    invalidateEvidence(3);
    setExtracting(true);
    for (const item of anchors) {
      setExtraction((current) => ({ ...current, [item.asin]: { state: "loading", message: "正在读取 Amazon 详情页" } }));
      try {
        const data = await fetchJson<{ details?: AmazonProduct["details"] }>(`/api/amazon/product?asin=${item.asin}&image=${encodeURIComponent(item.image)}`);
        if (!data.details) throw new Error("详情提取失败");
        setAnchors((current) => current.map((product) => product.asin === item.asin ? { ...product, details: data.details } : product));
        setExtraction((current) => ({ ...current, [item.asin]: { state: "success", message: data.details?.extractionStatus === "complete" ? `基础字段已提取 · 覆盖率 ${data.details.completeness}%` : `基础字段部分提取 · 覆盖率 ${data.details?.completeness ?? 0}% · 其余字段 本次未取得` } }));
      } catch (error) { setExtraction((current) => ({ ...current, [item.asin]: { state: "error", message: error instanceof Error ? error.message : "提取失败" } })); }
    }
    setExtracting(false);
  }
  async function fetchCompetitorPage(page: number) {
    setPageState((current) => ({ ...current, [page]: { state: "loading", count: 0, message: "正在校验并解析 Amazon 搜索页" } }));
    try {
      const data = await fetchJson<SearchResponse>(`/api/amazon/search?q=${encodeURIComponent(keyword)}&page=${page}`);
      const source = data.source === "amazon-reader" ? "备用读取通道" : "Amazon 实时页面";
      setPageState((current) => ({ ...current, [page]: { state: "success", count: data.products.length, message: data.cached ? `完成 · 缓存 · ${source}` : `完成 · ${source} · ${data.attempts} 次尝试` } }));
      return data.products;
    } catch (error) {
      setPageState((current) => ({ ...current, [page]: { state: "error", count: 0, message: error instanceof Error ? error.message : "页面采集失败" } }));
      return null;
    }
  }
  async function collectCompetitors() {
    invalidateEvidence(3);
    setCompetitorRunning(true); setCompetitorPages({}); setPageState({}); setAllowPartialAnalysis(false);
    setKeywordCandidates([]); setKeywordValidation(null); setAnalysis(null);
    for (const page of [1, 2, 3]) {
      const items = await fetchCompetitorPage(page);
      if (items) setCompetitorPages((current) => ({ ...current, [page]: items }));
    }
    setCompetitorRunning(false);
  }
  async function retryCompetitorPage(page: number) {
    invalidateEvidence(3);
    setCompetitorRunning(true);
    const items = await fetchCompetitorPage(page);
    if (items) setCompetitorPages((current) => ({ ...current, [page]: items }));
    setCompetitorRunning(false);
  }
  function openKeywordValidation() {
    setKeywordCandidates(generateKeywordCandidates(keyword, competitors, anchors));
    setKeywordValidation(null); setKeywordValidationState("idle"); setKeywordValidationError(null);
    advanceTo(4);
  }
  function updateKeywordCandidates(items: KeywordCandidate[]) {
    invalidateEvidence(4);
    setKeywordCandidates(items); setKeywordValidation(null); setKeywordValidationState("idle"); setKeywordValidationError(null);
  }
  async function validateKeywords() {
    const revision = evidenceRevision.current;
    const candidates = keywordCandidates.filter((item) => item.selected && item.keyword.trim().length >= 3);
    setKeywordValidationState("loading"); setKeywordValidationError(null);
    try {
      const data = await fetchJson<KeywordValidationResult>("/api/keywords/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates }) });
      if (revision !== evidenceRevision.current) return;
      setKeywordValidation(data); setKeywordValidationState(data.status === "failed" || data.status === "unconfigured" ? "error" : "success");
    } catch (error) {
      setKeywordValidationError(error instanceof Error ? error.message : "关键词验证失败，请稍后重试。"); setKeywordValidationState("error");
    }
  }
  function skippedValidation(): KeywordValidationResult {
    return { provider: "西柚洞察", country: "US", status: "skipped", message: "本轮由用户选择跳过关键词验证，报告不判断关键词空白机会。", requestedAt: new Date().toISOString(), fetchedAt: null, cached: false, candidates: keywordCandidates, evidence: [] };
  }
  async function runAnalysis(validationInput?: KeywordValidationResult) {
    const revision = evidenceRevision.current;
    const activeValidation = validationInput ?? keywordValidation ?? skippedValidation();
    if (validationInput) setKeywordValidation(validationInput);
    advanceTo(5); setAnalysis(null); setAnalysisError(null); setAnalysisProgress({});
    try {
      const response = await fetchApi("/api/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: keyword, products: competitors, anchors, keywordValidation: activeValidation }) });
      if (!response.body) throw new Error("分析服务未返回任务进度");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AnalysisResult | null = null;
      let streamError: string | null = null;
      const applyEvent = (event: AnalysisStreamEvent) => {
        if (revision !== evidenceRevision.current) return;
        if (event.type === "stage") {
          setAnalysisProgress((current) => ({ ...current, [event.index]: { status: event.status, processed: event.processed, summary: event.summary, durationMs: event.durationMs } }));
        } else if (event.type === "result") finalResult = event.result;
        else streamError = event.error;
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as AnalysisStreamEvent);
        if (done) break;
      }
      if (buffer.trim()) applyEvent(JSON.parse(buffer) as AnalysisStreamEvent);
      if (revision !== evidenceRevision.current) return;
      if (streamError) throw new Error(streamError);
      if (!finalResult) throw new Error("分析任务完成但没有生成报告");
      setAnalysis(finalResult); setMaxStep(6);
      window.sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify({ analysis: finalResult, anchors }));
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : "分析失败，请返回竞品搜索后重试。"); }
  }

  return <div className={`app-shell theme-${theme} ${step === 6 ? "report-mode" : ""}`}>
    <StepHeader current={step} maxStep={maxStep} theme={theme} onNavigate={setStep} onToggleTheme={() => setTheme((value) => value === "light" ? "dark" : "light")} />
    <RequirementsDialog key={step} step={step} />
    {step === 0 && <Overview onStart={() => advanceTo(1)} onDemo={() => void loadDemo()} />}
    {step === 1 && <CollectionPage keyword={keyword} setKeyword={setKeyword} products={products} selected={selected} state={searchState} error={searchError} fetchedAt={fetchedAt} onSearch={runSearch} onToggle={toggleProduct} onNext={openExtraction} />}
    {step === 2 && <ExtractionPage anchors={anchors} extraction={extraction} extracting={extracting} onCorrect={correctAnchorFeatures} onExtract={extractAnchors} onNext={() => advanceTo(3)} />}
    {step === 3 && <CompetitorPage keyword={keyword} pageState={pageState} products={competitors} running={competitorRunning} allowPartial={allowPartialAnalysis} onRun={collectCompetitors} onRetryPage={retryCompetitorPage} onAllowPartial={setAllowPartialAnalysis} onNext={openKeywordValidation} />}
    {step === 4 && <KeywordValidationPage candidates={keywordCandidates} validation={keywordValidation} state={keywordValidationState} error={keywordValidationError} onChange={updateKeywordCandidates} onValidate={validateKeywords} onContinue={() => runAnalysis()} onSkip={() => runAnalysis(skippedValidation())} />}
    {step === 5 && <AnalysisPage stageProgress={analysisProgress} analysis={analysis} error={analysisError} onRetry={() => runAnalysis()} onReport={() => advanceTo(6)} />}
    {step === 6 && analysis && <ReportPage analysis={analysis} anchors={anchors} />}
    <footer className="app-footer"><span><span className="live-dot" />Amazon US 公开数据连接</span><span><Info size={13} />数据仅用于内部选品演示，请以 Amazon 页面为准</span></footer>
  </div>;
}
