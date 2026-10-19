# The Boss 贡献指南

[English](CONTRIBUTING.md) | 中文

请通过[本仓库](https://github.com/Prometheus-AGS/the-boss)为 The Boss 桌面工作区、文档或集成功能作出贡献。从已观察到的问题或明确需求出发，控制变更范围，并保留范围之外的现有行为。

## 开始之前

请阅读[行为准则](CODE_OF_CONDUCT.md)、[许可证](LICENSE)及 [CLAUDE.md](CLAUDE.md) 中的仓库说明。请按[开发指南](docs/contrib/development.md)配置固定版本的 Node/pnpm 环境。当前开发以本仓库的 `main` 分支为目标。

请通过 [GitHub Issues](https://github.com/Prometheus-AGS/the-boss/issues) 报告可复现的缺陷或提出工作建议。提供相关平台、版本、步骤、预期行为和证据，不要包含凭据或私人用户数据。

## UI/UX 与团队工作流程

请阅读 [UI/UX 路由与团队采用指南](docs/contrib/ui-ux-routing.md)，了解可移植技能目录、项目安装和证据限制。现有的 [boss-core 团队](.agent-team/boss-core/README.md)规定角色职责：`boss-ux` 负责可用性与设计材料，`boss-renderer` 实现渲染器变更，`boss-verifier` 在工具支持时独立审查已完成的验收工作。

遵循 [DESIGN.md](DESIGN.md)、共享设计令牌和现有 Electron 工具。路由指南不授权新配色、框架、依赖或重新设计。仅涉及后端的任务使用相应团队角色，不加载 UI 指南。

## 实现与验证

在验证边界之前完成连贯的生产变更。通过实际的 UI、IPC、进程、文件系统、数据库或协议路径验证承诺的行为。单元测试或纯模拟结果不能证明工作完成。记录实际执行的命令、源码边界、证据路径、失败情况及无法执行的平台检查。

修改文档时，编辑标题和 frontmatter，然后运行 `pnpm docs:index` 重新生成[索引](docs/README.md)。在完整文档边界运行 `pnpm docs:check`；它检查链接、结构、frontmatter 与来源路径，以及索引是否为最新。

UI 验收还需要适用的截图和交互证据以及独立审查。路由助手的 `phase-boundary` 结果仅表示需要证据，并不代表已经运行测试或获得 PASS。

## Pull Request

使用聚焦的分支和 Conventional Commit 信息。说明问题、最终行为、范围和实际验证。遵循 [.github/pull_request_template.md](.github/pull_request_template.md)及仓库的 `gh-create-pr` 工作流程。Draft PR 可以传达工作尚未完成，但不能把草稿状态或自动检查通过当作验收证明。

### 贡献者认证

继承的贡献政策要求人类贡献者证明其有权依据[许可证](LICENSE)贡献代码。人类贡献者使用常规提交尾注进行认证：

```text
Signed-off-by: Your Name <your.email@example.com>
```

这项人类认证与提交的密码学签名不同。代理必须遵循当前操作员和仓库关于生成内容归属的说明，不得伪造人类认证。

## 发布与上游

请使用 [The Boss 发布工作流程](docs/contrib/the-boss-release.md)进行分叉版本发布和安装后的验收。源码合并不能证明其已包含在现有的已发布安装包中。

本项目源自 Cherry Studio。保留上游归属、声明和兼容性标识。遵循[上游合并政策](docs/contrib/upstream-merges.md)；上游服务名称和历史数据标识并非表面品牌文字。
