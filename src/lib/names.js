// Z-Anatomy object-name conventions, shared by the browser app and the Node
// build scripts (scripts/*.mjs), so keep this file dependency-free.
//
//   "Femur.l"                        -> left femur
//   "Fibularis brevis muscle.el"     -> insertion ("end") marker, left side
//   "Long plantar ligament.o3r"      -> 3rd origin marker, right side
//   "(Adductor minimus).r"           -> parenthesised = sub-part of a structure
//   "Angular incisure.t" / ".j"      -> empty label anchors (dropped from the model)

const MARKER_RE = /\.([oe])(\d*)([lr])?$/
const SIDE_RE = /\.([lr])$/
const LABEL_RE = /\.([tjgi])$/

export function parseMeshName(raw) {
  let s = String(raw || '').trim()
  let side = null
  let marker = null
  let markerIndex = null
  let label = null

  let m = s.match(MARKER_RE)
  if (m) {
    marker = m[1] === 'o' ? 'origin' : 'insertion'
    markerIndex = m[2] ? Number(m[2]) : null
    side = m[3] || null
    s = s.slice(0, m.index)
  } else if ((m = s.match(SIDE_RE))) {
    side = m[1]
    s = s.slice(0, m.index)
  } else if ((m = s.match(LABEL_RE))) {
    label = m[1]
    s = s.slice(0, m.index)
  }

  s = s.trim()
  if (/^\(.*\)$/.test(s) && isBalanced(s.slice(1, -1))) s = s.slice(1, -1).trim()
  if (/^\[.*\]$/.test(s)) s = s.slice(1, -1).trim()
  s = s.replace(/[.']+$/, '').replace(/\s{2,}/g, ' ').trim()

  return { base: s, side, marker, markerIndex, label }
}

function isBalanced(s) {
  let depth = 0
  for (const c of s) {
    if (c === '(') depth++
    else if (c === ')' && --depth < 0) return false
  }
  return depth === 0
}

/** Stable, URL-safe id for a structure base name ("Hip bone" -> "hip-bone"). */
export function structureId(base) {
  return foldText(base)
    .replace(/\*/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Lowercase + strip diacritics, so "miesien" matches "Mięsień". */
export function foldText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Small deterministic hash used to spread structures over detail chunks. */
export function chunkOf(id, chunks) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % chunks
}

export const DETAIL_CHUNKS = 48
