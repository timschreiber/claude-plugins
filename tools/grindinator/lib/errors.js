// Grindinator's exit codes (spec: Runner exit codes) and the error type for problems the user must fix.
// A GrindinatorError's message is printed as is, and its exitCode becomes the process exit code.
'use strict'

const EXIT = Object.freeze({ OK: 0, FAILED: 1, PRECONDITION: 2, LIMIT: 3, INTERRUPTED: 4, OPEN_QUESTIONS: 5 })

class GrindinatorError extends Error {
  constructor(message, exitCode = EXIT.PRECONDITION) {
    super(message)
    this.name = 'GrindinatorError'
    this.exitCode = exitCode
  }
}

module.exports = { EXIT, GrindinatorError }
