import Link from "next/link";
import { pageRequirements } from "@/lib/page-requirements";

export function RequirementsNavigation({ current }: { current: string }) {
  const pageSections = [["overview", "使用流程"], ["screens", "页面与按钮"], ["modules", "内容与规则"], ...(current === "6" ? [["report", "报告字段说明"]] : []), ["acceptance", "验收标准"]];
  const dataSections = [["scenarios", "场景与数据来源"], ["model-inputs", "AI分析传入内容"], ["division", "程序与模型分工"], ["metrics", "指标含义"]];
  function node(id: string, title: string) {
    const active = current === id;
    return <li key={id}><Link className="req-page-node" href={`/requirements/${id}`} aria-current={active ? "page" : undefined}>{title}</Link>{active && <ul className="req-section-tree" aria-label="当前页面章节">{(id === "data" ? dataSections : pageSections).map(([anchor, label]) => <li key={anchor}><a href={`#${anchor}`}>{label}</a></li>)}</ul>}</li>;
  }
  return <aside className="spec-sidebar"><nav className="req-tree" aria-label="需求文档目录"><section><h2>01 产品总览</h2><ul>{node("0", "整体需求与首页")}</ul></section><section><h2>02 业务页面</h2><ul>{pageRequirements.slice(1).map((p, index) => node(String(index + 1), p.title))}</ul></section><section><h2>03 数据与技术说明</h2><ul>{node("data", "数据、API与大模型")}</ul></section></nav></aside>;
}
