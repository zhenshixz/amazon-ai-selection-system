import { searchAmazon } from "@/lib/amazon";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.min(Math.max(Number(url.searchParams.get("page")) || 1, 1), 5);

  if (query.length < 2) {
    return Response.json({ error: "请输入至少 2 个字符的关键词。" }, { status: 400 });
  }

  try {
    return Response.json(await searchAmazon(query, page));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon search failed.";
    return Response.json({ error: message, retryable: false }, { status: 502 });
  }
}
