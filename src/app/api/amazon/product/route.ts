import { getAmazonProductDetails } from "@/lib/amazon";
import { enrichAnchorVision } from "@/lib/anchor-vision";

export async function GET(request: Request) {
  const asin = new URL(request.url).searchParams.get("asin")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return Response.json({ error: "ASIN 格式无效。" }, { status: 400 });
  }

  try {
    const details = await getAmazonProductDetails(asin);
    const image = new URL(request.url).searchParams.get("image");
    return Response.json({ asin, details: image ? await enrichAnchorVision(details, image) : details });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon product extraction failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
