import { runAnalysisPipeline } from "@/lib/analysis-pipeline";
import type { AmazonProduct, KeywordValidationResult } from "@/types/product";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query?: string;
      products?: AmazonProduct[];
      anchors?: AmazonProduct[];
      keywordValidation?: KeywordValidationResult;
    };
    const query = body.query?.trim() ?? "";
    const products = Array.isArray(body.products) ? body.products.slice(0, 250) : [];
    const anchors = Array.isArray(body.anchors) ? body.anchors.slice(0, 9) : [];
    if (!query || products.length === 0) {
      return Response.json({ error: "分析需要关键词和竞品数据。" }, { status: 400 });
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const result = await runAnalysisPipeline(query, products, anchors, body.keywordValidation, (event) => {
            send({ type: "stage", ...event });
          });
          send({ type: "result", result });
        } catch (error) {
          send({ type: "error", error: error instanceof Error ? error.message : "分析任务失败" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "分析请求格式无效。" }, { status: 400 });
  }
}
