# 质量优先模型配置

2026-11-06，用户要求在代码中改为最强模型。

从当前账号的 Anna `llm.catalog()` 实际目录选择高端文本/视觉模型 `anthropic/claude-fable-5.1`。目录没有能力排行榜，此选择不代表经过本应用任务评测后证明其绝对最强。来源：Anna runtime catalogue；API 参数见 [官方文档](https://staging.anna.partners/developers/apps/llm-and-agent)。

配置位于 `src/lib/platform.ts` 的 `APP_MODEL`。所有文本和视觉调用通过 exact-name hint 指向该模型，intelligencePriority=1，costPriority=speedPriority=0；返回模型不匹配则携实际用量报错，避免把平台回退当作切换成功。

实测该端点拒绝 thinking=false，虽然目录声称 canDisable=true。改为 budgetTokens=2048，并将每阶段原输出预算增加2048，为推理保留空间；SDK 对超过8192的 complete 请求自动走流式传输。仍检测截断和记录实际用量。

真实 staging 冒烟验证：

- 文本：实际模型 anthropic/claude-fable-5.1，回复 OK，endTurn，0.32759 CU。
- 图片：64×64纯红测试图，实际模型相同，回复 Red，endTurn，0.47414 CU。
- 成功调用合计0.80172 CU；此前一次禁用推理请求被上游400拒绝，未返回可核对的用量，不能保证其收费为零。
- 31项单元测试通过，生产构建和 Anna strict validate 通过。

当前目录报价每百万输入8620.69 CU、输出43103.45 CU（MiMo基线为120.69/241.38）。切换质量优先会显著提高成本。本轮仅验证路由及文本/图片可用，尚未用新模型重跑整篇论文，不能沿用MiMo时代的速度/图表准确率结论。已有项目的缓存不会自动失效，旧大纲/幻灯片不会因换模型而自动重做；重新生成或新建项目时才调用新模型。

## 后续选择：MiMo Pro

用户随后撤回高价模型选择，改为 MiMo Pro。当前配置以源码为准：文本使用 `xiaomi/mimo-v2.5-pro`；图表视觉使用 `xiaomi/mimo-v2.5`，因为当前 Anna catalogue 将 Pro 的 supportsVision 标为 false。关闭可选推理，恢复每阶段原输出上限，继续核对实际返回模型和记录用量。以上 Fable 冒烟结果仅为历史记录，不代表当前配置。本次 Pro 切换完成构建和严格校验；未重跑整篇论文。

## 最终选择：全部恢复 MiMo-V2.5

用户再次明确要求全部调回 MiMo-V2.5。当前所有文本与图片请求统一使用 `xiaomi/mimo-v2.5`，移除 Pro/视觉分流，保持 thinking=false、原阶段输出上限及实际返回模型检查。历史 Fable/Pro 配置均已被替代。
