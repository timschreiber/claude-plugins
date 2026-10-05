'use strict'

// A --require preload: makes fs.renameSync fail with EPERM when it renames onto a path ending with
// TIERMINATOR_TEST_FAIL_RENAME, as Windows fails a rename onto a file another process holds open.
const fs = require('fs')

const rename = fs.renameSync
fs.renameSync = function (from, to) {
  const suffix = process.env.TIERMINATOR_TEST_FAIL_RENAME
  if (suffix && String(to).endsWith(suffix)) {
    throw Object.assign(new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`), { code: 'EPERM' })
  }
  return rename.apply(this, arguments)
}
