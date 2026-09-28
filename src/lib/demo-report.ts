import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { analyzeProducts } from "./analysis";
import type {
  AmazonProduct,
  AnalysisResult,
  DesignProposal,
  KeywordValidationResult,
  ProductDetails,
  SearchResponse,
} from "@/types/product";

export const DEMO_QUERY = "Womens Puff Long Sleeve Button Down Shirts";
export const DEMO_ANCHOR_ASIN = "B0FF9S1DVQ";
// 预置改款图任务 id（对应 .runtime/design-images 下的演示改款图）
export const DEMO_JOB_ID =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const DEMO_EDIT_PROMPT =
  "把衬衫的颜色改成深海军蓝色，衣领、袖型、版型、模特姿势和背景保持不变";

// 固化的真实锚点详情（2026-09-18 从 Amazon 详情页抓取），
// 让演示报告完全离线、不依赖实时采集网络。
const DEMO_ANCHOR_DETAILS: ProductDetails = {
  brand: "Tankaneo",
  bullets: [],
  colorCount: 12,
  colors: [
    "Red", "Black", "Khaki", "Light Khaki", "Olive Green", "Pink",
    "Purple", "Sky Blue", "White", "Army Green", "Light Blue", "Orange",
  ],
  bsr: "#23,821 in Clothing, Shoes & Jewelry (See Top 100 in Clothing, Shoes & Jewelry)",
  firstAvailable: null,
  availability: null,
  attributes: ["泡泡袖", "长袖", "纽扣门襟"],
  source: "amazon-direct",
  completeness: 67,
  extractionStatus: "complete",
};

async function loadCachedProducts(query: string): Promise<AmazonProduct[]> {
  const cacheDir = path.join(process.cwd(), ".runtime", "search-cache");
  let files: string[] = [];
  try {
    files = (await readdir(cacheDir)).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const products: AmazonProduct[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(cacheDir, file), "utf8");
      const response = JSON.parse(raw) as SearchResponse;
      if (response.query?.toLowerCase() === query.toLowerCase() && [1, 2, 3].includes(response.page)) {
        products.push(...response.products);
      }
    } catch {
      // 单个缓存文件损坏不应影响整体
    }
  }
  return Array.from(new Map(products.map((product) => [product.asin, product])).values());
}

function highResImage(image: string) {
  return image.replace(/\._AC_[^.]+_\./, "._AC_UL1500_.");
}

function buildDemoProposal(anchor: AmazonProduct): DesignProposal {
  return {
    id: "方案1",
    product: anchor,
    category: "微调优化",
    sourceFeature: "颜色",
    targetFeature: "深海军蓝",
    targetFeatures: ["深海军蓝"],
    scenario: "按锚点定位核验",
    reason:
      "锚点自身拥有 12 个颜色变体（含 Black、Sky Blue、Light Blue 等），深海军蓝属于其中同系百搭色，作为低风险换色改款方向。此方向基于锚点自身颜色变体证据，不代表市场空白或成功率，需核验工艺与打样效果。",
    evidence: `${anchor.asin} · 锚点商品 12 色变体（Black / Sky Blue / Light Blue / Navy 系）`,
    risk: "待核验",
    suggestedPriceMin: anchor.price,
    suggestedPriceMax: anchor.price,
    tags: ["颜色", "深海军蓝"],
    retainedFeatures: ["泡泡袖", "长袖", "纽扣门襟"],
    evidenceLevel: "hypothesis",
    action: DEMO_EDIT_PROMPT,
    keywordEvidence: null,
    demoJobId: DEMO_JOB_ID,
  };
}

export type DemoReportPayload = {
  analysis: AnalysisResult;
  anchors: AmazonProduct[];
};

export async function buildDemoReport(): Promise<DemoReportPayload> {
  const products = await loadCachedProducts(DEMO_QUERY);
  const cachedAnchor = products.find((product) => product.asin === DEMO_ANCHOR_ASIN);
  const anchors: AmazonProduct[] = cachedAnchor
    ? [{ ...cachedAnchor, image: highResImage(cachedAnchor.image), details: { ...DEMO_ANCHOR_DETAILS } }]
    : [];

  const keywordValidation: KeywordValidationResult = {
    provider: "西柚洞察",
    country: "US",
    status: "skipped",
    message: "演示报告：未执行关键词验证，仅使用 Amazon 公开页面信号，不判断关键词空白机会。",
    requestedAt: new Date().toISOString(),
    fetchedAt: null,
    cached: false,
    candidates: [],
    evidence: [],
  };

  const analysis = analyzeProducts(DEMO_QUERY, products, anchors, keywordValidation);
  if (anchors.length) {
    analysis.designProposals = [buildDemoProposal(anchors[0])];
    analysis.strategies = [
      {
        title: "先核验，再打样",
        subtitle: "演示版 · 改款图来自历史测试结果",
        body: "本报告为演示回放：市场统计来自真实前三页竞品样本，改款图来自预先完成的真实改款测试（非本次实时生成）。逐项核对锚点改前状态，用同一基准制作对照样后再决定是否上架测试。",
        proposalIds: analysis.designProposals.map((item) => item.id),
        tone: "neutral",
      },
    ];
  }
  return { analysis, anchors };
}
