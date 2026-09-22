# laya-mcp

MCP server for [Laya](https://github.com/NandhaKishorM/laya) typed decisions —
`noul` (yes/no), `choice`, `score` — wrapped so it survives contact with a server.

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```bash
npx -y laya-mcp --help
```

Registered as [`io.github.PerryLink/laya-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=perrylink) in the official MCP Registry.

> **This npm package is a launcher, not an implementation.** Laya is a PyTorch
> model, so the server itself is Python. Installing this package gets you the
> Node entry point and nothing else; you also need the Python side:
>
> ```bash
> pip install "laya-mcp[mcp]"
> ```
>
> `npx laya-mcp` finds that interpreter, hands stdio to it, and passes the MCP
> stream through untouched. It does not install anything for you — fetching torch
> (~2 GB) and a checkpoint (~650 MB) as a side effect of running a command is not
> something a launcher should do.

### If it cannot find your Python

On Windows, `python` on PATH is often the Microsoft Store execution alias, which
is a stub: it cannot import anything, and it sits ahead of your real interpreter.
The launcher therefore reports what it tried rather than claiming the package is
missing. Point it at the right interpreter either way:

```bash
# name it outright
set LAYA_MCP_PYTHON=C:\path\to\python.exe        # Windows
export LAYA_MCP_PYTHON=/path/to/python           # macOS, Linux

# or just activate the virtualenv you installed into — VIRTUAL_ENV is honoured
```

> `LAYACORE_PYTHON` is still read. 0.1.0 and 0.1.1 printed that name in the error
> message, and a launcher that stopped honouring the variable its own previous
> version told you to set would be worse than one carrying the alias.

> **Status: 0.1.4, work in progress.** The Python core is implemented and covered
> by CI. The launcher itself is covered by ten checks over interpreter discovery,
> which is where it has been wrong before. Interfaces may move before 1.0.

---

## Why it exists

Laya truncates things silently and reports none of it:

- **It cuts the state from the end.** A long document loses its tail — for a
  contract or an email thread, often where the answer was — and the model answers
  about the surviving prefix at full confidence.
- **It shortens options until labels are indistinguishable.** Options share a
  fixed per-question token budget; past a point every label gets ~4 tokens. This
  is the documented cause of its collapse on high-cardinality choices.
- **Its `confidence` is not accuracy.** It is a normalised entropy, low whenever
  probability is spread out even when the top option is right, and high on a
  confident wrong answer.
- **It demotes itself to CPU on a CUDA OOM**, permanently, with no flag set —
  roughly 10-15x slower, and nothing in the response says so.

This package adds a preflight that reports what would be cut, structured errors
that name the offending question, an honest confidence contract, and a health
surface that admits a demotion.

## Usage

```bash
laya-mcp serve      # warm HTTP sidecar on 127.0.0.1:8787 (loads the model once)
laya-mcp mcp        # MCP over stdio
laya-mcp doctor     # what is installed, and whether the GPU really works
laya-mcp install    # register with whichever agent harness you have
```

`install` handles the fact that there is no portable way to register an MCP
server: Claude Code (`mcpServers`), Codex (`[mcp_servers.<name>]`), opencode
(`mcp`, with an array `command`), OpenClaw (`mcp.servers`) and Hermes
(`mcp_servers`) each get the right shape written to the right file, merged and
backed up rather than overwritten. `pi` has no native MCP support and is reported
as unsupported.

Prefer `serve` plus `--sidecar` over hosting the model in each stdio process: a
harness spawns one server per session, and loading a 650 MB checkpoint per
session is the main reason a Python-backed MCP server feels slow.

## Honest limits

Upstream's own numbers, repeated because an integration that implies otherwise is
lying to you: the base checkpoints are **near chance zero-shot** on typed
decisions (0.362 against a 0.461 majority-class baseline); `score` is the weakest
primitive (35% vs 70% in independent measurement); raw calibration error is 0.466
before temperature fitting; and one fixture run answered "A" on 46 of 50
multiple-choice items.

Calibration makes a probability honest; it cannot make a model right.

## Licence

Apache-2.0. Laya is Apache-2.0 by Convai Innovations. This is an independent
integration, not affiliated with or endorsed by that project.
