#!/usr/bin/env node
// Print everything the app knows about structures, e.g.
//   node scripts/show-structure.mjs deltoid-muscle femur
import { readFileSync } from 'node:fs'
import { chunkOf, structureId } from '../src/lib/names.js'

const index = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'))
const byId = new Map(index.structures.map((s) => [s.id, s]))
for (const arg of process.argv.slice(2)) {
  const id = byId.has(arg) ? arg : structureId(arg)
  const entry = byId.get(id)
  if (!entry) {
    console.log(`${arg}: not found`)
    continue
  }
  const shard = JSON.parse(readFileSync(new URL(`../public/data/details/${String(chunkOf(id, index.chunks)).padStart(2, '0')}.json`, import.meta.url), 'utf8'))
  const d = shard[id] || {}
  const short = (s, n = 260) => (s && s.length > n ? `${s.slice(0, n)}…` : s)
  console.log('='.repeat(80))
  console.log(entry)
  console.log({
    ta2: d.ta2,
    wpl: d.wpl && { t: d.wpl.t, generic: d.wpl.generic, x: short(d.wpl.x), img: !!d.wpl.img },
    wen: d.wen && { t: d.wen.t, generic: d.wen.generic, x: short(d.wen.x) },
    def: d.def && short(d.def.x, 160),
    facts: d.facts,
    plf: d.plf && Object.fromEntries(Object.entries(d.plf).map(([k, v]) => [k, short(v, 300)])),
    att: d.att,
    batt: d.batt && { o: d.batt.o.length, e: d.batt.e.length },
  })
}
