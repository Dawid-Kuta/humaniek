#!/usr/bin/env node
// Downloads the raw inputs of scripts/build-anatomy-data.mjs into
// scripts/sources/. Run it again to pick up newer Z-Anatomy translations.
//
//   zanatomy-ta2.csv            Z-Anatomy terminology sheet (TA2 IDs, EN/LA/PL
//                               names + synonyms), CC BY-SA 4.0
//   zanatomy-definitions.json   Z-Anatomy definitions (EN, Wikipedia-based)
//                               migrated once from the old src/data/anatomy_db.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseMeshName } from '../src/lib/names.js'

const SOURCES = new URL('./sources/', import.meta.url)
const SHEET_ID = '1Ee6rmpT-SBkcey_VMumNsyM9pOM8OoiEcY7-jVWhaDM'
const TA2_GID = '1807617850'

mkdirSync(SOURCES, { recursive: true })

const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TA2_GID}`
console.log('Downloading Z-Anatomy TA2 sheet…')
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) throw new Error(`HTTP ${res.status} while downloading the TA2 sheet`)
const csv = await res.text()
if (!csv.startsWith('Obj,') || !csv.includes('Polski')) throw new Error('Unexpected TA2 sheet format')
writeFileSync(new URL('zanatomy-ta2.csv', SOURCES), csv)
console.log(`  zanatomy-ta2.csv: ${(csv.length / 1e6).toFixed(2)} MB`)

const legacyDb = new URL('../src/data/anatomy_db.json', import.meta.url)
const defsFile = new URL('zanatomy-definitions.json', SOURCES)
if (existsSync(legacyDb)) {
  const db = JSON.parse(readFileSync(legacyDb, 'utf8'))
  const defs = {}
  for (const entry of db) {
    const text = (entry.description || '').trim()
    if (!text) continue
    const key = parseMeshName(entry.mesh_name).base.toLowerCase()
    if (key && !defs[key]) defs[key] = text
  }
  writeFileSync(defsFile, JSON.stringify(defs, null, 0))
  console.log(`  zanatomy-definitions.json: ${Object.keys(defs).length} definitions`)
} else if (!existsSync(defsFile)) {
  console.warn('  No legacy anatomy_db.json and no zanatomy-definitions.json - definitions will be empty.')
}
