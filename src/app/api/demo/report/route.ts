import { buildDemoReport } from "@/lib/demo-report";

export async function GET() {
  try {
    const payload = await buildDemoReport();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "演示报告生成失败" },
      { status: 500 },
    );
  }
}
