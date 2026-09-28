import { FEATURE_RULES, extractDesignAttributes, featureDimension, generateKeywordCandidates, productDesignText } from "./keyword-candidates";
import type {
  AmazonProduct,
  AnalysisResult,
  DesignProposal,
  DistributionItem,
  KeywordDemandGroup,
  KeywordEvidence,
  KeywordValidationResult,
} from "@/types/product";

const featureRules: Array<[string, RegExp]> = [
  ["泡泡袖", /puff/i], ["纽扣衬衫", /button[ -]?down|button up/i],
  ["荷叶边", /ruffle/i], ["V 领", /v[ -]?neck/i], ["翻领", /collar/i],
  ["宽松版型", /loose|oversized|relaxed/i], ["Smocked", /smock/i],
  ["七分袖", /3\/4|three quarter/i],
];

const patternRules: Array<[string, RegExp]> = [
  ["条纹", /stripe|striped/i], ["纯色", /solid|plain/i],
  ["花卉", /floral|flower/i], ["格纹", /plaid|checkered|gingham/i],
  ["波点", /polka dot/i], ["镂空/蕾丝", /eyelet|lace/i],
];

const colorRules: Array<[string, RegExp]> = [
  ["白色", /\b(?:white|ivory)\b/i], ["蓝色", /\b(?:blue|navy)\b/i], ["黑色", /\bblack\b/i],
  ["绿色", /\bgreen\b/i], ["粉色", /\bpink\b/i], ["红色", /\b(?:red|burgundy)\b/i],
  ["米色", /\b(?:beige|khaki|cream)\b/i], ["灰色", /\b(?:gray|grey)\b/i],
];

const necklineRules: Array<[string, RegExp]> = [
  ["V 领", /v[ -]?neck/i], ["经典翻领", /collar|lapel/i],
  ["圆领", /crew[ -]?neck|round[ -]?neck/i],
  ["U 领 / Scoop", /scoop[ -]?neck/i],
  ["立领", /mock[ -]?neck|stand collar|mandarin collar/i],
  ["亨利领", /henley/i], ["方领", /square[ -]?neck/i],
];

const materialRules: Array<[string, RegExp]> = [
  ["棉质", /cotton/i], ["亚麻/棉麻", /linen/i], ["涤纶", /polyester/i],
  ["雪纺", /chiffon/i], ["蕾丝", /lace|eyelet/i], ["针织", /knit/i],
];

const sleeveRules: Array<[string, RegExp]> = [
  ["短袖", /short[ -]?sleeve/i], ["长袖", /long[ -]?sleeve/i],
  ["无袖", /sleeveless|tank top/i], ["盖肩袖", /cap[ -]?sleeve/i],
  ["泡泡袖", /puff/i], ["Smocked 袖口", /smock/i], ["荷叶边袖口", /ruffle/i],
  ["七分袖", /3\/4|three quarter/i], ["喇叭袖", /bell sleeve/i],
  ["灯笼袖", /lantern sleeve|balloon sleeve/i],
];



const scenarioRules: Array<[string, RegExp]> = [
  ["通勤 / 商务", /\b(?:office|work|business|formal|dressy)\b/i],
  ["日常休闲", /\b(?:casual|everyday|daily)\b/i],
  ["高尔夫 / 运动", /\b(?:golf|athletic|sport|workout|gym|performance)\b/i],
  ["旅行 / 度假", /\b(?:travel|vacation|resort|cruise)\b/i],
  ["户外活动", /\b(?:outdoor|hiking|camping|fishing)\b/i],
  ["派对 / 约会", /\b(?:party|club|date night|cocktail)\b/i],
  ["海滩场景", /\b(?:beach|seaside)\b/i],
  ["校园场景", /\b(?:school|campus|college)\b/i],
];

function productText(product: AmazonProduct) {
  return productDesignText(product);
}

function distribution(products: AmazonProduct[], rules: Array<[string, RegExp]>) {
  return rules
    .map(([name, pattern]) => ({
      name,
      value: products.filter((product) => pattern.test(productText(product))).length,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function colorSkuDistribution(products: AmazonProduct[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    const colorTexts = product.details?.colors.length ? product.details.colors : [product.title];
    const matched = new Set<string>();
    for (const text of colorTexts) {
      for (const [name, pattern] of colorRules) {
        if (pattern.test(text)) matched.add(name);
      }
    }
    for (const name of matched) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildPriceBands(products: AmazonProduct[]): DistributionItem[] {
  const bands = [
    { name: "$0-19", min: 0, max: 20 }, { name: "$20-29", min: 20, max: 30 },
    { name: "$30-39", min: 30, max: 40 }, { name: "$40-59", min: 40, max: 60 },
    { name: "$60+", min: 60, max: Number.POSITIVE_INFINITY },
  ];
  return bands.map((band) => ({
    name: band.name,
    value: products.filter((product) => product.price !== null && product.price >= band.min && product.price < band.max).length,
  }));
}

function inferBrand(product: AmazonProduct) {
  const fromDetails = product.details?.brand?.replace(/ Store$/i, "").trim();
  if (fromDetails) return fromDetails;
  return product.title.split(/\s+/)[0].replace(/[^a-z0-9'-]/gi, "") || "Unknown";
}

function demandValue(product: AmazonProduct) {
  return product.monthlyBought ?? product.reviewCount ?? 0;
}

function buildSweetSpot(products: AmazonProduct[], med: number | null) {
  const demandPrices = [...products]
    .filter((product) => product.monthlyBought !== null && product.price !== null)
    .sort((a, b) => demandValue(b) - demandValue(a))
    .slice(0, 5)
    .flatMap((product) => product.price === null ? [] : [product.price]);
  if (demandPrices.length >= 3) {
    return { min: Math.min(...demandPrices), max: Math.max(...demandPrices), sampleCount: demandPrices.length };
  }
  return {
    min: med === null ? null : Number((med * 0.85).toFixed(2)),
    max: med === null ? null : Number((med * 1.15).toFixed(2)),
    sampleCount: demandPrices.length,
  };
}

function buildDesignProposals(
  products: AmazonProduct[],
  anchors: AmazonProduct[],
  med: number | null,
  keywordValidation?: KeywordValidationResult,
  query = "",
): DesignProposal[] {
  const anchor = anchors[0];
  if (!anchor) return [];
  const anchorFeatures = extractDesignAttributes(productText(anchor));
  const generated = [...generateKeywordCandidates(query, products, anchors), ...(keywordValidation?.candidates ?? []).filter(item => item.sourceLabels.every(label => FEATURE_RULES.some(rule => rule.label === label)))];
  const candidates = generated.filter((item) => item.source === "design-feature" || item.source === "design-combination");
  const directions = Array.from(new Map(candidates.map((item) => [[...item.sourceLabels].sort().join("|"), item])).values());
  const priority = { "优先验证": 4, "需求高但竞争强": 3, "低竞争待验证": 2, "暂缓观察": 1, "数据不足": 0 };
  // A picture cannot demonstrate a fibre composition or functional performance change.
  // Keep those keywords in market validation, but require a visible change for image proposals.
  return directions.filter((item) => item.sourceLabels.some(label => !anchorFeatures.includes(label) && !["面料", "功能", "场景"].includes(featureDimension(label))) && item.dimension !== "场景")
    .map((item) => {
      const targetFeature = item.sourceLabels.join(" + ");
      const product = products.find((entry) => !anchors.some((a) => a.asin === entry.asin) && item.sourceLabels.every(label => extractDesignAttributes(productText(entry)).includes(label)));
      const group = keywordValidation?.demandGroups?.find((group) => group.id === item.demandGroupId) ?? null;
      const verified = Boolean(group?.matchedKeywords.length && group.totalWeeklySearchVolume !== null && group.weightedCompetitiveDifficulty !== null && group.periodFrom && group.periodTo);
      return { item, targetFeature, product, group, verified };
    })
    .filter((entry): entry is typeof entry & { product: AmazonProduct } => Boolean(entry.product) && (entry.item.source !== "design-combination" || entry.verified))
    .sort((a, b) => Number(b.verified) - Number(a.verified)
      || (b.group?.periodTo ?? "").localeCompare(a.group?.periodTo ?? "")
      || (priority[b.group?.assessment ?? "数据不足"] - priority[a.group?.assessment ?? "数据不足"])
      || Number(b.item.source === "design-combination") - Number(a.item.source === "design-combination"))
    .slice(0, 3).map(({ item, targetFeature, product, group, verified }, index) => {
      const changes = item.sourceLabels.filter(label => !anchorFeatures.includes(label));
      const dimensions = new Set(changes.map(featureDimension));
      const sourceFeatures = anchorFeatures.filter((label) => dimensions.has(featureDimension(label)) && !item.sourceLabels.includes(label));
      const retainedFeatures = anchorFeatures.filter((label) => !dimensions.has(featureDimension(label)) || item.sourceLabels.includes(label));
      const sourceFeature = sourceFeatures.join(" / ") || "锚点该项未识别";
      const keywordEvidence = keywordValidation?.evidence.find((proof) => proof.status === "matched" && proof.sourceLabels.length === item.sourceLabels.length && item.sourceLabels.every(label => proof.sourceLabels.includes(label))) ?? null;
      const quote = item.evidenceQuotes?.find((proof) => proof.asin === product.asin)?.text ?? product.title;
      return {
        id: `方案${index + 1}`, product, category: item.source === "design-combination" ? "差异化竞争" : "微调优化",
        targetFeatures: item.sourceLabels, evidenceLevel: verified ? "verified" : "hypothesis",
        sourceFeature, targetFeature, retainedFeatures,
        action: `以 ${anchor.asin} 原图为基准，${changes.map(label => `将${featureDimension(label)}调整为“${label}”`).join("；")}。${item.sourceLabels.filter(label => anchorFeatures.includes(label)).map(label => `保留已有${label}。`).join("")}目标为${targetFeature}。其余结构、模特和背景保持一致；先核验原图，如已具备目标则停止，不另加改动。`,
        scenario: "按锚点定位核验",
        reason: `参考 ${product.asin} 的“${targetFeature}”设计。${verified && group ? `对应${item.source === "design-combination" ? "独立组合" : "单特征"}需求组：${group.periodFrom}至${group.periodTo}，${group.matchedKeywords.length}个表达，周搜索${group.totalWeeklySearchVolume}、竞争${group.weightedCompetitiveDifficulty?.toFixed(1)}；${group.assessment}（本批同期相对判断）。` : "设计假设：本方向尚无完整需求与竞争证据。"}需核验工艺、成本与打样效果，不代表市场空白或成功率。`,
        evidence: `${product.asin} · Listing：${quote}`,
        risk: "待核验", suggestedPriceMin: product.price ?? med, suggestedPriceMax: product.price ?? med,
        tags: [item.dimension ?? "设计", targetFeature], keywordEvidence, keywordDemandGroup: group,
      };
    });
}

function strongestKeyword(evidence: KeywordEvidence[]) {
  const priority = evidence.filter((item) => item.assessment === "优先验证");
  return [...(priority.length ? priority : evidence.filter((item) => item.status === "matched"))]
    .sort((a, b) => (b.weeklySearchVolume ?? -1) - (a.weeklySearchVolume ?? -1))[0];
}

function strongestDemandGroup(groups: KeywordDemandGroup[]) {
  const priority = groups.filter((item) => item.assessment === "优先验证");
  return [...(priority.length ? priority : groups.filter((item) => item.totalWeeklySearchVolume !== null))]
    .sort((a, b) => (b.totalWeeklySearchVolume ?? -1) - (a.totalWeeklySearchVolume ?? -1))[0];
}

export function analyzeProducts(
  query: string,
  products: AmazonProduct[],
  anchors: AmazonProduct[] = [],
  keywordValidation?: KeywordValidationResult,
): AnalysisResult {
  const startedAt = new Date().toISOString();
  const uniqueProducts = Array.from(new Map(products.map((product) => [product.asin, product])).values());
  const uniqueAnchors = Array.from(new Map(anchors.map((product) => [product.asin, product])).values());
  const prices = uniqueProducts.flatMap((product) => product.price === null ? [] : [product.price]);
  const ratings = uniqueProducts.flatMap((product) => product.rating === null ? [] : [product.rating]);
  const sortedByDemand = [...uniqueProducts].sort((a, b) => demandValue(b) - demandValue(a));
  const anchorDemand = [...uniqueAnchors].sort((a, b) => demandValue(b) - demandValue(a));
  const patternDistribution = distribution(uniqueProducts, patternRules);
  const featureDistribution = distribution(uniqueProducts, featureRules);
  const colorDistribution = distribution(uniqueProducts, colorRules);
  const necklineDistribution = distribution(uniqueProducts, necklineRules);
  const materialDistribution = distribution(uniqueProducts, materialRules);
  const sleeveDistribution = distribution(uniqueProducts, sleeveRules);
  const scenarioDistribution = distribution(uniqueProducts, scenarioRules);
  const colorProducts = Array.from(new Map(
    [...uniqueProducts, ...uniqueAnchors].map((product) => [product.asin, product]),
  ).values());
  const skuColors = colorSkuDistribution(colorProducts);
  const dominantPattern = patternDistribution[0];
  const dominantSleeve = sleeveDistribution[0];
  const dominantColor = skuColors[0] ?? colorDistribution[0];
  const dominantMaterial = materialDistribution[0];
  const med = median(prices);
  const priceSweetSpot = buildSweetSpot(uniqueProducts, med);
  const reportCoverage = (product: AmazonProduct) =>
    (product.monthlyBought !== null ? 4 : 0)
    + (product.details?.firstAvailable ? 2 : 0)
    + (product.details?.colorCount ? 2 : 0)
    + (product.details?.bsr ? 2 : 0)
    + (product.price !== null ? 1 : 0)
    + (product.reviewCount !== null ? 1 : 0);
  const supportingProducts = sortedByDemand
    .filter((item) => !uniqueAnchors.some((anchor) => anchor.asin === item.asin))
    .sort((a, b) => reportCoverage(b) - reportCoverage(a) || demandValue(b) - demandValue(a));
  const detailProducts = uniqueAnchors.length
    ? [...uniqueAnchors, ...supportingProducts].slice(0, 9)
    : supportingProducts.slice(0, 9);
  const designProposals = buildDesignProposals(uniqueProducts, uniqueAnchors, med, keywordValidation, query);
  const successfulPages = Array.from(new Set(uniqueProducts.map((product) => product.page))).sort();
  const enrichedProducts = [...uniqueAnchors, ...uniqueProducts].filter((product) => product.details).length;
  const priceCoverage = Math.round((prices.length / Math.max(uniqueProducts.length, 1)) * 100);
  const demandCoverage = Math.round((uniqueProducts.filter((product) => product.monthlyBought !== null).length / Math.max(uniqueProducts.length, 1)) * 100);
  const detailCoverage = Math.round((uniqueProducts.filter((product) => product.details).length / Math.max(uniqueProducts.length, 1)) * 100);
  const conclusionConfidence = successfulPages.length === 3 && priceCoverage >= 70 && detailCoverage >= 5
    ? "高" as const
    : successfulPages.length >= 2 && priceCoverage >= 50 ? "中" as const : "低" as const;
  const marketPoints = sortedByDemand
    .filter((product) => product.price !== null)
    .slice(0, 60)
    .map((product) => ({
      asin: product.asin,
      title: product.title,
      price: product.price ?? 0,
      demand: demandValue(product),
      competition: Math.min(100, Math.round(Math.log10((product.reviewCount ?? 0) + 1) * 22 + (product.isSponsored ? 18 : 0))),
      rating: product.rating ?? 0,
      reviewCount: product.reviewCount ?? 0,
    }));
  const newestProduct = [...uniqueProducts]
    .filter((product) => product.details?.firstAvailable)
    .sort((a, b) => new Date(b.details?.firstAvailable ?? 0).getTime() - new Date(a.details?.firstAvailable ?? 0).getTime())[0];
  const topEvidence = sortedByDemand[0];
  const demandOpportunity = strongestDemandGroup(keywordValidation?.demandGroups ?? []);
  const keywordOpportunity = strongestKeyword(keywordValidation?.evidence ?? []);

  return {
    generatedAt: new Date().toISOString(), query, productCount: uniqueProducts.length,
    brandCount: new Set(uniqueProducts.map(inferBrand)).size,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    medianPrice: med,
    averageRating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    monthlyBoughtTotal: uniqueProducts.reduce((sum, product) => sum + (product.monthlyBought ?? 0), 0),
    topProduct: anchorDemand[0] ?? sortedByDemand[0] ?? null,
    priceBands: buildPriceBands(uniqueProducts), patternDistribution, featureDistribution,
    colorDistribution, necklineDistribution, materialDistribution, sleeveDistribution,
    colorSkuDistribution: skuColors,
    attributeGroups: Array.from(new Set(FEATURE_RULES.map((rule) => featureDimension(rule.label)))).map((name) => ({ name, items: distribution(colorProducts, FEATURE_RULES.filter((rule) => featureDimension(rule.label) === name).map((rule) => [rule.label, rule.pattern])) })),
    marketPoints,
    priceSweetSpot,
    topProducts: detailProducts,
    designProposals,
    keywordValidation,
    strategies: [
      {
        title: "微调优化", subtitle: "低风险",
        body: "优先使用已有高需求样本验证过的领口、袖口或图案元素，在锚点基础上只调整 1-2 个设计点。",
        proposalIds: designProposals.filter((item) => item.category === "微调优化").map((item) => item.id), tone: "positive",
      },
      {
        title: "差异化竞争", subtitle: "中风险",
        body: "避开单纯价格竞争，用面料、版型或组合设计形成明确辨识度，并在主流价格带内验证转化。",
        proposalIds: designProposals.filter((item) => item.category === "差异化竞争").map((item) => item.id), tone: "neutral",
      },
      {
        title: "创新探索", subtitle: "高风险高回报",
        body: "组合当前低频元素形成新方向，先小批量测试点击率与收藏率，再决定是否扩大投入。",
        proposalIds: designProposals.filter((item) => item.category === "创新探索").map((item) => item.id), tone: "warning",
      },
    ],
    dataQuality: {
      successfulPages,
      inputProducts: products.length,
      validProducts: uniqueProducts.length,
      enrichedProducts,
      priceCoverage,
      demandCoverage,
      detailCoverage,
      conclusionConfidence,
    },
    analysisMeta: {
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: 0,
      method: "确定性统计 + Listing 语义规则 + 竞品详情补充",
      stageTimings: [],
    },
    insights: [
      {
        title: "核心选品策略",
        body: topEvidence
          ? `以 ${topEvidence.asin} 的公开需求信号（${topEvidence.monthlyBoughtText ?? `${topEvidence.reviewCount ?? 0} 条评论`}）为验证基准，保留主流轮廓，每轮只替换 1-2 个可追踪设计属性。`
          : "有效需求样本不足，建议先补齐前三页数据再确定核心策略。",
        tone: "positive",
      },
      {
        title: demandOpportunity || keywordOpportunity ? "关键词数据机会" : "关键词验证状态",
        body: demandOpportunity
          ? `“${demandOpportunity.label}”覆盖 ${demandOpportunity.matchedKeywords.length}/${demandOpportunity.keywords.length} 个有效搜索表达，合计周搜索量 ${demandOpportunity.totalWeeklySearchVolume?.toLocaleString("en-US") ?? "未返回"}、加权竞争难度 ${demandOpportunity.weightedCompetitiveDifficulty?.toFixed(1) ?? "未返回"}；本批需求组判断为“${demandOpportunity.assessment}”。`
          : keywordOpportunity
            ? `西柚返回“${keywordOpportunity.keyword}”周搜索量 ${keywordOpportunity.weeklySearchVolume?.toLocaleString("en-US") ?? "未返回"}、竞争难度 ${keywordOpportunity.competitiveDifficulty ?? "未返回"}；本批相对判断为“${keywordOpportunity.assessment}”，建议先用小批量点击和转化测试复核。`
          : keywordValidation?.message ?? "本轮没有西柚关键词证据，仅保留 Amazon 公开页面分析，不判断关键词空白机会。",
        tone: demandOpportunity || keywordOpportunity ? "positive" : "warning",
      },
      {
        title: "颜色机会",
        body: dominantColor
          ? `${dominantColor.name}以 ${dominantColor.value} 个有效信号领先；首批配色可保留该基础色，再从热力图中选择一个低频色做小样对照。`
          : "颜色变体与标题信号覆盖不足，本轮不生成强颜色结论。",
        tone: "neutral",
      },
      {
        title: "面料升级方向",
        body: dominantMaterial
          ? `${dominantMaterial.name}在 ${dominantMaterial.value} 款有效样本中出现，可作为供应链核价基线；升级面料时应同时验证手感、克重与洗后稳定性。`
          : "Amazon 公开字段中的面料覆盖不足，建议在打样前人工核验锚点详情与供应链规格。",
        tone: "neutral",
      },
      {
        title: "场景机会",
        body: scenarioDistribution[0]
          ? `${scenarioDistribution[0].name}在 ${scenarioDistribution[0].value} 款商品中出现；可围绕该场景补充面料、功能和搭配卖点，并用低频场景做差异化小样。`
          : "当前 Listing 未形成明确使用场景信号，本轮不指定场景，需结合目标人群和运营定位人工确认。",
        tone: "neutral",
      },
      {
        title: "功能与设计机会",
        body: dominantSleeve
          ? `${dominantSleeve.name}是当前最常见袖型信号（${dominantSleeve.value} 款）；可保留主流袖型，通过袖口、门襟或口袋等局部元素建立可控差异。`
          : dominantPattern
            ? `${dominantPattern.name}出现 ${dominantPattern.value} 次，可作为图案基线，再用局部结构形成差异。`
            : "设计属性未形成明显集中，适合从锚点商品出发做单变量小样测试。",
        tone: "positive",
      },
      ...(newestProduct ? [{
        title: "新品突破信号",
        body: `${newestProduct.asin} 是已取得上架日期的较新样本（${newestProduct.details?.firstAvailable}），当前公开需求信号为 ${newestProduct.monthlyBoughtText ?? `${newestProduct.reviewCount ?? 0} 条评论`}，可列入新品跟踪。`,
        tone: "warning" as const,
      }] : []),
      {
        title: "定价建议",
        body: priceSweetSpot.min === null
          ? "当前有效价格样本不足，暂不生成定价结论。"
          : `建议首轮验证 ${priceSweetSpot.min.toFixed(2)}-${priceSweetSpot.max?.toFixed(2)} 美元；区间来自 ${priceSweetSpot.sampleCount} 个高需求样本与市场中位价 ${med?.toFixed(2) ?? "未公开"} 美元。`,
        tone: "warning",
      },
    ],
  };
}
