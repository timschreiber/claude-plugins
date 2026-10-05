// Grindinator work package discovery (spec R-G1). A package is a Markdown file named
// "WP-NN · Title.md" (space, U+00B7 middle dot, space) in the packages directory.
// Look-alike names are skipped with a warning; other files are ignored silently.
'use strict'

const fs = require('fs')
const path = require('path')
const { GrindinatorError } = require('./errors.js')

const PACKAGE_PATTERN = /^(WP-([0-9]{2,})) · (.+)\.md$/u

function isPackageId(id) {
  return /^WP-[0-9]{2,}$/.test(id)
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function discover(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') throw new GrindinatorError(`the packages directory ${dir} does not exist`)
    if (err.code === 'ENOTDIR') throw new GrindinatorError(`${dir} is not a directory`)
    throw err
  }

  const packages = []
  const warnings = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const name = entry.name
    const match = PACKAGE_PATTERN.exec(name)
    if (match) {
      packages.push({
        id: match[1],
        number: parseInt(match[2], 10),
        title: match[3],
        name,
        file: path.join(dir, name)
      })
    } else {
      const lower = name.toLowerCase()
      if (lower.startsWith('wp-') && lower.endsWith('.md')) {
        warnings.push(`${name}: looks like a work package but is not named "WP-NN · Title.md"; skipped`)
      }
    }
  }

  packages.sort((a, b) => a.number - b.number || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const seen = new Map()
  for (const pkg of packages) {
    if (seen.has(pkg.id)) {
      const names = [seen.get(pkg.id), pkg.name].sort()
      throw new GrindinatorError(`two packages share the id ${pkg.id}: ${names[0]} and ${names[1]}`)
    }
    seen.set(pkg.id, pkg.name)
  }

  if (packages.length === 0) {
    throw new GrindinatorError(`no work packages named "WP-NN · Title.md" in ${dir}`)
  }
  return { packages, warnings }
}

function readPackage(pkg) {
  return stripBom(fs.readFileSync(pkg.file, 'utf8'))
}

function loadPreamble(file) {
  if (file === null) return null
  try {
    return stripBom(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') throw new GrindinatorError(`the preamble file ${file} does not exist`)
    throw err
  }
}

function buildPrompt(preambleText, packageText) {
  if (preambleText === null || preambleText.trim() === '') return packageText
  return preambleText.trimEnd() + '\n\n' + packageText
}

module.exports = { PACKAGE_PATTERN, isPackageId, discover, readPackage, loadPreamble, buildPrompt }
