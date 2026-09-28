import { createImageJob, imageBytes, readImageJob } from "@/lib/image-jobs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 12000) return Response.json({ error: "请求过大" }, { status: 413 });
    return Response.json(await createImageJob(JSON.parse(text)), { status: 202 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 400 }); }
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (url.searchParams.has("file")) {
    const file = await imageBytes(id, url.searchParams.get("file") === "original", url.searchParams.get("file") === "preview");
    if (!file) return new Response("图片尚不可用", { status: 404 });
    return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=86400", ...(url.searchParams.has("download") ? { "Content-Disposition": 'attachment; filename="design-concept.png"' } : {}) } });
  }
  const job = await readImageJob(id);
  return Response.json(job ?? { error: "任务不存在" }, { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
