import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProxyAgent, fetch as proxyFetch } from "undici";

const run = promisify(execFile);
let cached: { until: number; uri: string; agent: ProxyAgent | null } | undefined;
let retryAfter = 0;

// Only Amazon collection uses this transport; model/API credentials never pass through it.
export async function amazonProxy() {
  if (cached && cached.until > Date.now()) return cached.agent;
  let uri = process.env.AMAZON_PROXY_URL?.trim() ?? "";
  if (!uri && process.platform === "win32") {
    try {
      const { stdout } = await run("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { timeout: 2000, windowsHide: true });
      if (/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(stdout)) {
        const value = stdout.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/)?.[1].trim() ?? "";
        uri = value.includes("=") ? value.match(/(?:^|;)https=([^;]+)/)?.[1] ?? "" : value;
      }
    } catch { /* No system proxy: retain normal direct/reader collection. */ }
  }
  if (uri === "off") uri = "";
  if (uri && !uri.includes("://")) uri = `http://${uri}`;
  try { if (uri && !["http:", "https:"].includes(new URL(uri).protocol)) uri = ""; } catch { uri = ""; }
  if (cached?.uri === uri) { cached.until = Date.now() + 30000; return cached.agent; }
  if (cached?.agent) void cached.agent.close().catch(() => undefined);
  cached = { until: Date.now() + 30000, uri, agent: uri ? new ProxyAgent(uri) : null };
  return cached.agent;
}

export async function fetchAmazonViaProxy(url: string, headers: Record<string, string>) {
  if (Date.now() < retryAfter) return null;
  let agent = await amazonProxy();
  if (!agent) return null;
  const signal = AbortSignal.timeout(8000);
  try {
    try {
      return await proxyFetch(url, { dispatcher: agent, headers, signal });
    } catch (error) {
      const code = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
      if (signal.aborted || !["ECONNRESET", "UND_ERR_SOCKET"].includes(code ?? "")) throw error;
      // One reconnect for a broken socket, sharing the original time budget.
      if (cached?.agent === agent) cached = undefined;
      void agent.close().catch(() => undefined);
      agent = await amazonProxy();
      if (!agent) throw error;
      return await proxyFetch(url, { dispatcher: agent, headers, signal });
    }
  } catch (error) {
    // Re-read changed system settings and discard broken connections on the next probe.
    if (agent && cached?.agent === agent) { cached = undefined; void agent.close().catch(() => undefined); }
    retryAfter = Date.now() + 15000;
    throw error;
  }
}
