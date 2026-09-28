import "server-only";
import { keywordMatchesElements, matchDemandGroup } from "./keyword-candidates";

import type {
  KeywordCandidate,
  KeywordDemandGroup,
  KeywordEvidence,
  KeywordValidationResult,
} from "@/types/product";

type JsonRecord = Record<string, unknown>;
type CacheEntry = { expiresAt: number; value: KeywordValidationResult };

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
let requestId = 1;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[%,$]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseMcpBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as JsonRecord;
  const messages = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]")
    .map((line) => JSON.parse(line) as JsonRecord);
  return messages.at(-1) ?? null;
}

async function mcpPost(
  url: string,
  token: string,
  payload: JsonRecord,
  sessionId?: string | null,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("西柚 MCP Token 无效或已过期");
    if (response.status === 429) throw new Error("西柚 MCP 当前请求过多或额度受限，请稍后重试");
    throw new Error(`西柚 MCP 返回 HTTP ${response.status}`);
  }
  return {
    body: parseMcpBody(text),
    sessionId: response.headers.get("mcp-session-id") ?? sessionId ?? null,
  };
}

function findKeywordList(value: unknown, depth = 0): JsonRecord[] | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    const records = value.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
    if (records.some((item) => typeof item.searchTerm === "string")) return records;
    for (const item of value) {
      const found = findKeywordList(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const nested of Object.values(record)) {
    const found = findKeywordList(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function toolPayload(response: JsonRecord | null) {
  const error = asRecord(response?.error);
  if (error) throw new Error(asString(error.message) ?? "西柚 MCP 工具调用失败");
  const result = asRecord(response?.result);
  if (!result) throw new Error("西柚 MCP 未返回工具结果");
  if (result.isError === true) {
    const content = Array.isArray(result.content) ? result.content.map(asRecord).filter(Boolean) : [];
    const message = content.map((item) => asString(item?.text)).filter(Boolean).join("；");
    throw new Error(message || "西柚 MCP 工具返回错误");
  }
  if (result.structuredContent) return result.structuredContent;
  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      const text = asString(asRecord(entry)?.text);
      if (!text) continue;
      try { return JSON.parse(text) as unknown; } catch { /* Continue to the next content item. */ }
    }
  }
  return result;
}

function normalizeRows(rows: JsonRecord[], candidates: KeywordCandidate[]): KeywordEvidence[] {
  const byKeyword = new Map(rows.map((row) => [String(row.searchTerm ?? "").trim().toLowerCase(), row]));
  return candidates.map((candidate) => {
    const row = byKeyword.get(candidate.keyword.trim().toLowerCase());
    const aba = asRecord(row?.abaReport);
    const cost = asRecord(row?.costPerClick);
    const weeklySearchVolume = asNumber(aba?.weeklySearchVolume);
    const competitiveDifficulty = asNumber(row?.competitiveDifficulty);
    const hasCoreMetrics = weeklySearchVolume !== null || competitiveDifficulty !== null;
    const topAsins = Array.isArray(aba?.topAsins)
      ? aba.topAsins.map(asRecord).filter((item): item is JsonRecord => Boolean(item)).flatMap((item) => {
        const asin = asString(item.asin);
        return asin ? [{ asin, clickShare: asNumber(item.clickShare), conversionShare: asNumber(item.conversionShare) }] : [];
      }).slice(0, 3)
      : [];
    return {
      candidateId: candidate.id,
      keyword: candidate.keyword,
      sourceLabels: candidate.sourceLabels,
      status: row && hasCoreMetrics ? "matched" as const : "no-data" as const,
      weeklySearchVolume,
      searchFrequencyRank: asNumber(aba?.searchFrequencyRank),
      competitiveDifficulty,
      clickConversionRate: asNumber(row?.clickConversionRate),
      organicRotation: asNumber(row?.organicRotation),
      cpc: asNumber(cost?.value),
      minSuggestedBid: asNumber(cost?.minSuggestedBid),
      maxSuggestedBid: asNumber(cost?.maxSuggestedBid),
      topAsins,
      periodFrom: asString(aba?.reportFromDate),
      periodTo: asString(aba?.reportToDate),
      assessment: "数据不足" as const,
      assessmentReason: row ? "等待同批关键词相对比较" : "西柚本次未返回该关键词数据",
    };
  });
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assessEvidence(evidence: KeywordEvidence[]) {
  const latest = evidence.filter(item => item.periodFrom && item.periodTo).sort((a,b) => b.periodTo!.localeCompare(a.periodTo!))[0];
  const comparable = evidence.filter((item) => item.periodFrom && item.periodFrom === latest?.periodFrom && item.periodTo === latest?.periodTo && item.weeklySearchVolume !== null && item.competitiveDifficulty !== null);
  const demandMedian = median(comparable.map((item) => item.weeklySearchVolume as number));
  const competitionMedian = median(comparable.map((item) => item.competitiveDifficulty as number));
  return evidence.map((item): KeywordEvidence => {
    if (!comparable.includes(item)) return { ...item, assessment: "数据不足", assessmentReason: "周期或指标不可比，仅展示原始值，不参与本批机会排序" };
    if (comparable.length < 2 || demandMedian === null || competitionMedian === null || item.weeklySearchVolume === null || item.competitiveDifficulty === null) {
      return { ...item, assessment: "数据不足", assessmentReason: item.status === "no-data" ? "西柚本次未返回该关键词数据" : "有效需求与竞争指标不足，暂不判断机会" };
    }
    const highDemand = item.weeklySearchVolume >= demandMedian;
    const lowCompetition = item.competitiveDifficulty <= competitionMedian;
    if (highDemand && lowCompetition) return { ...item, assessment: "优先验证", assessmentReason: "本批次中需求不低于中位数，竞争难度不高于中位数" };
    if (highDemand) return { ...item, assessment: "需求高但竞争强", assessmentReason: "本批次中需求较高，同时竞争难度也较高" };
    if (lowCompetition) return { ...item, assessment: "低竞争待验证", assessmentReason: "本批次中竞争较低，但需求量仍需谨慎验证" };
    return { ...item, assessment: "暂缓观察", assessmentReason: "本批次中需求低于中位数且竞争难度偏高" };
  });
}

function weightedAverage(items: KeywordEvidence[], read: (item: KeywordEvidence) => number | null) {
  const values = items.flatMap((item) => {
    const value = read(item);
    return value === null || item.weeklySearchVolume === null || item.weeklySearchVolume <= 0 ? [] : [{ value, weight: item.weeklySearchVolume }];
  });
  if (!values.length) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function assessDemandGroups(groups: KeywordDemandGroup[]) {
  const latest = groups.filter(item => item.periodFrom && item.periodTo).sort((a,b) => b.periodTo!.localeCompare(a.periodTo!))[0];
  const comparable = groups.filter((item) => item.periodFrom && item.periodFrom === latest?.periodFrom && item.periodTo === latest?.periodTo && item.totalWeeklySearchVolume !== null && item.weightedCompetitiveDifficulty !== null);
  const demandMedian = median(comparable.map((item) => item.totalWeeklySearchVolume as number));
  const competitionMedian = median(comparable.map((item) => item.weightedCompetitiveDifficulty as number));
  return groups.map((item): KeywordDemandGroup => {
    if (!comparable.includes(item)) return { ...item, assessment: "数据不足", assessmentReason: "与本批最新统计周不同或指标缺失，仅展示原始数据，不参与机会比较" };
    if (comparable.length < 2 || demandMedian === null || competitionMedian === null || item.totalWeeklySearchVolume === null || item.weightedCompetitiveDifficulty === null) {
      return { ...item, assessment: "数据不足", assessmentReason: "有效需求组不足，暂不进行相对机会判断" };
    }
    const highDemand = item.totalWeeklySearchVolume >= demandMedian;
    const lowCompetition = item.weightedCompetitiveDifficulty <= competitionMedian;
    if (highDemand && lowCompetition) return { ...item, assessment: "优先验证", assessmentReason: "需求组搜索量不低于中位数，加权竞争不高于中位数" };
    if (highDemand) return { ...item, assessment: "需求高但竞争强", assessmentReason: "需求组搜索量较高，同时加权竞争也较高" };
    if (lowCompetition) return { ...item, assessment: "低竞争待验证", assessmentReason: "需求组加权竞争较低，但搜索需求仍需验证" };
    return { ...item, assessment: "暂缓观察", assessmentReason: "需求组搜索量低于中位数且加权竞争偏高" };
  });
}

function belongsToDemandGroup(candidate: KeywordCandidate) {
  if (candidate.source === "base-query") return true;
  return !candidate.requiredElements?.length || keywordMatchesElements(candidate.keyword, candidate.requiredElements);
}

function aggregateDemandGroups(candidates: KeywordCandidate[], evidence: KeywordEvidence[]) {
  const evidenceByCandidate = new Map(evidence.map((item) => [item.candidateId, item]));
  const grouped = new Map<string, KeywordCandidate[]>();
  for (const candidate of candidates.filter(belongsToDemandGroup)) {
    const id = candidate.demandGroupId ?? candidate.id;
    grouped.set(id, [...(grouped.get(id) ?? []), candidate]);
  }
  const groups = Array.from(grouped, ([id, groupCandidates]): KeywordDemandGroup => {
    const uniqueCandidates = Array.from(new Map(groupCandidates.map((item) => [item.keyword.trim().toLowerCase(), item])).values());
    const returned = uniqueCandidates
      .map((item) => evidenceByCandidate.get(item.id))
      .filter((item): item is KeywordEvidence => item?.status === "matched");
    const latest = returned.filter((item) => item.periodFrom && item.periodTo).sort((a, b) => b.periodTo!.localeCompare(a.periodTo!))[0];
    const matched = returned.filter((item) => latest && item.periodFrom === latest.periodFrom && item.periodTo === latest.periodTo);
    const volumes = matched.flatMap((item) => item.weeklySearchVolume === null ? [] : [item.weeklySearchVolume]);
    const top = [...matched].sort((left, right) => (right.weeklySearchVolume ?? -1) - (left.weeklySearchVolume ?? -1))[0];
    const periods = matched.filter((item) => item.periodFrom && item.periodTo);
    return {
      id,
      label: uniqueCandidates[0]?.demandGroupLabel ?? uniqueCandidates[0]?.sourceLabels.join(" + ") ?? "独立需求",
      requiredElements: uniqueCandidates[0]?.requiredElements ?? [],
      keywords: uniqueCandidates.map((item) => item.keyword),
      matchedKeywords: matched.map((item) => item.keyword),
      totalWeeklySearchVolume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null,
      weightedCompetitiveDifficulty: weightedAverage(matched, (item) => item.competitiveDifficulty),
      weightedClickConversionRate: weightedAverage(matched, (item) => item.clickConversionRate),
      weightedCpc: weightedAverage(matched, (item) => item.cpc),
      topKeyword: top?.keyword ?? null,
      periodFrom: periods[0]?.periodFrom ?? null,
      periodTo: periods[0]?.periodTo ?? null,
      assessment: "数据不足",
      assessmentReason: "等待需求组相对比较",
    };
  });
  return assessDemandGroups(groups);
}

export async function validateKeywordsWithXydc(candidates: KeywordCandidate[]): Promise<KeywordValidationResult> {
  candidates = candidates.map((item) => {
    const group = item.source === "manual" ? matchDemandGroup(item.keyword, candidates) : undefined;
    return group ? { ...item, demandGroupId: group.demandGroupId, demandGroupLabel: group.demandGroupLabel, requiredElements: group.requiredElements, sourceLabels: group.sourceLabels } : item;
  });
  const requestedAt = new Date().toISOString();
  const url = process.env.XYDC_MCP_URL?.trim();
  const token = process.env.XYDC_MCP_TOKEN?.trim();
  if (!url || !token) {
    return {
      provider: "西柚洞察", country: "US", status: "unconfigured",
      message: "服务器尚未配置西柚 MCP 地址或 Token，未生成任何关键词指标。",
      requestedAt, fetchedAt: null, cached: false, candidates, evidence: [],
    };
  }

  const cacheKey = JSON.stringify(candidates);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true, candidates };

  const initialize = await mcpPost(url, token, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "amazon-ai-selection-system", version: "0.1.0" },
    },
  });
  await mcpPost(url, token, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, initialize.sessionId);
  const rows: JsonRecord[] = [];
  for (let offset = 0; offset < candidates.length; offset += 10) {
  const call = await mcpPost(url, token, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/call",
    params: {
      name: "get_keyword_info",
      arguments: { keywords: candidates.slice(offset, offset + 10).map((item) => item.keyword), country: "US" },
    },
  }, initialize.sessionId);
  rows.push(...(findKeywordList(toolPayload(call.body)) ?? []));
  }
  const evidence = assessEvidence(normalizeRows(rows, candidates));
  const demandGroups = aggregateDemandGroups(candidates, evidence);
  const matched = evidence.filter((item) => item.status === "matched").length;
  const value: KeywordValidationResult = {
    provider: "西柚洞察",
    country: "US",
    status: matched === candidates.length ? "verified" : matched > 0 ? "partial" : "failed",
    message: matched === candidates.length
      ? `已取得 ${matched} 个关键词的真实周度指标，并汇总为 ${demandGroups.length} 个需求组。`
      : matched > 0
        ? `西柚返回 ${matched}/${candidates.length} 个关键词，已汇总为 ${demandGroups.length} 个需求组，其余保持空值。`
        : "西柚本次未返回候选关键词数据，未生成任何替代数值。",
    requestedAt,
    fetchedAt: new Date().toISOString(),
    cached: false,
    candidates,
    evidence,
    demandGroups,
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
