"use client";
import { FEATURE_RULES, extractDesignAttributes, featureDimension, productDesignText } from "@/lib/keyword-candidates";
import type { AmazonProduct } from "@/types/product";

export function AnchorFeatureEditor({ product, disabled, onChange }: { product: AmazonProduct; disabled: boolean; onChange: (asin: string, changes: Record<string, boolean>) => void }) {
  const detected = extractDesignAttributes(productDesignText(product));
  const dimensions = Array.from(new Set(FEATURE_RULES.map(rule => featureDimension(rule.label))));
  return <details className="anchor-feature-editor"><summary>核对 / 纠正原款特征 · {product.asin}</summary><p>每项可选“按识别结果”“确认存在”“确认不存在”。保存即时生效，旧关键词验证和报告会清除，需继续下一步重新查询分析。只确认有原文或图片依据的特征。</p><div className="tag-list">{detected.map(label => <span key={label}>{label}{product.featureCorrections?.[label] === true ? " · 人工确认" : ""}</span>)}</div><div className="feature-correction-grid">{dimensions.map(dimension => <fieldset key={dimension}><legend>{dimension}</legend>{FEATURE_RULES.filter(rule => featureDimension(rule.label) === dimension).map(rule => <label key={rule.label}><span>{rule.label}</span><select aria-label={`${product.asin} ${rule.label}`} disabled={disabled} value={product.featureCorrections?.[rule.label] === undefined ? "auto" : String(product.featureCorrections[rule.label])} onChange={event => { const changes = { ...product.featureCorrections }; if (event.target.value === "auto") delete changes[rule.label]; else changes[rule.label] = event.target.value === "true"; onChange(product.asin, changes); }}><option value="auto">按识别结果</option><option value="true">确认存在</option><option value="false">确认不存在</option></select></label>)}</fieldset>)}</div></details>;
}
