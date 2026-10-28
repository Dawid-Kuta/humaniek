import { useEffect, useState } from 'react'
import { chunkOf, foldText } from './names'

// Built by scripts/build-anatomy-data.mjs. The index (~270 KB) carries the
// names of every structure; descriptions live in shards fetched on demand.
const DATA_URL = `${import.meta.env.BASE_URL}data/`

let indexPromise = null

export function loadIndex() {
  indexPromise ??= fetch(`${DATA_URL}index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`index.json: HTTP ${r.status}`)
      return r.json()
    })
    .then((raw) => {
      const byId = new Map()
      for (const s of raw.structures) {
        s.f = [foldText(s.pl), foldText(s.la), foldText(s.en)]
        byId.set(s.id, s)
      }
      return { chunks: raw.chunks, list: raw.structures, byId }
    })
  return indexPromise
}

export function useAnatomyIndex() {
  const [index, setIndex] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    loadIndex().then(
      (i) => alive && setIndex(i),
      (e) => alive && setError(e),
    )
    return () => {
      alive = false
    }
  }, [])
  return { index, error }
}

const shards = new Map()

export function loadDetails(index, id) {
  const n = chunkOf(id, index.chunks)
  if (!shards.has(n)) {
    const p = fetch(`${DATA_URL}details/${String(n).padStart(2, '0')}.json`).then((r) => {
      if (!r.ok) throw new Error(`details ${n}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => shards.delete(n))
    shards.set(n, p)
  }
  return shards.get(n).then((shard) => shard[id] || {})
}

export function useDetails(index, id) {
  const [state, setState] = useState({ id: null, details: null, error: null })
  useEffect(() => {
    if (!index || !id) return
    let alive = true
    loadDetails(index, id).then(
      (details) => alive && setState({ id, details, error: null }),
      (error) => alive && setState({ id, details: null, error }),
    )
    return () => {
      alive = false
    }
  }, [index, id])
  return state.id === id ? state : { id, details: null, error: null }
}

/**
 * Diacritic-insensitive search over Polish, Latin and English names. Every
 * query word must match; names that start with the query rank first.
 */
export function searchStructures(index, query, limit = 40) {
  const q = foldText(query)
  if (!index || q.length < 2) return []
  const words = q.split(/\s+/).filter(Boolean)
  const results = []
  for (const s of index.list) {
    const hay = s.f.join(' ')
    if (!words.every((w) => hay.includes(w))) continue
    let score = 0
    for (const name of s.f) {
      if (!name) continue
      if (name === q) score = Math.max(score, 100)
      else if (name.startsWith(q)) score = Math.max(score, 60)
      else if (name.includes(` ${words[0]}`)) score = Math.max(score, 30)
    }
    if (s.m) score -= 5
    results.push([score - (s.pl || s.en).length / 200, s])
  }
  results.sort((a, b) => b[0] - a[0])
  return results.slice(0, limit).map((r) => r[1])
}

export const displayName = (s) => s?.pl || s?.en || s?.id || ''

/** The structure and all of its parts (e.g. deltoid -> its three parts). */
export function membersOf(index, id) {
  const out = new Set()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()
    if (out.has(cur)) continue
    out.add(cur)
    for (const child of index?.byId.get(cur)?.ch || []) stack.push(child)
  }
  return out
}

export const byPolishName = (index) => (a, b) =>
  displayName(index?.byId.get(a)).localeCompare(displayName(index?.byId.get(b)), 'pl')
