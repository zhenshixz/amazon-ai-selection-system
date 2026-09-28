export async function GET() {
  return Response.json({
    status: "ok",
    service: "amazon-ai-selection-system",
    runtime: process.env.NODE_ENV,
  });
}
