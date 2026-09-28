import type { AmazonProduct, KeywordCandidate } from "@/types/product";

type FeatureRule = {
  label: string;
  phrase: string;
  pattern: RegExp;
};

type AudienceProfile = {
  prefix: string;
  suffix: string;
  element: string;
};

export const FEATURE_RULES: FeatureRule[] = [
  { label: "宽松版型", phrase: "loose fit", pattern: /\b(?:baggy|oversized|loose|relaxed)\b|宽松版型/i },
  { label: "荷叶边", phrase: "ruffle", pattern: /\bruffl(?:e|ed|es)\b|荷叶边/i },
  { label: "翻领", phrase: "collared", pattern: /\bcollared\b|\blapel\b|翻领/i },
  { label: "立领", phrase: "stand collar", pattern: /\b(?:stand|mandarin) collar\b|立领/i },
  { label: "圆领", phrase: "crew neck", pattern: /\b(?:crew|round)[ -]?neck\b|圆领/i },
  { label: "灯笼袖", phrase: "lantern sleeve", pattern: /\b(?:lantern|balloon)[ -]?sleeve\b|灯笼袖/i },
  { label: "喇叭袖", phrase: "bell sleeve", pattern: /\bbell[ -]?sleeve\b|喇叭袖/i },
  { label: "无袖", phrase: "sleeveless", pattern: /\bsleeveless\b|无袖/i },
  { label: "褶裥", phrase: "pleated", pattern: /\bpleat(?:ed|s)?\b|褶裥/i },
  { label: "Smocked 弹力设计", phrase: "smocked", pattern: /\bsmock(?:ed|ing)?\b|Smocked 弹力设计/i },
  { label: "镂空/蕾丝", phrase: "lace", pattern: /\blace\b|镂空\/蕾丝/i },
  { label: "雪纺", phrase: "chiffon", pattern: /\bchiffon\b|雪纺/i },
  { label: "涤纶", phrase: "polyester", pattern: /\bpolyester\b|涤纶/i },
  { label: "针织", phrase: "knit", pattern: /\bknit(?:ted)?\b|针织/i },
  { label: "锥形版型", phrase: "tapered", pattern: /\btapered\b|锥形版型/i },
  { label: "中腰", phrase: "mid rise", pattern: /\bmid[ -]?rise\b|中腰/i },
  { label: "低腰", phrase: "low rise", pattern: /\blow[ -]?rise\b|低腰/i },
  { label: "拉链门襟", phrase: "zip front", pattern: /\bzip(?:per)?[ -]?(?:fly|closure|front)\b|拉链门襟/i },
  { label: "长款 Tunic", phrase: "tunic", pattern: /\btunic\b|长款 Tunic/i },
  { label: "宽腿版型", phrase: "wide leg", pattern: /\bwide[ -]?leg\b|宽腿版型/i },
  { label: "直筒版型", phrase: "straight leg", pattern: /\bstraight[ -]?(?:leg|fit)\b|直筒版型/i },
  { label: "修身版型", phrase: "slim fit", pattern: /\b(?:slim|fitted|tailored)\b|修身版型/i },
  { label: "高腰", phrase: "high waisted", pattern: /\bhigh[ -]?(?:rise|waist|waisted)\b|高腰/i },
  { label: "弹力腰头", phrase: "elastic waist", pattern: /\belastic(?:ized)?[ -]?waist\b|弹力腰头/i },
  { label: "抽绳腰头", phrase: "drawstring waist", pattern: /\bdrawstring\b|抽绳腰头/i },
  { label: "口袋", phrase: "with pockets", pattern: /\bpockets?\b|口袋/i },
  { label: "泡泡袖", phrase: "puff sleeve", pattern: /\bpuff(?:ed)?(?:[ -](?:long|short))?[ -]?sleeve\b|泡泡袖/i },
  { label: "短袖", phrase: "short sleeve", pattern: /\bshort[ -]?sleeve\b|短袖/i },
  { label: "长袖", phrase: "long sleeve", pattern: /\blong[ -]?sleeve\b|长袖/i },
  { label: "V 领", phrase: "v neck", pattern: /\bv[ -]?neck\b|V 领/i },
  { label: "纽扣门襟", phrase: "button down", pattern: /\bbutton[ -]?(?:down|up)\b|纽扣门襟/i },
  { label: "棉质", phrase: "cotton", pattern: /\bcotton\b|棉质/i },
  { label: "亚麻/棉麻", phrase: "linen", pattern: /\blinen\b|亚麻|棉麻/i },
  { label: "弹力面料", phrase: "stretch", pattern: /\b(?:stretch|spandex|elastane)\b|弹力面料/i },
  { label: "吸湿排汗", phrase: "moisture wicking", pattern: /\bmoisture[ -]?wicking\b|吸湿排汗/i },
  { label: "速干", phrase: "quick dry", pattern: /\bquick[ -]?dry\b|速干/i },
  { label: "抗皱", phrase: "wrinkle resistant", pattern: /\bwrinkle[ -]?(?:free|resistant)\b|抗皱/i },
  { label: "条纹", phrase: "striped", pattern: /\bstrip(?:e|ed)\b|条纹/i },
  { label: "格纹", phrase: "plaid", pattern: /\b(?:plaid|checkered|gingham)\b|格纹/i },
  { label: "花卉", phrase: "floral", pattern: /\b(?:floral|flower)\b|花卉/i },
  { label: "通勤 / 商务", phrase: "business casual", pattern: /\b(?:office|work|business|formal)\b|通勤|商务/i },
  { label: "高尔夫 / 运动", phrase: "golf", pattern: /\b(?:golf|athletic|sport|performance)\b|高尔夫|运动/i },
  { label: "旅行 / 度假", phrase: "travel", pattern: /\b(?:travel|vacation|resort|cruise)\b|旅行|度假/i },
];

const CATEGORY_PHRASES = [
  "dress pants", "cargo pants", "yoga pants", "button down shirts", "button down shirt",
  "blouses", "shirts", "tops", "pants", "trousers", "jeans", "shorts", "dresses",
  "skirts", "jackets", "coats", "sweaters", "hoodies", "shirts",
];

function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productDesignText(product: AmazonProduct) {
  let text = [
    product.title,
    ...(product.details?.bullets ?? []),
    ...(product.details?.attributes ?? []),
    ...(product.details?.visualAttributes ?? []),
  ].join(" ");
  for (const rule of FEATURE_RULES) {
    if (product.featureCorrections?.[rule.label] === false) text = text.replace(new RegExp(rule.pattern.source, "gi"), " ");
  }
  return [text, ...FEATURE_RULES.filter(rule => product.featureCorrections?.[rule.label] === true).map(rule => `${rule.label} ${rule.phrase}`)].join(" ");
}
const productText = productDesignText;

function inferAudience(query: string) {
  if (/\b(?:women|womens|female|ladies)\b/i.test(query)) return { prefix: "womens", suffix: "women", element: "women / womens" };
  if (/\b(?:men|mens|male)\b/i.test(query)) return { prefix: "mens", suffix: "men", element: "men / mens" };
  if (/\b(?:girls|girl)\b/i.test(query)) return { prefix: "girls", suffix: "girls", element: "girls" };
  if (/\b(?:boys|boy)\b/i.test(query)) return { prefix: "boys", suffix: "boys", element: "boys" };
  return null;
}

function inferCategory(query: string, products: AmazonProduct[]) {
  const find = (text: string) => CATEGORY_PHRASES.find((phrase) => ` ${text} `.includes(` ${phrase} `));
  const category = find(query) ?? find(normalizeKeyword(products.slice(0, 12).map((item) => item.title).join(" "))) ?? "apparel";
  return category.startsWith("button down shirt") ? "shirts" : category;
}

export function featureDimension(label: string) {
  if (/门襟/.test(label)) return "门襟";
  if (/荷叶边|蕾丝|镂空/.test(label)) return "装饰";
  if (/褶裥|Smocked/.test(label)) return "褶皱工艺";
  if (/口袋/.test(label)) return "口袋";
  if (/^(长袖|短袖|无袖)$/.test(label)) return "袖长";
  if (/袖/.test(label)) return "袖型";
  if (/领/.test(label)) return "领型";
  if (/版型/.test(label)) return "版型";
  if (/腰/.test(label)) return "腰型";
  if (/棉|麻|面料|雪纺|涤纶|针织/.test(label)) return "面料";
  if (/条纹|格纹|花卉/.test(label)) return "图案";
  if (/排汗|速干|抗皱/.test(label)) return "功能";
  if (/通勤|运动|旅行/.test(label)) return "场景";
  return "结构细节";
}

export function extractDesignAttributes(text: string) {
  return FEATURE_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
}

export function keywordMatchesElements(keyword: string, elements: string[]) {
  const text = ` ${normalizeKeyword(keyword).replace(/-/g, " ").replace(/\s+/g, " ")} `;
  if (elements.some((item) => /women/.test(item)) && /\b(?:men|mens|boys)\b/.test(text)) return false;
  if (elements.some((item) => /^(men|mens)(\s|\/|$)/.test(item)) && /\b(?:women|womens|girls)\b/.test(text)) return false;
  return elements.length > 0 && elements.every((element) => element.split("/").some((part) => text.includes(` ${normalizeKeyword(part).replace(/-/g, " ").trim()} `)));
}

export function matchDemandGroup(keyword: string, candidates: KeywordCandidate[]) {
  return candidates.filter((item) => item.source !== "base-query" && item.source !== "manual" && keywordMatchesElements(keyword, item.requiredElements ?? []))
    .sort((a, b) => (b.requiredElements?.length ?? 0) - (a.requiredElements?.length ?? 0))[0];
}

function keywordFor(audience: string, phrases: string[], category: string) {
  const categoryTokens = category.split(" ");
  const parts = [audience, ...phrases, category]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter((token, index, all) => !categoryTokens.includes(token) || index === all.lastIndexOf(token));
  return normalizeKeyword(parts.join(" "));
}

function keywordVariants(audience: AudienceProfile | null, phrases: string[], category: string) {
  const prefix = keywordFor(audience?.prefix ?? "", phrases, category);
  if (!audience) return [prefix];
  const suffix = normalizeKeyword(`${phrases.join(" ")} ${category} for ${audience.suffix}`);
  return Array.from(new Set([prefix, suffix]));
}

function demandGroupId(parts: string[]) {
  return normalizeKeyword(parts.join(" ")).replace(/\s+/g, "-");
}

export function generateKeywordCandidates(
  query: string,
  products: AmazonProduct[],
  anchors: AmazonProduct[] = [],
): KeywordCandidate[] {
  const normalizedQuery = normalizeKeyword(query);
  const merged = new Map(products.map((item) => [item.asin, item]));
  for (const anchor of anchors) merged.set(anchor.asin, { ...merged.get(anchor.asin), ...anchor, details: anchor.details ?? merged.get(anchor.asin)?.details });
  const allProducts = Array.from(merged.values());
  const texts = new Map(allProducts.map((product) => [product.asin, productText(product)]));
  const audience = inferAudience(normalizedQuery);
  const category = inferCategory(normalizedQuery, allProducts);
  const detected = FEATURE_RULES.filter((rule) => (!/shirts|blouses|tops/.test(category) || !/腿|腰|锥形/.test(rule.label)) && (!/pants|trousers|jeans|shorts|skirts/.test(category) || !/袖|领/.test(rule.label))).map((rule) => {
    const evidenceAsins = allProducts
      .filter((product) => rule.pattern.test(texts.get(product.asin) ?? ""))
      .map((product) => product.asin);
    const anchorCount = anchors.filter((item) => evidenceAsins.includes(item.asin)).length;
    return { ...rule, evidenceAsins, anchorCount, dimension: featureDimension(rule.label) };
  })
    .filter((item) => item.evidenceAsins.length > 0)
    .sort((a, b) => Number(a.dimension === "场景") - Number(b.dimension === "场景") || b.anchorCount - a.anchorCount || b.evidenceAsins.length - a.evidenceAsins.length);

  const prioritized = [...detected.filter((item, index) => detected.findIndex((entry) => entry.dimension === item.dimension) === index), ...detected];
  const selectedLabels = new Set(Array.from(new Set(prioritized.map((item) => item.label))).slice(0, 8));

  const drafts: Omit<KeywordCandidate, "id">[] = [];
  if (normalizedQuery) {
    drafts.push({
      keyword: normalizedQuery,
      source: "base-query",
      sourceLabels: ["初始搜索词"],
      evidenceCount: products.length,
      evidenceAsins: products.slice(0, 5).map((item) => item.asin),
      selected: true,
      demandGroupId: "initial-market-demand",
      demandGroupLabel: "初始市场需求",
      requiredElements: [audience?.element, category].filter((item): item is string => Boolean(item)),
    });
  }

  for (const feature of detected) {
    const groupId = demandGroupId([audience?.prefix ?? "all", feature.phrase, category]);
    for (const keyword of keywordVariants(audience, [feature.phrase], category)) {
      drafts.push({
        keyword,
        source: "design-feature",
        sourceLabels: [feature.label],
        evidenceCount: feature.evidenceAsins.length,
        evidenceAsins: feature.evidenceAsins.slice(0, 5),
        selected: selectedLabels.has(feature.label),
        dimension: feature.dimension,
        selectionReason: selectedLabels.has(feature.label) ? "优先覆盖锚点与不同设计维度" : "本轮预算暂缓，可手动选择",
        evidenceQuotes: feature.evidenceAsins.slice(0, 3).map((asin) => ({ asin, text: [merged.get(asin)!.title, ...(merged.get(asin)!.details?.bullets ?? []), ...(merged.get(asin)!.details?.attributes ?? []), ...(merged.get(asin)!.details?.visualSummary ? [`图片识别（待人工核验）：${merged.get(asin)!.details!.visualSummary}`] : [])].find((text) => feature.pattern.test(text)) ?? "" })),
        demandGroupId: groupId,
        demandGroupLabel: `${feature.label}需求`,
        requiredElements: [audience?.element, feature.phrase, category].filter((item): item is string => Boolean(item)),
      });
    }
  }

  const pairs = detected.flatMap((left, index) => detected.slice(index + 1).filter((right) => right.dimension !== left.dimension && left.dimension !== "场景" && right.dimension !== "场景").map((right) => ({
    left, right, asins: left.evidenceAsins.filter((asin) => right.evidenceAsins.includes(asin)),
    queryOverlap: Number(normalizedQuery.includes(left.phrase)) + Number(normalizedQuery.includes(right.phrase)),
  }))).filter((pair) => pair.asins.length > 0 && (!anchors[0] || [pair.left, pair.right].some(rule => !rule.pattern.test(productText(anchors[0]))))).sort((a, b) => a.queryOverlap - b.queryOverlap || b.asins.length - a.asins.length).slice(0, 2);
  for (const [index, pair] of pairs.entries()) {
    const phrases = [pair.left.phrase, pair.right.phrase];
    for (const keyword of keywordVariants(audience, phrases, category)) drafts.push({
      keyword, source: "design-combination", sourceLabels: [pair.left.label, pair.right.label],
      evidenceCount: pair.asins.length, evidenceAsins: pair.asins.slice(0, 5), selected: index === 0,
      dimension: "组合需求", selectionReason: "同一商品出现的跨维度组合；单独查询，不能由单词指标推算",
      demandGroupId: demandGroupId([audience?.prefix ?? "all", ...phrases, category]),
      demandGroupLabel: `${pair.left.label} + ${pair.right.label}组合需求`,
      requiredElements: [audience?.element, ...phrases, category].filter((item): item is string => Boolean(item)),
    });
  }
  const unique = Array.from(new Map(
    drafts.filter((item) => item.keyword.length >= 3).map((item) => [item.keyword, item]),
  ).values());
  return unique.map((item, index) => ({ ...item, id: `keyword-${index + 1}` }));
}
