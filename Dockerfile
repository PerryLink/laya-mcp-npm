# Glama's introspection image for the `laya-mcp` npm package.
#
# This package is a launcher, not a server: `bin/laya-mcp.js` finds a Python
# interpreter that has the Python `laya-mcp` distribution installed and hands it
# stdio untouched. So the image carries both halves - node to run the launcher,
# Python to run the server - and the entry point is the launcher, because that is
# the artefact this repository actually ships. Glama's prober speaks to it over
# stdin/stdout and captures `initialize` + `tools/list`.
#
# Three decisions worth stating, because each one is a trap:
#
# 1. The Python side is installed **without `laya`**. The handshake and the tool
#    list do not need a model: the tools are registered statically and the
#    checkpoint is only reached for when a tool is *called* (the load runs on a
#    background thread so the handshake never waits for it). Installing `laya`
#    would add torch + transformers and a ~650 MB checkpoint fetch and change
#    nothing about the two requests that are scored. `--no-deps` is what skips
#    it; the MCP SDK is then installed explicitly - it is the `[mcp]` extra the
#    launcher's own error message tells users to install, `mcp>=1.28,<2`,
#    pinned to one version because that SDK's v2 removed the `FastMCP` export
#    the server is built on. A tool *call* still answers with the package's own
#    structured refusal, so the image never hangs on a prober.
#
# 2. There is no `npm install` step, and that is not an omission: this package
#    declares no runtime dependencies and has no package-lock.json, so the only
#    files that matter at runtime are `bin/laya-mcp.js` and `lib.js`.
#
# 3. `python3` has to be on PATH, and it has to be the interpreter that owns the
#    package. The MCP SDK's stdio client spawns a server with a *filtered*
#    environment (`DEFAULT_INHERITED_ENV_VARS` keeps PATH, HOME, USER ... and
#    drops the rest), which silently discards this launcher's own
#    `LAYA_MCP_PYTHON` override. Installing into the base image's Python - the
#    `/usr/local/bin/python3` that is already first on PATH - is what makes
#    discovery succeed under a prober rather than only in a hand-run shell.
#
#   `laya-mcp==0.2.2` is the newest release on PyPI; the Python repository's
#   0.2.3 exists in git but is not published, and pinning a version that does
#   not exist would fail the build rather than degrade it.
#
# The base image is pinned to a Debian release rather than a digest on purpose: a
# digest could not be verified in the environment this file was written in (no
# Docker daemon), and an unverifiable single point of failure in a build that
# cannot be test-built is worse than a tag that still receives security patches.

FROM python:3.12-slim-bookworm

# PYTHONUNBUFFERED matters more than usual here: this is a stdio server behind a
# proxy, and a reply that sits in a pipe buffer is a reply the client never reads.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Bookworm's nodejs is 18.x, which satisfies the package's `engines: node >= 18`;
# the launcher uses nothing newer than `node:child_process` and `spawn`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Before the source copy, so editing the launcher does not refetch Python deps.
# `--no-deps` on the second install is the decision described in the header: the
# Python server without its `laya` (torch + transformers) dependency.
RUN python -m pip install --no-cache-dir "mcp==1.30.0" \
 && python -m pip install --no-cache-dir --no-deps "laya-mcp==0.2.2"

COPY . /app

# `mcp` is passed explicitly rather than relying on the "no subcommand means be a
# server" default. That default is broken: it builds a Namespace holding only
# `sidecar` and `filter` and then reads `args.model`, so `python -m laya_mcp` -
# which is exactly what this launcher runs when given no arguments - exits 1 with
# `AttributeError: 'Namespace' object has no attribute 'model'`. Measured both
# ways on this checkout: with no argument the container would die before the
# handshake, with `mcp` it lists all five tools.
ENTRYPOINT ["node", "/app/bin/laya-mcp.js", "mcp"]
