// The Grindinator command line: parses the arguments, dispatches to run, status or reset, and turns
// errors into messages and exit codes. main returns the exit code; the bin script sets process.exitCode.
'use strict'

const os = require('os')
const { parseArgs } = require('util')
const { GrindinatorError } = require('./errors.js')
const { debug } = require('./debug.js')
const config = require('./config.js')
const { run } = require('./run.js')
const { status, reset } = require('./status.js')

const HELP = `Usage: grindinator <command> [options]

Runs a folder of work packages (WP-NN · Title.md) through Tierminator, one
headless Claude Code session per package, on the branch grindinator/<run name>.
Run it from the target project's root.

Commands:
  run <packages dir>      Check the preconditions, create or resume the run
                          branch, and run the packages that are not done
  status [packages dir]   Show each package and its state
  reset <id>              Clear a package's done marker so the next run repeats it
  help                    Show this help

Options for run (they override ~/.claude/grindinator.json and
.claude/grindinator.json):
  --name <run name>             Name a new run (default: <dir>-<UTC timestamp>)
  --permission-mode <mode>      acceptEdits, bypassPermissions or default
                                (default: bypassPermissions)
  --allowed-tools <list>        Comma-separated tools to allow
  --model <model>               Planning model (default: opus)
  --effort <level>              low, medium, high, xhigh or max (default: medium)
  --max-turns <n>               Turn cap per session (default: none)
  --max-session-minutes <n>     Wall-clock cap per session in minutes (default: 480)
  --max-gate-minutes <n>        Wall-clock cap on the gate in minutes (default: 60)
  --gate <command>              Command that must pass before a package is done
                                (default: none; the gate is skipped)
  --on-failure <stop|continue>  After a failed package (default: stop)
  --max-limit-waits <n>         Usage-limit waits in a row per package (default: 3)
  --wait-weekly                 Wait out a reset more than 24 hours away
  --preamble <file>             Text placed before every package prompt
  --no-decidinator              Do not arm Decidinator in the sessions
  --stop-on-open-questions      Stop after a package that adds open questions

Exit codes: 0 every package done, 1 a package failed or halted,
2 preconditions failed, 3 stopped on a usage limit, 4 interrupted,
5 stopped on open questions.
Set GRINDINATOR_DEBUG=1 for a debug log in the temp directory.
`

async function main(argv, {
  cwd = process.cwd(), homeDir = os.homedir(), stdout = process.stdout, stderr = process.stderr,
} = {}) {
  const out = line => { stdout.write(line + '\n') }
  const err = line => { stderr.write(line + '\n') }
  try {
    if (argv.length === 0) {
      stderr.write(HELP)
      return 2
    }
    if (['help', '--help', '-h'].includes(argv[0]) || argv.slice(1).some(a => a === '--help' || a === '-h')) {
      stdout.write(HELP)
      return 0
    }
    const command = argv[0]
    if (command === 'run') {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: { ...config.parseArgsOptions(), name: { type: 'string' } },
        allowPositionals: true,
        strict: true,
      })
      if (positionals.length !== 1) throw new GrindinatorError('run needs one argument: the packages directory')
      return await run({
        cwd, homeDir, packagesDir: positionals[0], name: values.name, flags: values, out, err,
      })
    }
    if (command === 'status') {
      const { positionals } = parseArgs({ args: argv.slice(1), options: {}, allowPositionals: true, strict: true })
      if (positionals.length > 1) throw new GrindinatorError('status takes at most one argument: the packages directory')
      return await status({ cwd, packagesDir: positionals[0], out })
    }
    if (command === 'reset') {
      const { positionals } = parseArgs({ args: argv.slice(1), options: {}, allowPositionals: true, strict: true })
      if (positionals.length !== 1) throw new GrindinatorError('reset needs one argument: a package id such as WP-01')
      return await reset({ cwd, id: positionals[0], out })
    }
    throw new GrindinatorError(`unknown command "${command}"; run grindinator --help`)
  } catch (e) {
    if (e instanceof GrindinatorError) {
      err(`grindinator: ${e.message}`)
      return e.exitCode
    }
    if (typeof e?.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS')) {
      err(`grindinator: ${e.message}`)
      return 2
    }
    err(`grindinator: unexpected error: ${e?.message ?? e}`)
    debug(String(e?.stack ?? e))
    return 1
  }
}

module.exports = { HELP, main }
