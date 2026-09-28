import "server-only";
import { extractDesignAttributes } from "./keyword-candidates";
import { fetchAmazonViaProxy } from "./amazon-proxy";

import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AmazonProduct, ProductDetails, SearchResponse } from "@/types/product";

const AMAZON_ORIGIN = "https://www.amazon.com";
const CACHE_TTL_MS = 10 * 60 * 1000;
const searchPending = new Map<string, Promise<SearchResponse>>();
const searchFailures = new Map<string, { until: number; error: Error }>();
let directRetryAfter = 0;

type CacheEntry<T> = { expiresAt: number; value: T };

const globalCache = globalThis as typeof globalThis & {
  amazonSearchCache?: Map<string, CacheEntry<SearchResponse>>;
  amazonDetailCache?: Map<string, CacheEntry<ProductDetails>>;
};

const searchCache = globalCache.amazonSearchCache ?? new Map<string, CacheEntry<SearchResponse>>();
const detailCache = globalCache.amazonDetailCache ?? new Map<string, CacheEntry<ProductDetails>>();

globalCache.amazonSearchCache = searchCache;
globalCache.amazonDetailCache = detailCache;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
];

const REQUEST_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Cookie: "i18n-prefs=USD; lc-main=en_US",
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string | undefined | null) {
  if (!value) return null;
  const normalized = value.replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCompactNumber(value: string | undefined | null) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*([KkMm]?)/);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = match[2].toLowerCase() === "k" ? 1000 : match[2].toLowerCase() === "m" ? 1_000_000 : 1;
  return Math.round(base * multiplier);
}

function absoluteProductUrl(path: string | undefined, asin: string) {
  if (!path) return `${AMAZON_ORIGIN}/dp/${asin}`;
  const cleanPath = path.split("?")[0];
  return cleanPath.startsWith("http") ? cleanPath : `${AMAZON_ORIGIN}${cleanPath}`;
}

function isBlockedPage(html: string) {
  return /Robot Check|Enter the characters you see below|Sorry, we just need to make sure you're not a robot|bm-verify=|validateCaptcha/i.test(html);
}

async function fetchReaderHtml(url: string) {
  const target = new URL(url);
  target.protocol = "http:";
  const readerUrl = `https://r.jina.ai/${target.toString()}`;
  const headers = { Accept: "text/html", "X-Return-Format": "html" };
  let response;
  try {
    response = await fetch(readerUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(18000) });
    // Do not duplicate quota errors or try to bypass verification responses.
    if (response.status >= 500) {
      const proxied = await fetchAmazonViaProxy(readerUrl, headers);
      if (proxied) { await response.body?.cancel(); response = proxied; }
    }
  } catch (error) {
    response = await fetchAmazonViaProxy(readerUrl, headers);
    if (!response) throw error;
  }
  if (!response.ok) throw new Error(`备用读取通道返回 HTTP ${response.status}`);
  const html = await response.text();
  if (isBlockedPage(html)) throw new Error("备用读取通道返回了验证页面");
  return html;
}

async function fetchAmazonHtml(url: string, validate: (html: string) => boolean = () => true) {
  let lastStatus = 502;
  let attempts = 0;
  let directReason = "直连暂时不可用，已转备用通道";
  let proxyReason = "";
  try {
    const response = await fetchAmazonViaProxy(url, { Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" });
    if (response) {
      attempts += 1;
      const html = await response.text();
      if (response.ok && !isBlockedPage(html) && validate(html)) return { html, source: "amazon.com-live" as const, attempts };
      proxyReason = `系统代理采集 HTTP ${response.status} 或商品页无效；`;
    }
  } catch { proxyReason = "系统代理采集连接失败；"; }
  for (const userAgent of (Date.now() < directRetryAfter ? [] : USER_AGENTS.slice(0, 1))) {
    attempts += 1;
    try {
      const response = await fetch(url, {
        headers: { ...REQUEST_HEADERS, "User-Agent": userAgent },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = response.status;
      directReason = `直连 HTTP ${response.status}`;
      if (!response.ok) directRetryAfter = Date.now() + 60_000;
      if (response.ok) {
        const html = await response.text();
        if (!isBlockedPage(html) && validate(html)) {
          return { html, source: "amazon.com-live" as const, attempts };
        }
        directReason = "直连返回验证页或未识别到商品";
        directRetryAfter = Date.now() + 60_000;
      }
    } catch {
      lastStatus = 504;
      directReason = "直连网络异常或超时";
      directRetryAfter = Date.now() + 60_000;
    }
  }

  attempts += 1;
  let readerReason = "备用通道返回页面，但未识别到商品";
  try {
    const html = await fetchReaderHtml(url);
    if (validate(html)) return { html, source: "amazon-reader" as const, attempts };
  } catch (error) {
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
    readerReason = cause === "ECONNRESET" ? "备用通道 HTTPS 连接被断开" : error instanceof Error ? error.message : "备用通道网络异常";
  }
  console.warn(JSON.stringify({ event: "amazon-fetch-failed", url, proxyReason, directReason, readerReason, lastStatus, at: new Date().toISOString() }));
  throw new Error(`Amazon 商品读取暂时失败：${proxyReason}${directReason}；${readerReason}。请检查运行服务电脑的采集网络后重试，无需更改内网地址。`);
}

function parseSearchProducts(html: string, page: number, capturedAt: string) {
  const $ = cheerio.load(html);
  const products: AmazonProduct[] = [];

  $('div[data-component-type="s-search-result"][data-asin]').each((index, element) => {
    const card = $(element);
    const asin = card.attr("data-asin")?.trim() ?? "";
    const title = normalizeText(card.find("h2 span").last().text() || card.find("h2").text());
    const image = card.find("img.s-image").attr("src") ?? "";
    if (!/^[A-Z0-9]{10}$/.test(asin) || !title || !image) return;

    const link = card.find('a[href*="/dp/"]').map((_, anchor) => $(anchor).attr("href")).get().find(Boolean);
    const cardText = normalizeText(card.text());
    const boughtMatch = cardText.match(/([\d,.]+\s*[KkMm]?)\+?\s+bought in past month/i);
    const ratingText = card.find(".a-icon-alt").first().text();
    const reviewText = card.find(".s-underline-text").first().text();
    const priceText = normalizeText(card.find(".a-price .a-offscreen").first().text()) || null;
    const badge = normalizeText(card.find(".a-badge-label-inner").first().text()) || null;

    products.push({
      asin, title, url: absoluteProductUrl(link, asin), image,
      price: parseNumber(priceText), priceText, rating: parseNumber(ratingText),
      reviewCount: parseCompactNumber(reviewText), monthlyBought: parseCompactNumber(boughtMatch?.[1]),
      monthlyBoughtText: boughtMatch ? `${boughtMatch[1]}+ bought in past month` : null,
      isPrime: card.find("i.a-icon-prime").length > 0,
      isSponsored: /Sponsored/i.test(cardText.slice(0, 100)), badge, page,
      position: index + 1, capturedAt,
    });
  });
  return Array.from(new Map(products.map((product) => [product.asin, product])).values());
}

async function loadAmazonSearch(query: string, page: number): Promise<SearchResponse> {
  const normalizedQuery = normalizeText(query).slice(0, 120);
  const cacheKey = `v3::${normalizedQuery.toLowerCase()}::${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }
  const cacheDir = path.join(process.cwd(), ".runtime", "search-cache");
  const cacheFile = path.join(cacheDir, createHash("sha256").update(cacheKey).digest("hex") + ".json");
  try {
    const saved = JSON.parse(await readFile(cacheFile, "utf8")) as SearchResponse;
    if (saved.query.toLowerCase() === normalizedQuery.toLowerCase() && saved.page === page && saved.products.length && Date.now() - Date.parse(saved.fetchedAt) < CACHE_TTL_MS) {
      searchCache.set(cacheKey, { expiresAt: Date.parse(saved.fetchedAt) + CACHE_TTL_MS, value: saved });
      return { ...saved, cached: true };
    }
  } catch { /* An unavailable or expired snapshot never substitutes another query. */ }

  const url = new URL("/s", AMAZON_ORIGIN);
  url.searchParams.set("k", normalizedQuery);
  url.searchParams.set("page", String(page));
  url.searchParams.set("language", "en_US");

  const capturedAt = new Date().toISOString();
  const fetched = await fetchAmazonHtml(
    url.toString(),
    (html) => parseSearchProducts(html, page, capturedAt).length > 0,
  );
  const products = parseSearchProducts(fetched.html, page, capturedAt);

  const result: SearchResponse = {
    query: normalizedQuery,
    page,
    resultCount: products.length,
    products,
    source: fetched.source,
    fetchedAt: capturedAt,
    cached: false,
    attempts: fetched.attempts,
  };

  searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  try { await mkdir(cacheDir, { recursive: true }); await writeFile(cacheFile, JSON.stringify(result), "utf8"); } catch { /* A cache write must not break a successful search. */ }
  return result;
}

export async function searchAmazon(query: string, page: number): Promise<SearchResponse> {
  const key = `${normalizeText(query).toLowerCase().slice(0, 120)}::${page}`;
  const pending = searchPending.get(key);
  if (pending) return pending;
  const failed = searchFailures.get(key);
  if (failed && failed.until > Date.now()) throw failed.error;
  const work = loadAmazonSearch(query, page).then((result) => { searchFailures.delete(key); return result; }).catch((error: Error) => {
    if (searchFailures.size > 100) searchFailures.clear();
    searchFailures.set(key, { until: Date.now() + 15000, error });
    throw error;
  }).finally(() => searchPending.delete(key));
  searchPending.set(key, work);
  return work;
}

function extractAttributes(text: string) { return extractDesignAttributes(text); }

function parseColorNames($: cheerio.CheerioAPI, html: string) {
  const names = $("#variation_color_name li img[alt], #variation_color_name li [title], #inline-twister-row-color_name img[alt]")
    .map((_, item) => normalizeText($(item).attr("alt") ?? $(item).attr("title") ?? ""))
    .get()
    .filter((value) => value.length > 0 && value.length < 60);
  $('script[type="a-state"][data-a-state*="desktop-twister-sort-filter-data"]').each((_, item) => {
    try {
      const parsed = JSON.parse($(item).text()) as {
        sortedDimValuesForAllDims?: {
          color_name?: Array<{ dimensionValueDisplayText?: unknown }>;
        };
      };
      for (const color of parsed.sortedDimValuesForAllDims?.color_name ?? []) {
        if (typeof color.dimensionValueDisplayText === "string") names.push(color.dimensionValueDisplayText);
      }
    } catch {
      // The visible twister swatches remain available when Amazon changes embedded state.
    }
  });
  const variationMatch = html.match(/"color_name"\s*:\s*(\[[^\]]+\])/i);
  if (variationMatch) {
    try {
      const parsed = JSON.parse(variationMatch[1]);
      if (Array.isArray(parsed)) names.push(...parsed.filter((value): value is string => typeof value === "string"));
    } catch {
      // Swatch DOM values remain available when embedded JSON is malformed.
    }
  }
  return Array.from(new Set(names.map((name) => normalizeText(name).replace(/^Z\s+/i, ""))));
}

function detailCompleteness(details: Omit<ProductDetails, "completeness" | "extractionStatus">) {
  const present = [
    details.brand,
    details.bullets.length,
    details.colors.length || details.colorCount,
    details.bsr,
    details.firstAvailable,
    details.attributes.length,
  ].filter(Boolean).length;
  return Math.round((present / 6) * 100);
}

function parseProductDetails(
  html: string,
  source: "amazon-direct" | "amazon-reader",
): ProductDetails {
  const $ = cheerio.load(html);
  const bullets = $("#feature-bullets li span.a-list-item")
    .map((_, item) => normalizeText($(item).text()))
    .get()
    .filter((value) => value.length > 12)
    .slice(0, 10);
  const title = normalizeText($("#productTitle").text()) || normalizeText($("h1").first().text());
  const brand = normalizeText($("#bylineInfo").text())
    .replace(/^Visit the | Store$/gi, "")
    .replace(/^Brand:\s*/i, "") || null;
  const detailText = normalizeText(
    $("#productDetails_detailBullets_sections1, #detailBullets_feature_div, #productOverview_feature_div").text(),
  );
  const pageText = normalizeText($.root().text());
  const bsrMatch = `${detailText} ${pageText}`.match(/Best Sellers Rank\s*#?([\d,]+[^#]{0,80})/i);
  const firstAvailableMatch = `${detailText} ${pageText}`.match(
    /Date First Available\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
  );
  const availability = normalizeText($("#availability").text()) || null;
  const colors = parseColorNames($, html);
  const colorCount = colors.length || $("#variation_color_name li").length || null;
  const attributes = extractAttributes(`${title} ${bullets.join(" ")} ${detailText.slice(0, 2000)}`);
  const base = {
    listingTitle: title, brand, bullets, colorCount, colors,
    bsr: bsrMatch ? normalizeText(`#${bsrMatch[1]}`) : null,
    firstAvailable: firstAvailableMatch?.[1] ?? null,
    availability, attributes, source,
  };
  const completeness = detailCompleteness(base);
  return { ...base, completeness, extractionStatus: completeness >= 67 ? "complete" : "partial" };
}

function mergeDetails(primary: ProductDetails, secondary: ProductDetails) {
  const base = {
    listingTitle: primary.listingTitle || secondary.listingTitle,
    brand: primary.brand ?? secondary.brand,
    bullets: Array.from(new Set([...primary.bullets, ...secondary.bullets])).slice(0, 10),
    colorCount: Math.max(primary.colorCount ?? 0, secondary.colorCount ?? 0) || null,
    colors: Array.from(new Set([...primary.colors, ...secondary.colors])),
    bsr: primary.bsr ?? secondary.bsr,
    firstAvailable: primary.firstAvailable ?? secondary.firstAvailable,
    availability: primary.availability ?? secondary.availability,
    attributes: Array.from(new Set([...primary.attributes, ...secondary.attributes])),
    source: "merged" as const,
  };
  const completeness = detailCompleteness(base);
  return { ...base, completeness, extractionStatus: completeness >= 67 ? "complete" as const : "partial" as const };
}

export async function getAmazonProductDetails(asin: string): Promise<ProductDetails> {
  const cacheKey = `v4::${asin}`;
  const cached = detailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = `${AMAZON_ORIGIN}/dp/${asin}?language=en_US`;
  const isProductPage = (html: string) => /id\s*=\s*["'](?:productTitle|title|feature-bullets)["']/i.test(html);
  const fetched = await fetchAmazonHtml(url, isProductPage);
  let details = parseProductDetails(
    fetched.html,
    fetched.source === "amazon.com-live" ? "amazon-direct" : "amazon-reader",
  );
  if (details.extractionStatus === "partial" && details.source === "amazon-direct") {
    try {
      const html = await fetchReaderHtml(url);
      if (!isProductPage(html)) throw new Error("备用通道未返回商品详情");
      const reader = parseProductDetails(html, "amazon-reader");
      details = mergeDetails(details, reader);
    } catch {
      // Keep the usable direct fields when the fallback source is unavailable.
    }
  }

  detailCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: details });
  return details;
}
