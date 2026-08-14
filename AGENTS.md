# dsh-ears Agent Instructions

本文件是仓库级 coding agent 入口。所有 agent 在修改代码或文档前必须阅读它，并按引用顺序读取项目上下文。

## 阅读顺序

1. `PLAN.md`：产品目标、范围、里程碑和验收条件。
2. `.agent/agent.md`：当前状态、正在进行的工作和交接信息。
3. `.agent/context.md`：稳定背景、架构边界和术语。
4. `.agent/decisions.md`：已确认决策，不能未经确认推翻。
5. `.agent/workflow.md`：协作、验证、提交和安全规则。

## 当前基线

- 工作区：当前 Git 仓库根目录（用 `git rev-parse --show-toplevel` 确认）。
- dsh：`0.1.0-rc.6`；第一版不承诺其他 rc 版本。
- 当前阶段：文档与协作基线已完成，M1 尚未开始。
- 当前只允许本地工作；未经用户明确授权不得 `git push`、创建远程仓库或发布包。

## 修改规则

- 先查上下文，再修改；不根据猜测补齐未确认的 dsh API。
- 一次只处理一个可独立验收的原子目标。
- 使用明确的 `git add <path...>`，禁止无审查的 `git add -A`。
- 提交使用 Conventional Commits，提交信息描述领域行为，例如 `feat(client): add web speech draft updates`。
- 每个提交前运行与改动匹配的验证，并执行 `git diff --cached --check`。
- 不把构建产物、`.dsh/` 本地 patch、日志或个人机器路径提交到仓库。
- 文档、代码、测试和配置的边界要清楚；不要为了顺手而做无关重构。

## 安全规则

- API Key、OAuth token、Cookie、私有 URL、个人数据和本机绝对路径不得进入提交。
- 示例只能使用占位值，例如 `YOUR_API_KEY`；不能使用真实凭据做示例。
- 润色调用复用 dsh Host 侧的 provider/model 与 credentials；插件不新增浏览器端密钥存储。
- 发现疑似敏感信息时先停止提交，移除并检查 Git diff；不要把秘密复制到 agent 上下文文件。

## 交接要求

完成一个阶段后更新 `.agent/agent.md`，记录：已完成内容、验证命令和结果、未完成事项、阻塞点、下一步建议。不要把临时猜测写成已确认事实。
