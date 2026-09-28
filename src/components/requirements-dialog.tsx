import { pageRequirements, requirementVersion } from "@/lib/page-requirements";
export function RequirementsDialog({ step }: { step: number }) {
  const page = pageRequirements[step] ?? pageRequirements[0];
  return <div className="requirements-toolbar"><span>{requirementVersion}</span><a className="secondary-button" href={`/requirements/${step}`} target="_blank" rel="noopener noreferrer">需求文档 · {page.title}<span aria-hidden="true"> ↗</span></a></div>;
}
