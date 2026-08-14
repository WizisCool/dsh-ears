# Security Policy

## Scope

dsh-ears 可能接触语音输入、dsh 模型配置和可选的 ASR 服务配置。当前版本尚未实现这些运行时功能，但从现在开始按公开仓库标准处理安全问题。

## Never commit

- API Key、OAuth token、Cookie、密码或私钥。
- 包含凭据的 dsh profile、`.env` 文件或本机配置导出。
- 用户语音、转录文本、日志和个人数据。
- 带内部域名、内网地址或个人绝对路径的配置和文档。

## Reporting

如果发现疑似凭据泄露或安全问题，请不要创建包含秘密的公开 issue。先停止相关提交和发布，通过维护者的私下渠道报告，并提供最小必要复现信息。

## Release rule

公开仓库转换、npm 发布和 push 都不是默认动作，必须在发布前完成人工审查、敏感信息扫描和验证记录。
