"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AmazonProduct, DesignProposal } from "@/types/product";
import type { ImageJob } from "@/lib/image-jobs";

export function DesignImageEditor({ anchor, proposal, reportId, children, autoGenerate = true, presetJobId }: { anchor: AmazonProduct; proposal: DesignProposal; reportId: string; children?: ReactNode; autoGenerate?: boolean; presetJobId?: string }) {
  const storageKey = `design-image:${reportId}:${anchor.asin}:${proposal.id}:${proposal.targetFeature}`;
  const automaticPrompt = proposal.action && proposal.action.length > 8 ? proposal.action : `将${proposal.sourceFeature || "指定部位"}改为${proposal.targetFeature}，其他部位保持不变。`;
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(automaticPrompt);
  const [expanded, setExpanded] = useState(false);
  const [model, setModel] = useState("gemini-3.1-flash-image-preview");
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState<ImageJob | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const attempted = useRef(false);
  const busy = useRef(false);
  const attemptKey = `${storageKey}:attempted`;
  const jobId = job?.id;
  const jobStatus = job?.status;
  const hasImage = job?.status === "complete" || job?.status === "needs_review";
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        if (presetJobId) {
          // 演示预置图：直接读取预置任务，不走 localStorage，也不自动提交生图
          const response = await fetch(`/api/design-images?id=${presetJobId}`, { cache: "no-store" });
          const current = response.ok ? await response.json() as ImageJob : null;
          if (!cancelled && current) { setJob(current); setPrompt(current.prompt); setModel(current.model); }
          return;
        }
        attempted.current = Boolean(localStorage.getItem(attemptKey));
        const stored = localStorage.getItem(storageKey);
        if (!stored) {
          if (attempted.current && !cancelled) setError("本方案已经提交过，未取得任务结果。请确认后手动重试相同指令，系统不会自动再次生成。");
          return;
        }
        const saved = JSON.parse(stored) as ImageJob;
        const response = await fetch(`/api/design-images?id=${saved.id}`, { cache: "no-store" });
        const current = response.ok ? await response.json() as ImageJob : saved;
        if (!cancelled) { setJob(current); setPrompt(current.prompt); setModel(current.model); }
      } catch { /* In-memory guard still prevents repeat submissions. */ }
      finally { if (!cancelled) setRestored(true); }
    };
    void restore();
    return () => { cancelled = true; };
  }, [storageKey, attemptKey, presetJobId]);
  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/design-images?id=${jobId}`, { cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json() as ImageJob;
        if (!stopped) { setJob(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep result usable. */ } }
      } catch { /* A polling failure must never trigger another paid generation. */ }
    };
    const timer = setInterval(check, 2000);
    void check();
    return () => { stopped = true; clearInterval(timer); };
  }, [jobId, jobStatus, storageKey]);
  const submit = async (automatic = false) => {
    if (busy.current || sending || job?.status === "running" || (!automatic && !confirmed)) return;
    busy.current = true;
    attempted.current = true;
    try { localStorage.setItem(attemptKey, new Date().toISOString()); } catch { /* Server also deduplicates. */ }
    setSending(true); setError("");
    try {
      const response = await fetch("/api/design-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, model, anchorAsin: anchor.asin, imageUrl: anchor.image, keep: proposal.retainedFeatures ?? [], nonce: `${storageKey}:${job?.id ?? "first"}` }) });
      const responseText = await response.text();
      let next: ImageJob & { error?: string };
      try {
        next = JSON.parse(responseText) as ImageJob & { error?: string };
      } catch {
        throw new Error(response.ok ? "服务返回了空响应，请稍后重试" : `服务暂时不可用（HTTP ${response.status}）`);
      }
      if (!response.ok) throw new Error(next.error || "提交失败");
      setJob(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Server still retains the image. */ }
      if (!automatic) setOpen(true);
    } catch (e) { setError(`${e instanceof Error ? e.message : "网络异常"}。没有自动重新生成；相同提交会去重。`); }
    finally { busy.current = false; setSending(false); }
  };
  // submit intentionally stays out of dependencies; this timer is keyed by the report task.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!autoGenerate || presetJobId || !restored || job || sending || attempted.current) return;
    const timer = window.setTimeout(() => { if (!attempted.current) void submit(true); }, 900);
    return () => window.clearTimeout(timer);
  }, [autoGenerate, storageKey, job, sending, restored, presetJobId]);
  /* eslint-enable react-hooks/exhaustive-deps */
  return <div className="design-image-editor">
    {error && <p className="proposal-result-description" role="alert">{error}</p>}
    {job && job.prompt !== automaticPrompt && <p className="proposal-result-description">当前为自定义改款。下方需求数据属于原推荐方向，不作为本次新方向的验证结论。</p>}
    <div className="proposal-result">
      {hasImage && job ? <>
        {/* eslint-disable-next-line @next/next/no-img-element -- Persisted same-origin generated result. */}
        <button type="button" className="proposal-result-image" onClick={() => setExpanded(true)} aria-label="放大改款图并对比原图"><img src={`/api/design-images?id=${job.id}&file=preview`} alt="AI 改款概念图" /></button>
        <span className="image-role-label">AI 改款结果 · {job.afterReview?.decision === "pass" ? "自动核验通过，待人工确认" : "待核验"}</span>
        <p className="proposal-result-description"><strong>本图改动：</strong>{job.prompt}</p>
        <div className="proposal-result-actions"><button type="button" className="secondary-button" onClick={() => setExpanded(true)}>与原图对比</button><a className="secondary-button" href={`/api/design-images?id=${job.id}&file=result&download=1`}>下载改款图</a></div>
      </> : <div className="proposal-result-empty"><strong>{job?.status === "running" ? "正在生成改款图" : error || job?.status === "failed" || job?.status === "needs_revision" ? "生成已停止，请确认后重试" : "正在准备 AI 改款图"}</strong><span>{job?.status === "running" ? job.phase : error ? "不会自动再次提交" : "按推荐方向生成，结果将直接显示"}</span><button type="button" className="secondary-button" onClick={() => setOpen(true)}>查看或修改指令</button></div>}
      {job?.error && <p className="proposal-result-description" role="alert">{job.error}</p>}
    </div>
    {children}
    <div className="proposal-custom-entry"><button type="button" className="secondary-button" onClick={() => setOpen(!open)}>{open ? "收起自定义改款" : "自定义改款 / 修改指令"}</button></div>
    {open && <div className="design-image-panel">
      <strong>确认一个明确改动</strong>
      <p>参考方向：{proposal.targetFeature}。请明确具体部位及改前、改后差异；系统会先检查原图，再决定是否生成。</p>
      <textarea aria-label="改款图片指令" placeholder="例如：去掉袖口荷叶边，改为平直窄袖口，其他部位保持不变。" value={prompt} maxLength={800} onChange={(e) => { setPrompt(e.target.value); setConfirmed(false); }} disabled={sending || job?.status === "running"} />
      <p>保留：{proposal.retainedFeatures?.join("、") || "未指定修改的结构"}；模特、背景和其他部位保持一致。</p>
      <select aria-label="生图模型" value={model} onChange={(e) => setModel(e.target.value)} disabled={sending || job?.status === "running"}><option value="gemini-3.1-flash-image-preview">Nano Banana 2 · Preview</option><option value="gemini-3.1-flash-lite-image">Nano Banana Lite</option></select>
      <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我已核对原款，明确了修改部位和目标</label>
      <button type="button" className="primary-button" onClick={() => void submit()} disabled={!confirmed || prompt.trim().length < 4 || sending || job?.status === "running"}>{sending ? "提交中…" : job?.status === "running" ? "生成中，请勿重复提交" : job ? "重新生成一张（再次计费）" : "确认生成一张（计费）"}</button>
      {!sending && !job && confirmed && prompt.trim().length < 4 && <small>请把改动写完整，例如“袖口去掉荷叶边，改为平直袖口”。</small>}
      {error && <p role="alert">{error}</p>}
      {job?.status === "running" && <p>{job.phase ?? "准备读取原图"}。不会自动重新生图；核验与生图均使用 API 额度。</p>}

    </div>}
    {expanded && hasImage && job && <div className="image-compare-overlay" role="dialog" aria-modal="true" aria-label="改款同尺寸对比">
      <button className="secondary-button" type="button" onClick={() => setExpanded(false)}>关闭对比</button>
      <div className="image-compare-equal">
        {/* eslint-disable-next-line @next/next/no-img-element -- Stored image pair in identical frames. */}
        <figure><img src={`/api/design-images?id=${job.id}&file=original`} alt="放大锚点原图" /><figcaption>锚点原图</figcaption></figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- Stored image pair in identical frames. */}
        <figure><img src={`/api/design-images?id=${job.id}&file=preview`} alt="放大生成结果" /><figcaption>生成结果 · {job.afterReview?.decision === "pass" ? "自动核验通过，待人工确认" : "待核验"}</figcaption></figure>
      </div><p>{job.prompt}</p>
    </div>}
  </div>;
}
