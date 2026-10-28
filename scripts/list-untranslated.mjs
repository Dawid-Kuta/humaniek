#!/usr/bin/env node
// Lists English-only facts of muscles and bones that have neither an
// automatic Polish term translation nor an entry in
// scripts/sources/translations-pl.json, as { key: { en, ctx } }:
//   node scripts/list-untranslated.mjs untranslated.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { factKey } from './lib/fact-key.mjs'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const index = read('../public/data/index.json')
const known = existsSync(new URL('./sources/translations-pl.json', import.meta.url)) ? read('./sources/translations-pl.json') : {}
const sys = new Map(index.structures.map((s) => [s.id, s.s]))
const out = new Map()
for (let i = 0; i < index.chunks; i++) {
  const shard = read(`../public/data/details/${String(i).padStart(2, '0')}.json`)
  for (const [id, d] of Object.entries(shard)) {
    if (!['muscular', 'skeletal'].includes(sys.get(id))) continue
    for (const f of d.facts || []) {
      const key = factKey(f.en)
      if (f.pl || known[key] || out.has(key)) continue
      out.set(key, { en: f.en, ctx: `${f.k} | ${id}` })
    }
  }
}
const sorted = [...out.entries()].sort((a, b) => a[1].ctx.localeCompare(b[1].ctx))
const json = JSON.stringify(Object.fromEntries(sorted), null, 1)
if (process.argv[2]) writeFileSync(process.argv[2], json)
else console.log(json)
console.error(`${sorted.length} untranslated facts`)
