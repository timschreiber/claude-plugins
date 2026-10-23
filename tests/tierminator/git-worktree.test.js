'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const g = require('../../plugins/tierminator/scripts/lib/git.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-wt-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const run = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const write = (cwd, name, text) => fs.writeFileSync(path.join(cwd, name), text)

// A repository with one commit holding README.md and a .gitignore that ignores *.log.
function repo(name = 'repo') {
  const r = path.join(dir, name)
  fs.mkdirSync(r, { recursive: true })
  run(r, 'init', '-q', '-b', 'main')
  run(r, 'config', 'user.name', 'Test')
  run(r, 'config', 'user.email', 'test@example.com')
  run(r, 'config', 'commit.gpgsign', 'false')
  run(r, 'config', 'core.autocrlf', 'false')
  write(r, 'README.md', '# test\n')
  write(r, '.gitignore', '*.log\n')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'init')
  return r
}

// Writes a file and commits it, one -m per message; returns the new HEAD.
function commit(cwd, file, text, ...messages) {
  write(cwd, file, text)
  run(cwd, 'add', '-A')
  run(cwd, 'commit', '-q', ...messages.flatMap(m => ['-m', m]))
  return g.head(cwd)
}
const slot = (r, name) => path.join(r, '.claude', 'worktrees', name)

test('toWorktreePath is null for a non-path, resolves relative paths and is idempotent', () => {
  assert.equal(g.toWorktreePath(undefined), null)
  assert.equal(g.toWorktreePath(''), null)
  assert.equal(g.toWorktreePath('some/rel'), g.toWorktreePath(path.resolve('some/rel')))
  const once = g.toWorktreePath(dir)
  assert.equal(g.toWorktreePath(once), once)
})

test('toWorktreePath gives the C:/Users/... form on Windows', { skip: process.platform !== 'win32' }, () => {
  const t = g.toWorktreePath(os.tmpdir())
  assert.match(t, /^[A-Z]:\//)
  assert.ok(!t.includes('\\'))
  assert.equal(g.toWorktreePath('C:/Users/x/y'), 'C:/Users/x/y')
  assert.equal(g.toWorktreePath('c:\\Users\\x'), 'C:/Users/x')
  assert.equal(g.toWorktreePath('/c/Users/x'), 'C:/Users/x')
})

test('worktreeList lists the main worktree first, with branch, head, locked and detached state', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  let list = g.worktreeList(r)
  assert.equal(list.length, 2)
  assert.equal(list[0].path, g.toWorktreePath(r))
  assert.equal(list[0].branch, 'main')
  assert.equal(list[1].path, g.toWorktreePath(wt))
  assert.equal(list[1].branch, 'tierminator/aaaa1111/T01')
  assert.equal(list[1].head, g.head(r))
  assert.equal(list[1].locked, false)

  run(r, 'worktree', 'lock', wt)
  list = g.worktreeList(r)
  assert.equal(list[1].locked, true)

  const det = slot(r, 'detached')
  run(r, 'worktree', 'add', '-q', '--detach', det)
  list = g.worktreeList(r)
  assert.equal(list.find(w => w.path === g.toWorktreePath(det)).branch, null)

  assert.deepEqual(g.worktreeList(path.join(dir, 'missing')), [])
})

test('branchesMatching returns the sorted local branches under a tierminator/ prefix', () => {
  const r = repo()
  for (const b of ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02', 'tierminator/bbbb2222/T01', 'feature/x', 'tierminatorx', 'my/tierminator/T01']) {
    run(r, 'branch', b)
  }
  assert.deepEqual(g.branchesMatching(r), ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02', 'tierminator/bbbb2222/T01'])
  assert.deepEqual(g.branchesMatching(r, 'tierminator/aaaa1111/'), ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02'])
  assert.deepEqual(g.branchesMatching(r, 'feature/'), [])
  assert.deepEqual(g.branchesMatching(r, ''), [])
  assert.deepEqual(g.branchesMatching(path.join(dir, 'missing')), [])
})

test('worktreesMatching finds only tierminator slots directly inside .claude/worktrees', () => {
  const r = repo()
  const add = (p, b) => run(r, 'worktree', 'add', '-q', '-b', b, p)
  const a = slot(r, 'tierminator-aaaa1111-T01')
  const b = slot(r, 'tierminator-bbbb2222-T02')
  const mine = slot(r, 'mine')
  add(a, 'b-a')
  add(b, 'b-b')
  add(slot(r, 'agent-a1b2c3'), 'b-agent')
  add(mine, 'b-mine')
  add(path.join(r, '.claude', 'worktrees', 'sub', 'tierminator-nested'), 'b-nested')
  add(path.join(dir, 'tierminator-outside'), 'b-outside')

  const want = [g.toWorktreePath(a), g.toWorktreePath(b)].sort()
  const paths = list => list.map(w => w.path).sort()
  assert.deepEqual(paths(g.worktreesMatching(r)), want)
  assert.deepEqual(paths(g.worktreesMatching(r, 'tierminator-aaaa1111-')), [g.toWorktreePath(a)])
  assert.deepEqual(g.worktreesMatching(r, 'agent-'), [])
  assert.deepEqual(paths(g.worktreesMatching(mine)), want)
})

const exited = child => (child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(res => child.once('exit', res)))

test('worktreePrune forgets worktrees whose directory is gone', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  fs.rmSync(wt, { recursive: true, force: true })
  assert.equal(g.worktreeList(r).find(w => w.path === g.toWorktreePath(wt)).prunable, true)
  assert.equal(g.worktreePrune(r), true)
  assert.deepEqual(g.worktreeList(r).map(w => w.path), [g.toWorktreePath(r)])
  assert.equal(g.worktreePrune(path.join(dir, 'missing')), false)
})

test('branchDelete deletes only tierminator branches that are not checked out', () => {
  const r = repo()
  run(r, 'branch', 'tierminator/aaaa1111/T01')
  run(r, 'branch', 'feature/x')
  assert.deepEqual(g.branchDelete(r, 'tierminator/aaaa1111/T01'), { ok: true })
  assert.ok(!g.branchesMatching(r).includes('tierminator/aaaa1111/T01'))

  const refused = g.branchDelete(r, 'feature/x')
  assert.equal(refused.ok, false)
  assert.match(refused.failure, /not a tierminator branch/)
  assert.match(run(r, 'branch', '--list', 'feature/x'), /feature\/x/)

  const wt = slot(r, 'tierminator-aaaa1111-T02')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T02', wt)
  const held = g.branchDelete(r, 'tierminator/aaaa1111/T02', [])
  assert.equal(held.ok, false)
  assert.match(held.failure, /^git branch -D tierminator\/aaaa1111\/T02 failed: /)

  assert.equal(g.branchDelete(r, 'tierminator/aaaa1111/T99', []).ok, false)
})

test('worktreeRemove removes a dirty worktree and keeps its branch', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  write(wt, 'README.md', 'changed\n')
  write(wt, 'new.txt', 'untracked\n')
  fs.mkdirSync(path.join(wt, 'sub'))
  write(path.join(wt, 'sub'), 'inner.txt', 'untracked\n')
  assert.deepEqual(g.worktreeRemove(r, wt), { ok: true })
  assert.equal(fs.existsSync(wt), false)
  assert.deepEqual(g.worktreeList(r).map(w => w.path), [g.toWorktreePath(r)])
  assert.deepEqual(g.branchesMatching(r), ['tierminator/aaaa1111/T01'])
  assert.deepEqual(g.branchDelete(r, 'tierminator/aaaa1111/T01'), { ok: true })
})

test('worktreeRemove removes a locked worktree', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  run(r, 'worktree', 'lock', '--reason', 'test', wt)
  assert.deepEqual(g.worktreeRemove(r, wt), { ok: true })
  assert.equal(fs.existsSync(wt), false)
})

test('worktreeRemove removes a worktree another process holds as its cwd', async () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { cwd: wt, stdio: 'ignore' })
  assert.deepEqual(g.worktreeRemove(r, wt), { ok: true })
  assert.equal(fs.existsSync(wt), false)
  await exited(child)
})

test('worktreeRemove reports a worktree a process keeps held, then removes it once released', { skip: process.platform !== 'win32' }, async () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { cwd: wt, stdio: 'ignore' })
  const res = g.worktreeRemove(r, wt, [10, 10])
  assert.equal(res.ok, false)
  assert.match(res.failure, /^git worktree remove failed: .*Permission denied/)
  assert.ok(!g.worktreeList(r).some(w => w.path === g.toWorktreePath(wt)))
  child.kill()
  await exited(child)
  assert.deepEqual(g.worktreeRemove(r, wt), { ok: true })
  assert.equal(fs.existsSync(wt), false)
})

test('worktreeRemove refuses the main tree and a path that is not a worktree', () => {
  const r = repo()
  const main = g.worktreeRemove(r, r)
  assert.equal(main.ok, false)
  assert.match(main.failure, /main working tree/)
  assert.ok(fs.existsSync(path.join(r, 'README.md')))

  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  write(plain, 'file.txt', 'x\n')
  const notWt = g.worktreeRemove(r, plain)
  assert.equal(notWt.ok, false)
  assert.match(notWt.failure, /not a worktree/)
  assert.ok(fs.existsSync(plain))

  assert.deepEqual(g.worktreeRemove(r, path.join(dir, 'nope')), { ok: true })
  assert.equal(g.worktreeRemove(path.join(dir, 'missing'), plain).ok, false)
})

test('worktreeAdd makes a clean worktree on a new branch at HEAD', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  const res = g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', g.head(r))
  assert.deepEqual(res, { ok: true, path: g.toWorktreePath(wt) })
  assert.equal(g.branch(wt), 'tierminator/aaaa1111/T01')
  assert.equal(g.head(wt), g.head(r))
  assert.ok(fs.existsSync(path.join(wt, 'README.md')))
  assert.ok(g.isClean(wt))
  assert.equal(g.worktreesMatching(r).length, 1)
})

test('worktreeAdd starts the branch at a base that is not HEAD', () => {
  const r = repo()
  const base = g.head(r)
  commit(r, 'b.txt', 'b', 'Add b')
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  assert.equal(g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', base).ok, true)
  assert.equal(g.head(wt), base)
  assert.equal(fs.existsSync(path.join(wt, 'b.txt')), false)
})

test('commitsSince works from a worktree and leaves the main tree untouched', () => {
  const r = repo()
  const base = g.head(r)
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  assert.equal(g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', base).ok, true)
  commit(wt, 'a.txt', 'a', 'Add a', 'Tierminator-Task: T01')
  const found = g.commitsSince(wt, base)
  assert.equal(found.length, 1)
  assert.match(found[0].message, /^Add a\n\nTierminator-Task: T01$/)
  assert.deepEqual(g.commitsSince(r, base), [])
})

test('worktreeAdd reports a failure and undoes what it made', () => {
  const r = repo()
  const base = g.head(r)
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  assert.equal(g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', base).ok, true)

  const dup = g.worktreeAdd(r, slot(r, 'tierminator-aaaa1111-T02'), 'tierminator/aaaa1111/T01', base)
  assert.equal(dup.ok, false)
  assert.match(dup.failure, /^git worktree add failed: .*already exists/)
  assert.equal(fs.existsSync(slot(r, 'tierminator-aaaa1111-T02')), false)
  assert.equal(g.branch(wt), 'tierminator/aaaa1111/T01')
  assert.deepEqual(g.branchesMatching(r), ['tierminator/aaaa1111/T01'])
  assert.equal(g.worktreeList(r).length, 2)

  const before = g.worktreeList(r)
  const bad = slot(r, 'tierminator-aaaa1111-T09')
  const res = g.worktreeAdd(r, bad, 'tierminator/aaaa1111/T09', 'not-a-commit')
  assert.equal(res.ok, false)
  assert.notEqual(spawnSync('git', ['-C', r, 'rev-parse', '--verify', '-q', 'refs/heads/tierminator/aaaa1111/T09']).status, 0)
  assert.equal(fs.existsSync(bad), false)
  assert.deepEqual(g.worktreeList(r), before)

  const none = g.worktreeAdd(r, bad, undefined, base)
  assert.equal(none.ok, false)
  assert.match(none.failure, /needs a path, a branch and a base/)
  assert.equal(g.worktreeAdd(path.join(dir, 'missing'), bad, 'tierminator/aaaa1111/T09', base).ok, false)
})

test('four worktreeAdd calls from separate processes at once all succeed', async () => {
  const r = repo()
  const base = g.head(r)
  const script = path.join(dir, 'add.js')
  write(dir, 'add.js', [
    `const g = require(${JSON.stringify(path.resolve(__dirname, '../../plugins/tierminator/scripts/lib/git.js'))})`,
    'const [cwd, p, b, base, at] = process.argv.slice(2)',
    'while (Date.now() < Number(at)) {}',
    'process.stdout.write(JSON.stringify(g.worktreeAdd(cwd, p, b, base)))'
  ].join('\n'))
  const at = Date.now() + 1500
  const ids = ['T01', 'T02', 'T03', 'T04']
  const runs = ids.map(id => {
    const child = spawn(process.execPath, [script, r, slot(r, `tierminator-cccc3333-${id}`), `tierminator/cccc3333/${id}`, base, String(at)], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', d => { out += d })
    return exited(child).then(() => out)
  })
  const outs = await Promise.all(runs)
  for (const out of outs) assert.equal(JSON.parse(out).ok, true, out)
  assert.equal(g.worktreeList(r).length, 5)
  for (const id of ids) {
    const wt = slot(r, `tierminator-cccc3333-${id}`)
    assert.ok(g.isClean(wt))
    assert.equal(g.branch(wt), `tierminator/cccc3333/${id}`)
    assert.equal(g.head(wt), base)
  }
})

test('worktreeAdd works for a slot path of 190 characters or more', () => {
  const deep = path.join(dir, 'p'.repeat(Math.max(1, 190 - 49 - dir.length)))
  fs.mkdirSync(deep)
  const r = repo(path.join(path.basename(deep), 'repo'))
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  assert.ok(g.toWorktreePath(wt).length >= 190)
  assert.equal(g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', g.head(r)).ok, true)
  assert.ok(fs.existsSync(path.join(wt, 'README.md')))
  assert.ok(g.isClean(wt))
})

test('worktreeAdd past the Windows path limit fails and undoes the worktree and the branch', { skip: process.platform !== 'win32' }, () => {
  const r = repo()
  run(r, 'config', 'core.longpaths', 'false')
  commit(r, 'f'.repeat(240 - r.length - 1), 'x', 'Add a long name')
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  const res = g.worktreeAdd(r, wt, 'tierminator/aaaa1111/T01', g.head(r))
  assert.equal(res.ok, false)
  assert.match(res.failure, /Filename too long/)
  assert.equal(fs.existsSync(wt), false)
  assert.deepEqual(g.worktreeList(r).map(w => w.path), [g.toWorktreePath(r)])
  assert.deepEqual(g.branchesMatching(r), [])
})

// cherryPick, cherryPickAbort, pickInProgress

const plan = '0123456789abcdef'
const trailers = id => `Tierminator-Task: ${id}\nTierminator-Plan: ${plan}`

// A repository whose exclude file hides .claude/worktrees, with slots T01 and T02 started at its HEAD.
function pickRepo() {
  const r = repo()
  const exclude = path.join(r, '.git', 'info', 'exclude')
  fs.mkdirSync(path.dirname(exclude), { recursive: true })
  fs.appendFileSync(exclude, '.claude/worktrees/\n')
  const base = g.head(r)
  const make = id => {
    const wt = slot(r, `tierminator-aaaa1111-${id}`)
    assert.equal(g.worktreeAdd(r, wt, `tierminator/aaaa1111/${id}`, base).ok, true)
    return wt
  }
  return { r, base, wt1: make('T01'), wt2: make('T02') }
}

test('cherryPick applies a commit and keeps its message and trailers', () => {
  const { r, base, wt1 } = pickRepo()
  commit(wt1, 'a.txt', 'a', 'Add a', trailers('T01'))
  const msg = g.commitsSince(wt1, base)[0].message
  assert.deepEqual(g.cherryPick(r, g.head(wt1)), { ok: true })
  const picked = g.commitsSince(r, base)
  assert.equal(picked.length, 1)
  assert.equal(picked[0].message, msg)
  assert.doesNotMatch(picked[0].message, /cherry picked from/)
  assert.deepEqual(g.committedTasks(r, plan), { T01: g.head(r) })
  assert.ok(g.isClean(r))
  assert.equal(g.pickInProgress(r), false)
})

test('cherryPick of two commits in id order keeps that order', () => {
  const { r, base, wt1, wt2 } = pickRepo()
  commit(wt1, 'a.txt', 'a', 'Add a', trailers('T01'))
  commit(wt2, 'b.txt', 'b', 'Add b', trailers('T02'))
  const m1 = g.commitsSince(wt1, base)[0].message
  const m2 = g.commitsSince(wt2, base)[0].message
  assert.deepEqual(g.cherryPick(r, g.head(wt1)), { ok: true })
  assert.deepEqual(g.cherryPick(r, g.head(wt2)), { ok: true })
  assert.deepEqual(g.commitsSince(r, base).map(c => c.message), [m1, m2])
})

test('cherryPick reports a conflict, leaves the pick in progress and cherryPickAbort undoes it', () => {
  const { r, wt1, wt2 } = pickRepo()
  commit(wt1, 'README.md', 'one\n', 'README in T01', trailers('T01'))
  commit(wt2, 'README.md', 'two\n', 'README in T02', trailers('T02'))
  assert.deepEqual(g.cherryPick(r, g.head(wt1)), { ok: true })
  const after = g.head(r)
  const res = g.cherryPick(r, g.head(wt2))
  assert.equal(res.ok, false)
  assert.deepEqual(res.conflicts, ['README.md'])
  assert.match(res.failure, /^git cherry-pick [0-9a-f]+ failed: /)
  assert.equal(g.pickInProgress(r), true)
  assert.deepEqual(g.cherryPickAbort(r), { ok: true })
  assert.equal(g.head(r), after)
  assert.ok(g.isClean(r))
  assert.equal(g.pickInProgress(r), false)
  assert.equal(fs.readFileSync(path.join(r, 'README.md'), 'utf8'), 'one\n')
})

test('a pick in progress in a linked worktree is seen there only', () => {
  const { r, wt2 } = pickRepo()
  commit(wt2, 'README.md', 'two\n', 'README in T02')
  commit(r, 'README.md', 'main\n', 'README on main')
  const res = g.cherryPick(wt2, g.head(r))
  assert.equal(res.ok, false)
  assert.deepEqual(res.conflicts, ['README.md'])
  assert.equal(g.pickInProgress(wt2), true)
  assert.equal(g.pickInProgress(r), false)
  assert.deepEqual(g.cherryPickAbort(wt2), { ok: true })
  assert.ok(g.isClean(wt2))
})

test('cherryPick and cherryPickAbort report other failures', () => {
  const { r } = pickRepo()
  const bad = g.cherryPick(r, '0'.repeat(40))
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.conflicts, [])
  assert.equal(g.pickInProgress(r), false)
  assert.match(g.cherryPick(r, '').failure, /needs a commit/)
  assert.equal(g.cherryPickAbort(r).ok, false)
  const missing = path.join(dir, 'missing')
  assert.equal(g.cherryPick(missing, g.head(r)).ok, false)
  assert.equal(g.cherryPickAbort(missing).ok, false)
})
