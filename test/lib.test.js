/**
 * Interpreter discovery, asserted rather than assumed.
 *
 * The case worth protecting is the Windows one: a Microsoft Store `python.exe`
 * stub sits ahead of a real interpreter on PATH, and a launcher that tries
 * `python` first reports "laya-mcp is not installed" to a user looking at a
 * successful `pip show laya-mcp`. That is a whole afternoon of confusion, and it
 * costs nothing to pin here.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ENV_OVERRIDE,
  LEGACY_ENV_OVERRIDE,
  candidateInterpreters,
  candidateArgs,
  explicitInterpreters,
} from '../lib.js'

test('Windows tries the py launcher first', () => {
  // Not a preference: `python` is the Store stub there, and it fails the import.
  assert.deepEqual(candidateInterpreters('win32'), ['py', 'python', 'python3'])
})

test('everywhere else tries python3 first', () => {
  assert.deepEqual(candidateInterpreters('linux'), ['python3', 'python'])
  assert.deepEqual(candidateInterpreters('darwin'), ['python3', 'python'])
})

test('py is asked for Python 3 explicitly', () => {
  assert.deepEqual(candidateArgs('py'), ['-3'])
  assert.deepEqual(candidateArgs('python'), [])
  assert.deepEqual(candidateArgs('python3'), [])
})

test('an explicit override wins and is the only candidate up front', () => {
  const found = explicitInterpreters({ [ENV_OVERRIDE]: 'C:\\py\\python.exe' }, 'win32')
  assert.equal(found.length, 1)
  assert.equal(found[0].interpreter, 'C:\\py\\python.exe')
  assert.deepEqual(found[0].args, [])
})

test('the pre-rename variable still works', () => {
  // 0.1.0 and 0.1.1 printed `LAYACORE_PYTHON` in the error message. Ignoring it
  // now would break the one instruction those versions gave.
  const found = explicitInterpreters({ [LEGACY_ENV_OVERRIDE]: '/opt/legacy/python' }, 'linux')
  assert.equal(found.length, 1)
  assert.equal(found[0].interpreter, '/opt/legacy/python')
})

test('the current name beats the legacy one when both are set', () => {
  const found = explicitInterpreters(
    { [ENV_OVERRIDE]: '/new/python', [LEGACY_ENV_OVERRIDE]: '/old/python' },
    'linux',
  )
  assert.equal(found[0].interpreter, '/new/python')
})

test('an activated virtualenv is honoured, per platform', () => {
  const windows = explicitInterpreters({ VIRTUAL_ENV: 'C:\\venvs\\laya' }, 'win32')
  assert.equal(windows[0].interpreter, 'C:\\venvs\\laya\\Scripts\\python.exe')

  const posix = explicitInterpreters({ VIRTUAL_ENV: '/home/me/.venvs/laya' }, 'linux')
  assert.equal(posix[0].interpreter, '/home/me/.venvs/laya/bin/python')
})

test('a trailing separator on VIRTUAL_ENV does not double up', () => {
  const found = explicitInterpreters({ VIRTUAL_ENV: '/home/me/venv/' }, 'linux')
  assert.equal(found[0].interpreter, '/home/me/venv/bin/python')
})

test('an override is tried before the virtualenv', () => {
  const found = explicitInterpreters(
    { [ENV_OVERRIDE]: '/explicit/python', VIRTUAL_ENV: '/activated/venv' },
    'linux',
  )
  assert.deepEqual(
    found.map((entry) => entry.interpreter),
    ['/explicit/python', '/activated/venv/bin/python'],
  )
})

test('no environment at all yields no explicit candidates', () => {
  assert.deepEqual(explicitInterpreters({}, 'linux'), [])
})
