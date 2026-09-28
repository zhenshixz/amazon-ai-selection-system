import "server-only";

import { analyzeProducts } from "@/lib/analysis";
import { refineDesignProposals } from "@/lib/design-model";
import { getAmazonProductDetails } from "@/lib/amazon";
import type { AmazonProduct, AnalysisResult, AnalysisStageTiming, KeywordValidationResult } from "@/types/product";

export const ANALYSIS_STAGES = [
  "数据清洗与标准化",
  "价格与需求指标统计",
  "竞品详情与设计特征补充",
  "价格带竞争格局分析",
  "市场结构与机会识别",
  "锚点商品交叉对比",
  "选品建议与参考方案生成",
] as const;

type Progress = (event: {
  index: number;
  status: "running" | "complete";
  name: string;
  processed: number;
  summary: string;
  durationMs?: number;
}) => void;

function demandValue(product: AmazonProduct) {
  return product.monthlyBought ?? product.reviewCount ?? 0;
}

function dedupeValidProducts(products: AmazonProduct[]) {
  return Array.from(
    new Map(
      products
        .filter((product) => /^[A-Z0-9]{10}$/.test(product.asin) && product.title && product.image)
        .map((product) => [product.asin, product]),
    ).values(),
  );
}

export async function runAnalysisPipeline(
  query: string,
  products: AmazonProduct[],
  anchors: AmazonProduct[],
  keywordValidation: KeywordValidationResult | undefined,
  onProgress: Progress,
): Promise<AnalysisResult> {
  const startedAt = new Date();
  const timings: AnalysisStageTiming[] = [];
  let workingProducts = products;
  let result: AnalysisResult | null = null;

  async function stage<T>(
    index: number,
    processed: number,
    startSummary: string,
    work: () => Promise<{ value: T; summary: string; processed?: number }> | { value: T; summary: string; processed?: number },
  ) {
    const name = ANALYSIS_STAGES[index];
    onProgress({ index, status: "running", name, processed, summary: startSummary });
    const stageStart = performance.now();
    const output = await work();
    const durationMs = Math.max(1, Math.round(performance.now() - stageStart));
    const actualProcessed = output.processed ?? processed;
    timings.push({ name, durationMs, processed: actualProcessed, summary: output.summary });
    onProgress({ index, status: "complete", name, processed: actualProcessed, summary: output.summary, durationMs });
    return output.value;
  }

  workingProducts = await stage(0, products.length, "校验 ASIN、标题、图片并执行去重", () => {
    const anchorDetails = new Map(anchors.map((item) => [item.asin, item.details]));
    const cleaned = dedupeValidProducts(products).map((item) => ({ ...item, details: anchorDetails.get(item.asin) ?? item.details, featureCorrections: anchors.find(anchor => anchor.asin === item.asin)?.featureCorrections ?? item.featureCorrections }));
    return { value: cleaned, summary: `${products.length} 条输入清洗为 ${cleaned.length} 个有效 ASIN` };
  });

  await stage(1, workingProducts.length, "统计价格、公开购买量、评分和评论覆盖率", () => {
    const prices = workingProducts.filter((product) => product.price !== null).length;
    const demands = workingProducts.filter((product) => product.monthlyBought !== null).length;
    return {
      value: null,
      summary: `价格 ${prices}/${workingProducts.length}，公开购买量 ${demands}/${workingProducts.length}`,
    };
  });

  const enriched = await stage(2, workingProducts.length, "为高需求样本补充 Listing 详情和设计字段", async () => {
    const candidates = [...workingProducts]
      .filter((product) => !product.details)
      .sort((a, b) => demandValue(b) - demandValue(a))
      .slice(0, 12);
    const detailsByAsin = new Map<string, AmazonProduct["details"]>();
    for (let offset = 0; offset < candidates.length; offset += 3) {
      const batch = candidates.slice(offset, offset + 3);
      const settled = await Promise.allSettled(batch.map((product) => getAmazonProductDetails(product.asin)));
      settled.forEach((entry, index) => {
        if (entry.status === "fulfilled") detailsByAsin.set(batch[index].asin, entry.value);
      });
      onProgress({
        index: 2,
        status: "running",
        name: ANALYSIS_STAGES[2],
        processed: Math.min(offset + batch.length, candidates.length),
        summary: `已检查 ${Math.min(offset + batch.length, candidates.length)}/${candidates.length} 个高需求 Listing`,
      });
    }
    const merged = workingProducts.map((product) => {
      const details = detailsByAsin.get(product.asin);
      return details ? { ...product, details } : product;
    });
    return {
      value: merged,
      processed: candidates.length,
      summary: `补充 ${detailsByAsin.size}/${candidates.length} 个高需求 Listing 详情`,
    };
  });
  workingProducts = enriched;

  await stage(3, workingProducts.length, "计算价格分层、需求代理指标和竞争门槛", () => {
    const prices = workingProducts.flatMap((product) => product.price === null ? [] : [product.price]);
    const range = prices.length ? `$${Math.min(...prices).toFixed(2)}-$${Math.max(...prices).toFixed(2)}` : "无有效价格";
    return { value: null, summary: `完成 ${workingProducts.length} 款商品价格与竞争计算，区间 ${range}` };
  });

  result = await stage(4, workingProducts.length, "归一化颜色、领口、袖型、面料、版型和设计元素", () => {
    const analyzed = analyzeProducts(query, workingProducts, anchors, keywordValidation);
    const signals = analyzed.attributeGroups.reduce((sum, group) => sum + group.items.length, 0);
    return { value: analyzed, summary: `生成 ${analyzed.attributeGroups.length} 组属性、${signals} 个有效特征信号` };
  });

  await stage(5, anchors.length, "将锚点属性与高需求竞品逐项比较", () => {
    const matched = result?.designProposals.length ?? 0;
    return { value: null, summary: `${anchors.length} 个锚点形成 ${matched} 个有竞品证据的参考方向` };
  });

  const modelStatus = await stage(6, result.designProposals.length, "DeepSeek 正在根据商品与需求组证据生成具体改款动作", async () => {
    const summary = await refineDesignProposals(result!, anchors);
    return { value: summary, summary };
  });
  result.insights = result.designProposals.map((item) => ({ title: `${item.id}：${item.targetFeature}`, body: `${item.action} ${item.reason}`, tone: "neutral" as const }));
  result.insights.push({ title: "生成状态与证据边界", body: modelStatus, tone: "neutral" });
  result.strategies = [{ title: "先核验，再打样", subtitle: "工艺与成本待验证", body: "逐项核对锚点改前状态，用同一基准制作对照样；记录工艺、成本和试穿反馈后再决定是否上架测试。关键词数据只支持已查询的需求方向。", proposalIds: result.designProposals.map((item) => item.id), tone: "neutral" }];

  const completedAt = new Date();
  result.analysisMeta = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    method: `确定性统计 + Listing 详情补充；${modelStatus}`,
    stageTimings: timings,
  };
  return result;
}
