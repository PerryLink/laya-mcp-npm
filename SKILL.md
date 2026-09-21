---
name: laya-mcp-install
description: Get the Laya MCP server running for an agent harness - find the right Python interpreter, register the server, and diagnose why a harness reports it as failed.
when-to-use: Laya tools are missing or a harness shows the server as failed, timed out, or not installed. Skip it when Laya already answers - use the `laya` skill for asking it questions.
---

# Getting Laya running

Laya is a PyTorch model, so the server is Python and this npm package is only the
entry point. Two pieces, and a failure is almost always one of them missing
rather than the code being wrong.

## The two pieces

```bash
pip install "laya-mcp[mcp]"     # the server and the model
laya-mcp serve                  # warm it once, on 127.0.0.1:8787
```

Then register it with whichever harness is installed:

```bash
laya-mcp install                # detects every harness present
laya-mcp install --harness claude
```

## When a harness says "failed" or "timed out"

Work down this list; each step rules out one cause.

**1. Is the interpreter the right one?** On Windows, `python` on PATH is often the
Microsoft Store alias, which is a stub that cannot import anything and sits
*ahead* of the real interpreter. The launcher reports what it tried rather than
claiming the package is missing. Name the interpreter outright:

```bash
set LAYA_MCP_PYTHON=C:\path\to\python.exe        # Windows
export LAYA_MCP_PYTHON=/path/to/python           # macOS, Linux
```

`LAYACORE_PYTHON` is still read, for anyone who set it when earlier versions
named it. Activating the virtualenv also works - `VIRTUAL_ENV` is honoured.

**2. Confirm the package is actually importable by that interpreter:**

```bash
python -c "import laya_mcp; print(laya_mcp.__version__)"
```

An installed distribution whose import fails - a broken torch build is the common
case - passes `pip show` and fails here.

**3. Is it a timeout rather than a failure?** Harnesses commonly allow 30 seconds
for the `initialize` handshake. Hosting the model in-process means that handshake
waits for a checkpoint load: 19 seconds uncontended, and minutes while another
model holds the same GPU. If the harness has a slow-start or timeout setting,
raise it; better, run `laya-mcp serve` once and register with
`--sidecar http://127.0.0.1:8787` so the server starts instantly and shares one
warm model across sessions.

**4. Read what the harness itself thinks**, rather than the config file. Re-reading
the file proves it was written, not that it was accepted:

```bash
opencode mcp list          # ✓ connected / ✗ failed
claude mcp list            # √ Connected
codex mcp list --json
openclaw mcp list --json
```

## What `install` will not do

It installs nothing and downloads nothing. Fetching torch (~2 GB) and a 650 MB
checkpoint as a side effect of registering a server is not something an installer
should do. It writes configuration only, merges rather than replaces, backs the
file up first, and refuses to touch a file it cannot parse.

`pi` is reported as unsupported rather than silently skipped: it has no native MCP
support, so there is no config file to write.

## Do not

Do not put the model's install behind a retry loop in the harness, and do not
report a Laya tool as working because the config file exists. Confirm it with the
harness's own lister.
