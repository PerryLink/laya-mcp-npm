#!/usr/bin/env node
/**
 * Node entry point for `laya-mcp`.
 *
 * The implementation is Python: Laya is a PyTorch model and there is no way
 * around that. This file exists so the package can be installed and invoked the
 * way the Node half of the MCP ecosystem expects - `npx -y laya-mcp` - and it
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
 *
 * The discovery logic lives in `../lib.js`: this file runs `main()` the moment it
 * is imported, so anything defined here could only be tested by spawning Python.
 */

import { spawn } from 'node:child_process';

import {
  ENV_OVERRIDE,
  LEGACY_ENV_OVERRIDE,
  MIN_PYTHON,
  candidateArgs,
  candidateInterpreters,
  explicitInterpreters,
} from '../lib.js';

const PACKAGE = 'laya-mcp';

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
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', () => { /* a failing interpreter is the answer */ });
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
  for (const candidate of candidateInterpreters()) {
    tried.push(candidate);
    const found = await probe(candidate, candidateArgs(candidate));
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
      `  (${LEGACY_ENV_OVERRIDE} is still read, for anyone who set it back when\n` +
      `  earlier versions named that one here.)\n` +
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
