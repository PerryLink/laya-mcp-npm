#!/usr/bin/env node
/**
 * Node entry point for `laya-mcp`.
 *
 * The implementation is Python: Laya is a PyTorch model and there is no way
 * around that. This file exists so the package can be installed and invoked the
 * way the Node half of the MCP ecosystem expects — `npx -y laya-mcp` — and it
 * does exactly one thing: find a Python interpreter that has the real package,
 * hand over stdio, and stay out of the way.
 *
 * It deliberately does NOT:
 *   - install anything. Fetching torch (a ~2 GB download) or a 650 MB checkpoint
 *     as a side effect of running a command is not a thing a launcher should do.
 *   - buffer, parse or rewrite the MCP protocol. A shim that inspects the stream
 *     it is proxying is a shim that can corrupt it; stdio is passed straight
 *     through, so the Python process owns the conversation end to end.
 *   - spawn a Python process per tool call. That would pay the model load cost
 *     every time. Use `laya-mcp serve` for a warm sidecar; this is a launcher.
 *
 * If the Python package is missing, the message names the exact command to fix
 * it and exits non-zero, because a launcher that prints a stack trace instead of
 * an instruction has moved the problem rather than solved it.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const PACKAGE = 'laya-mcp';
const MIN_PYTHON = [3, 10];

/** The environment variable that overrides interpreter discovery outright. */
const ENV_OVERRIDE = 'LAYACORE_PYTHON';

/**
 * Interpreters to try, in order.
 *
 * The order is not cosmetic. On Windows, `python` frequently resolves to the
 * Microsoft Store execution alias at `%LOCALAPPDATA%\Microsoft\WindowsApps\
 * python.exe`, which is a stub: it prints nothing useful and cannot import
 * anything. It sits *ahead* of a real interpreter on PATH, so a naive "try
 * python, then python3" resolves to the stub, fails the import, and concludes
 * that the package is not installed - while the user is looking at a working
 * `pip show laya-mcp`. `py` is the Windows launcher and is a better first guess
 * there; it reports a real interpreter or fails loudly.
 */
const CANDIDATES = process.platform === 'win32'
  ? ['py', 'python', 'python3']
  : ['python3', 'python'];

/**
 * Interpreters a user has explicitly pointed us at, ahead of any guess.
 *
 * `LAYACORE_PYTHON` is the escape hatch and wins outright. `VIRTUAL_ENV` is the
 * standard variable an activated virtualenv exports, and honouring it means the
 * common case - a user who activated the environment they installed into -
 * works without configuration, which PATH alone cannot deliver because the
 * activation is not visible to a process spawned by a harness.
 */
function explicitInterpreters() {
  const found = [];
  const override = process.env[ENV_OVERRIDE] || process.env.LAYA_MCP_PYTHON;
  if (override) found.push({ interpreter: override, args: [] });
  if (process.env.VIRTUAL_ENV) {
    found.push({
      interpreter: join(process.env.VIRTUAL_ENV, process.platform === 'win32' ? 'Scripts' : 'bin',
        process.platform === 'win32' ? 'python.exe' : 'python'),
      args: [],
    });
  }
  return found;
}

function fail(message) {
  process.stderr.write(`laya-mcp: ${message}\n`);
  process.exit(1);
}

/**
 * Ask one interpreter whether it has the package, and what version.
 *
 * Runs a real import rather than checking `pip show`: an installed distribution
 * whose import fails (a broken torch build is the common case) would pass a
 * metadata check and fail on the first request.
 */
function probe(interpreter, args = []) {
  return new Promise((resolve) => {
    const child = spawn(interpreter, [...args, '-c', 'import laya_mcp,sys;sys.stdout.write(laya_mcp.__version__)'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      resolve(code === 0 ? { interpreter, args, version: out.trim() } : null);
    });
  });
}

async function findPython() {
  const tried = [];
  // Explicit pointers first: a user who names an interpreter, or who activated
  // the environment they installed into, must never be overridden by a guess.
  for (const candidate of explicitInterpreters()) {
    tried.push(candidate.interpreter);
    const found = await probe(candidate.interpreter, candidate.args);
    if (found) return found;
  }
  for (const candidate of CANDIDATES) {
    // `py -3` is the Windows launcher; without it `py` may pick a stale Python 2.
    const extra = candidate === 'py' ? ['-3'] : [];
    tried.push(candidate);
    const found = await probe(candidate, extra);
    if (found) return found;
  }
  return { tried };
}

async function main() {
  const argv = process.argv.slice(2);

  const found = await findPython();
  if (!found || !found.interpreter) {
    // Name what was tried. On Windows the usual cause is a Microsoft Store
    // `python.exe` stub winning on PATH, and a user reading "not installed"
    // while `pip show laya-mcp` succeeds has no way to guess that.
    const tried = found?.tried?.length ? found.tried.join(', ') : 'nothing';
    fail(
      `could not find a Python interpreter with the \`${PACKAGE}\` package installed.\n` +
      `  Tried: ${tried}\n` +
      `  Install it with:  pip install "${PACKAGE}[mcp]"\n` +
      `  Then retry. Python ${MIN_PYTHON.join('.')}+ is required.\n` +
      `  Already installed it? Point this launcher at the interpreter directly:\n` +
      `      set ${ENV_OVERRIDE}=C:\\path\\to\\python.exe     (Windows)\n` +
      `      export ${ENV_OVERRIDE}=/path/to/python        (macOS, Linux)\n` +
      `  Activating the virtualenv you installed into also works.\n` +
      `  Note that Laya is a PyTorch model, so the first install downloads torch ` +
      `(~2 GB) and the first run downloads a checkpoint (~650 MB).`,
    );
  }

  // Hand stdio straight to the real server. `inherit` for all three streams means
  // this process never touches the MCP frames, so it cannot corrupt them; its own
  // exit code is the child's.
  const child = spawn(found.interpreter, [...found.args, '-m', 'laya_mcp', ...argv], {
    stdio: 'inherit',
  });

  const forward = (signal) => {
    // Without this, Ctrl-C kills the shim and orphans a Python process holding
    // several gigabytes of VRAM.
    try { child.kill(signal); } catch { /* already gone */ }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('error', (error) => fail(`could not start ${found.interpreter}: ${error.message}`));
  child.on('close', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main().catch((error) => fail(error?.stack ?? String(error)));
