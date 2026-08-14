# Agent Context

`.agent/` 保存跨 agent、跨会话共享的项目上下文。它不是秘密存储，也不是临时日志目录。

## 阅读顺序

1. `agent.md`：先看当前状态和下一步。
2. `context.md`：理解项目背景、术语和架构边界。
3. `decisions.md`：确认哪些选择已经冻结。
4. `workflow.md`：执行协作、验证、提交和安全流程。

## 更新规则

- `agent.md` 是活跃交接文档，每个里程碑或阻塞状态变化后更新。
- `context.md` 只记录低频变化的稳定事实；架构改变时更新。
- `decisions.md` 采用追加式 ADR 记录，不删除历史决策；被替代时注明替代关系。
- `workflow.md` 只有协作规范变化时才更新。
- 不写入凭据、私有 URL、Cookie、完整本机路径或未经验证的 API 细节。
