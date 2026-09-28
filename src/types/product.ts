export type ProductDetails = {
  listingTitle?: string;
  visualAttributes?: string[];
  visualSummary?: string;
  visualStatus?: string;
  brand: string | null;
  bullets: string[];
  colorCount: number | null;
  colors: string[];
  bsr: string | null;
  firstAvailable: string | null;
  availability: string | null;
  attributes: string[];
  extractionStatus: "complete" | "partial";
  completeness: number;
  source: "amazon-direct" | "amazon-reader" | "merged";
};

export type AmazonProduct = {
  featureCorrections?: Record<string, boolean>;
  asin: string;
  title: string;
  url: string;
  image: string;
  price: number | null;
  priceText: string | null;
  rating: number | null;
  reviewCount: number | null;
  monthlyBought: number | null;
  monthlyBoughtText: string | null;
  isPrime: boolean;
  isSponsored: boolean;
  badge: string | null;
  page: number;
  position: number;
  capturedAt: string;
  details?: ProductDetails;
};

export type SearchResponse = {
  query: string;
  page: number;
  resultCount: number;
  products: AmazonProduct[];
  source: "amazon.com-live" | "amazon-reader";
  fetchedAt: string;
  cached: boolean;
  attempts: number;
};

export type DistributionItem = {
  name: string;
  value: number;
};

export type KeywordCandidate = {
  id: string;
  keyword: string;
  source: "base-query" | "design-feature" | "design-combination" | "manual";
  sourceLabels: string[];
  evidenceCount: number;
  evidenceAsins: string[];
  selected: boolean;
  demandGroupId?: string;
  demandGroupLabel?: string;
  requiredElements?: string[];
  dimension?: string;
  selectionReason?: string;
  evidenceQuotes?: Array<{ asin: string; text: string }>;
};

export type KeywordAssessment = "优先验证" | "需求高但竞争强" | "低竞争待验证" | "暂缓观察" | "数据不足";

export type KeywordEvidence = {
  candidateId: string;
  keyword: string;
  sourceLabels: string[];
  status: "matched" | "no-data";
  weeklySearchVolume: number | null;
  searchFrequencyRank: number | null;
  competitiveDifficulty: number | null;
  clickConversionRate: number | null;
  organicRotation: number | null;
  cpc: number | null;
  minSuggestedBid: number | null;
  maxSuggestedBid: number | null;
  topAsins: Array<{
    asin: string;
    clickShare: number | null;
    conversionShare: number | null;
  }>;
  periodFrom: string | null;
  periodTo: string | null;
  assessment: KeywordAssessment;
  assessmentReason: string;
};

export type KeywordDemandGroup = {
  id: string;
  label: string;
  requiredElements: string[];
  keywords: string[];
  matchedKeywords: string[];
  totalWeeklySearchVolume: number | null;
  weightedCompetitiveDifficulty: number | null;
  weightedClickConversionRate: number | null;
  weightedCpc: number | null;
  topKeyword: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  assessment: KeywordAssessment;
  assessmentReason: string;
};

export type KeywordValidationResult = {
  provider: "西柚洞察";
  country: "US";
  status: "verified" | "partial" | "unconfigured" | "failed" | "skipped";
  message: string;
  requestedAt: string;
  fetchedAt: string | null;
  cached: boolean;
  candidates: KeywordCandidate[];
  evidence: KeywordEvidence[];
  demandGroups?: KeywordDemandGroup[];
};

export type DesignProposal = {
  targetFeatures?: string[];
  evidenceLevel?: "verified" | "hypothesis";
  id: string;
  product: AmazonProduct;
  category: "微调优化" | "差异化竞争" | "创新探索";
  sourceFeature: string;
  targetFeature: string;
  scenario: string;
  reason: string;
  evidence: string;
  risk: "低" | "中" | "高" | "待核验";
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  tags: string[];
  keywordEvidence: KeywordEvidence | null;
  action?: string;
  retainedFeatures?: string[];
  keywordDemandGroup?: KeywordDemandGroup | null;
  demoJobId?: string;
};

export type StrategyRecommendation = {
  title: string;
  subtitle: string;
  body: string;
  proposalIds: string[];
  tone: "positive" | "neutral" | "warning";
};

export type AttributeGroup = {
  name: string;
  items: DistributionItem[];
};

export type MarketPoint = {
  asin: string;
  title: string;
  price: number;
  demand: number;
  competition: number;
  rating: number;
  reviewCount: number;
};

export type AnalysisStageTiming = {
  name: string;
  durationMs: number;
  processed: number;
  summary: string;
};

export type AnalysisResult = {
  generatedAt: string;
  query: string;
  productCount: number;
  brandCount: number;
  priceMin: number | null;
  priceMax: number | null;
  medianPrice: number | null;
  averageRating: number | null;
  monthlyBoughtTotal: number;
  topProduct: AmazonProduct | null;
  priceBands: DistributionItem[];
  patternDistribution: DistributionItem[];
  featureDistribution: DistributionItem[];
  colorDistribution: DistributionItem[];
  necklineDistribution: DistributionItem[];
  materialDistribution: DistributionItem[];
  sleeveDistribution: DistributionItem[];
  colorSkuDistribution: DistributionItem[];
  attributeGroups: AttributeGroup[];
  marketPoints: MarketPoint[];
  priceSweetSpot: {
    min: number | null;
    max: number | null;
    sampleCount: number;
  };
  topProducts: AmazonProduct[];
  designProposals: DesignProposal[];
  keywordValidation?: KeywordValidationResult;
  strategies: StrategyRecommendation[];
  dataQuality: {
    successfulPages: number[];
    inputProducts: number;
    validProducts: number;
    enrichedProducts: number;
    priceCoverage: number;
    demandCoverage: number;
    detailCoverage: number;
    conclusionConfidence: "高" | "中" | "低";
  };
  analysisMeta: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    method: string;
    stageTimings: AnalysisStageTiming[];
  };
  insights: Array<{
    title: string;
    body: string;
    tone: "positive" | "neutral" | "warning";
  }>;
};

export type AnalysisStreamEvent =
  | {
      type: "stage";
      index: number;
      status: "running" | "complete";
      name: string;
      processed: number;
      summary: string;
      durationMs?: number;
    }
  | { type: "result"; result: AnalysisResult }
  | { type: "error"; error: string };
