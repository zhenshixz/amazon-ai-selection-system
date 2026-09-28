<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 逐页需求说明维护

产品版本历史入口位于文档最顶部公共页头。报告字段需求维护于 `src/lib/report-field-requirements.ts`，逐项写字段含义、获取/计算、展示与交互规则；正文描述产品应有行为。故障原因、待修复、验证进度记入内部审查/问题清单，不混入报告字段需求正文；不得把需求规则的补充当成业务实现完成。

运营阅读正文维护在 `src/lib/requirements-reader.ts`：用中文业务语言和具体例子说明，不堆字段名或公式。各页顶部显示修订历史，截图保存在 `public/requirements-images`；界面/按钮调整后同步相关截图并注明历史资料或截图状态。数据与AI单独路由 `/requirements/data`，技术契约可展开阅读。更新文档不得为截图调用付费生图；可回放已有真实资料并明确标注，不能把回放当成业务验收。

后续业务改动同步页面正文及相关模块、交互、API和口径。`requirementRevisions` 只记录产品版本，目前只有 BETA；没有确认新产品版本时，不新增“修订02/03”等版本，不把文档排版、解释重写或调试过程展示为版本历史。这些内部过程轻量记录在 `docs/ISSUE_TRACKER.md`。独立文档路由为 `/requirements/0` 至 `/requirements/6`，不得挂载业务组件或触发付费调用。明确区分已实现、待修复、待验收，不能用接口健康代替业务闭环验收。
