# laya-mcp

[Laya](https://github.com/NandhaKishorM/laya) 有类型决策的 MCP server——`noul`（是/否）、`choice`、`score`——包装成经得起服务器环境的样子。

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```bash
npx -y laya-mcp --help
```

已在官方 MCP Registry 登记为 [`io.github.PerryLink/laya-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=perrylink)。

> **这个 npm 包是启动器，不是实现。** Laya 是 PyTorch 模型，所以 server 本身是 Python。装这个包只得到 Node 入口，别的什么都没有；你还需要 Python 那边：
>
> ```bash
> pip install "laya-mcp[mcp]"
> ```
>
> `npx laya-mcp` 会找到那个解释器，把 stdio 交给它，并把 MCP 流原样透传。它不会替你安装任何东西——因为跑一条命令而顺带拉取 torch（约 2 GB）和一个 checkpoint（约 650 MB），不是启动器该做的事。

### 如果它找不到你的 Python

在 Windows 上，PATH 里的 `python` 往往是 Microsoft Store 的执行别名，它是个桩：什么都 import 不了，却排在你真正的解释器前面。因此启动器会报告它试过什么，而不是声称包没装。两种情况都可以直接指名解释器：

```bash
# 直接指名
set LAYA_MCP_PYTHON=C:\path\to\python.exe        # Windows
export LAYA_MCP_PYTHON=/path/to/python           # macOS、Linux

# 或者直接激活你装它的那个 virtualenv —— VIRTUAL_ENV 会被采纳
```

> `LAYACORE_PYTHON` 仍然会被读取。0.1.0 和 0.1.1 在错误信息里印的就是这个名字，一个不再兑现自己上一版所教你设置的环境变量的启动器，比一个带着旧别名的启动器更糟。

> **状态：0.1.5，开发中。** Python 核心已实现并有 CI 覆盖。启动器自身由十项解释器发现检查覆盖——那正是它以前出过错的地方。1.0 之前接口可能变动。

---

## 它为什么存在

Laya 会静默截断东西，而且什么都不报告：

- **它从末尾切掉 state。** 一份长文档丢掉尾部——对合同或邮件线程来说，那往往就是答案所在——而模型就着残存的前缀以满格置信度作答。
- **它把选项压缩到标签无法区分。** 选项共享一个固定的逐问题 token 预算；超过某个点后每个标签只剩约 4 个 token。这是有据可查的高基数选择崩塌原因。
- **它的 `confidence` 不是准确率。** 它是一个归一化熵：概率铺开时低——即使首选选项是对的，自信地答错时高。
- **遇到 CUDA OOM 它会把自己降级到 CPU**，永久性地，不设任何标志位——慢大约 10–15 倍，而响应里什么都不说。

本包补上一个报告会切掉什么的预检、指出出错问题的结构化错误、一份诚实的置信度契约，以及一个承认降级的健康面。

## 用法

```bash
laya-mcp serve      # 127.0.0.1:8787 上的常驻 HTTP sidecar（只加载一次模型）
laya-mcp mcp        # 走 stdio 的 MCP
laya-mcp doctor     # 装了什么，以及 GPU 是否真的能用
laya-mcp install    # 注册到本机已有的任意 agent harness
```

`install` 处理「注册 MCP server 没有可移植做法」这件事：Claude Code（`mcpServers`）、Codex（`[mcp_servers.<name>]`）、opencode（`mcp`，`command` 是数组）、OpenClaw（`mcp.servers`）与 Hermes（`mcp_servers`）各自在正确的文件里得到正确的形状，合并并先备份，而不是覆盖。`pi` 没有原生 MCP 支持，会被报告为不支持。

优先用 `serve` 加 `--sidecar`，而不是在每个 stdio 进程里托管模型：一个 harness 每个会话生成一个 server，而每个会话都加载一个 650 MB 的 checkpoint 正是「Python 支撑的 MCP server 感觉慢」的主要原因。

## 诚实的限制

重复上游自己的数字，因为一个暗示相反的集成层是在骗你：基础 checkpoint 在有类型决策上**零样本接近随机**（0.362，对 0.461 的多数类基线）；`score` 是最弱的 primitive（独立测量 35%，对比 70%）；原始标定误差在拟合温度前是 0.466；一次 fixture 运行在 50 道多选题里 46 次选了「A」。

标定让概率诚实；它不能让模型正确。

## 许可证

Apache-2.0。Laya 由 Convai Innovations 以 Apache-2.0 发布。这是一个独立集成，与该上游项目无关联，也未获其背书。
