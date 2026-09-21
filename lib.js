/**
 * Interpreter discovery, separated from the launcher so it can be tested.
 *
 * `bin/laya-mcp.js` runs `main()` the moment it is imported, so anything defined
 * there can only be exercised by actually spawning a Python process. The parts
 * that decide *which* process to spawn are the parts that have been wrong before,
 * and they are pure once the environment is passed in rather than read from the
 * module scope.
 */

/**
 * The environment variable that overrides interpreter discovery outright.
 *
 * Renamed with the rest of the family. `LAYACORE_PYTHON` is still honoured
 * because 0.1.0 and 0.1.1 of this package told users to set it in the error
 * message itself, and silently ignoring a variable a previous version
 * recommended is worse than carrying an alias.
 */
export const ENV_OVERRIDE = 'LAYA_MCP_PYTHON'
export const LEGACY_ENV_OVERRIDE = 'LAYACORE_PYTHON'

export const MIN_PYTHON = [3, 10]

/**
 * Interpreters to try, in order.
 *
 * The order is not cosmetic. On Windows, `python` frequently resolves to the
 * Microsoft Store execution alias at `%LOCALAPPDATA%\Microsoft\WindowsApps\
 * python.exe`, which is a stub: it prints nothing useful and cannot import
 * anything. It sits *ahead* of a real interpreter on PATH, so a naive "try
 * python, then python3" resolves to the stub, fails the import, and concludes the
 * package is not installed - while the user is looking at a working
 * `pip show laya-mcp`. `py` is the Windows launcher and is a better first guess
 * there; it reports a real interpreter or fails loudly.
 */
export const candidateInterpreters = (platform = process.platform) =>
  platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']

/**
 * Extra arguments a candidate needs to name a real interpreter.
 *
 * `py -3` is the Windows launcher; without it `py` may pick a stale Python 2.
 */
export const candidateArgs = (candidate) => (candidate === 'py' ? ['-3'] : [])

/**
 * Interpreters a user has explicitly pointed us at, ahead of any guess.
 *
 * `LAYA_MCP_PYTHON` is the escape hatch and wins outright. `VIRTUAL_ENV` is the
 * standard variable an activated virtualenv exports, and honouring it means the
 * common case - a user who activated the environment they installed into - works
 * without configuration, which PATH alone cannot deliver because the activation
 * is not visible to a process spawned by a harness.
 */
export const explicitInterpreters = (env = process.env, platform = process.platform) => {
  const found = []
  const override = env[ENV_OVERRIDE] || env[LEGACY_ENV_OVERRIDE]
  if (override) found.push({ interpreter: override, args: [], source: ENV_OVERRIDE })
  if (env.VIRTUAL_ENV) {
    found.push({
      interpreter: `${env.VIRTUAL_ENV.replace(/[\\/]+$/, '')}${
        platform === 'win32' ? '\\Scripts\\python.exe' : '/bin/python'
      }`,
      args: [],
      source: 'VIRTUAL_ENV',
    })
  }
  return found
}
