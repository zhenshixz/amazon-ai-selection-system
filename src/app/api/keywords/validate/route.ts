import { validateKeywordsWithXydc } from "@/lib/xydc-mcp";
import type { KeywordCandidate, KeywordValidationResult } from "@/types/product";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;
const requestWindows = new Map<string, number[]>();

function clientId(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "local";
}

function isRateLimited(id: string) {
  const now = Date.now();
  const active = (requestWindows.get(id) ?? []).filter((time) => now - time < WINDOW_MS);
  if (active.length >= MAX_REQUESTS) {
    requestWindows.set(id, active);
    return true;
  }
  active.push(now);
  requestWindows.set(id, active);
  return false;
}

function sanitizeCandidates(value: unknown): KeywordCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<KeywordCandidate>;
    const keyword = typeof record.keyword === "string"
      ? record.keyword.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
      : "";
    if (keyword.length < 3) return [];
    const sourceLabels = Array.isArray(record.sourceLabels)
      ? record.sourceLabels.filter((label): label is string => typeof label === "string").map((label) => label.slice(0, 30)).slice(0, 2)
      : [];
    const evidenceAsins = Array.isArray(record.evidenceAsins)
      ? record.evidenceAsins.filter((asin): asin is string => typeof asin === "string" && /^[A-Z0-9]{10}$/.test(asin)).slice(0, 5)
      : [];
    return [{
      id: typeof record.id === "string" ? record.id.slice(0, 40) : `keyword-${index + 1}`,
      keyword,
      source: record.source === "base-query" || record.source === "design-feature" || record.source === "design-combination" || record.source === "manual" ? record.source : "manual",
      sourceLabels,
      evidenceCount: Number.isFinite(record.evidenceCount) ? Math.max(0, Number(record.evidenceCount)) : 0,
      evidenceAsins,
      selected: true,
      demandGroupId: typeof record.demandGroupId === "string"
        ? record.demandGroupId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80)
        : undefined,
      demandGroupLabel: typeof record.demandGroupLabel === "string" ? record.demandGroupLabel.slice(0, 50) : undefined,
      requiredElements: Array.isArray(record.requiredElements)
        ? record.requiredElements.filter((element): element is string => typeof element === "string").map((element) => element.slice(0, 30)).slice(0, 4)
        : undefined,
    }];
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { candidates?: unknown };
    if (Array.isArray(body.candidates) && body.candidates.length > 20) return Response.json({ error: "每轮最多查询 20 个表达，请取消部分勾选。" }, { status: 400 });
    const candidates = sanitizeCandidates(body.candidates);
    if (!candidates.length) {
      return Response.json({ error: "请至少选择 1 个有效英文关键词。" }, { status: 400 });
    }
    if (isRateLimited(clientId(request))) {
      return Response.json({ error: "关键词验证请求过于频繁，请稍后再试。" }, { status: 429 });
    }
    try {
      return Response.json(await validateKeywordsWithXydc(candidates));
    } catch (error) {
      const failed: KeywordValidationResult = {
        provider: "西柚洞察",
        country: "US",
        status: "failed",
        message: error instanceof Error ? error.message : "西柚关键词验证失败",
        requestedAt: new Date().toISOString(),
        fetchedAt: null,
        cached: false,
        candidates,
        evidence: [],
      };
      return Response.json(failed);
    }
  } catch {
    return Response.json({ error: "关键词验证请求格式无效。" }, { status: 400 });
  }
}
