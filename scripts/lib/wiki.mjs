import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const UA = 'Humaniek-anatomy-atlas/1.0 (https://github.com/Dawid-Kuta/humaniek; data build script)'
const CACHE_DIR = new URL('../.cache/', import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let lastRequest = 0
let networkRequests = 0
export const stats = () => ({ networkRequests })

/**
 * GET a JSON document, caching it on disk under scripts/.cache. Requests are
 * serialised with a small gap and retried on 429/5xx/maxlag, as the Wikimedia
 * API etiquette asks.
 */
export async function cachedJson(url, { accept = 'application/json' } = {}) {
  const key = createHash('sha1').update(url).digest('hex')
  const file = new URL(`${key}.json`, CACHE_DIR)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))

  for (let attempt = 0; attempt < 7; attempt++) {
    const wait = lastRequest + 120 - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest = Date.now()
    networkRequests++
    let res
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: accept } })
    } catch (err) {
      await sleep(1500 * 2 ** attempt)
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0
      await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const json = await res.json()
    if (json?.error?.code === 'maxlag') {
      await sleep(5000)
      continue
    }
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(file, JSON.stringify(json))
    return json
  }
  throw new Error(`Giving up on ${url}`)
}

export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const validTitle = (t) => t && !/[|#<>[\]{}]/.test(t) && Buffer.byteLength(t) < 250

/**
 * action=query over many titles with batching + continuation. Pages are
 * merged by title; `resolve(input)` follows normalisation and redirects.
 */
export async function mwQuery(wiki, titles, params, batchSize = 50) {
  const api = `https://${wiki}.wikipedia.org/w/api.php`
  const pages = new Map()
  const alias = new Map()
  const fragmentRedirect = new Set()
  const uniq = [...new Set(titles.filter(validTitle))]
  for (const batch of chunk(uniq, batchSize)) {
    let cont = {}
    do {
      const qs = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        maxlag: '5',
        redirects: '1',
        titles: batch.join('|'),
        ...params,
        ...cont,
      })
      const j = await cachedJson(`${api}?${qs}`)
      for (const n of j.query?.normalized || []) alias.set(n.from, n.to)
      for (const r of j.query?.redirects || []) {
        alias.set(r.from, r.to)
        if (r.tofragment) fragmentRedirect.add(r.from)
      }
      for (const p of j.query?.pages || []) {
        const prev = pages.get(p.title)
        if (!prev) pages.set(p.title, p)
        else {
          for (const [k, v] of Object.entries(p)) {
            if (Array.isArray(v) && Array.isArray(prev[k])) prev[k].push(...v)
            else if (prev[k] === undefined) prev[k] = v
          }
        }
      }
      cont = j.continue || null
    } while (cont)
  }
  // `strict` refuses redirects into a section ("Supraglenoid tubercle" ->
  // "Scapula#..."), whose target article describes a larger structure.
  const resolve = (t, { strict = false } = {}) => {
    let cur = t
    for (let i = 0; i < 5 && alias.has(cur); i++) {
      if (strict && fragmentRedirect.has(cur)) return null
      cur = alias.get(cur)
    }
    const p = pages.get(cur)
    return p && !p.missing && !p.invalid ? p : null
  }
  return { pages, resolve }
}

/** One title per request (needed for full-text extracts). */
export async function mwSingle(wiki, title, params) {
  const api = `https://${wiki}.wikipedia.org/w/api.php`
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    redirects: '1',
    titles: title,
    ...params,
  })
  const j = await cachedJson(`${api}?${qs}`)
  const p = j.query?.pages?.[0]
  return p && !p.missing ? p : null
}

export async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const j = await cachedJson(url, { accept: 'application/sparql-results+json' })
  return j.results.bindings
}

export const wikiUrl = (wiki, title) =>
  `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',')}`

/** Extract the title from a Wikipedia article URL, e.g. ".../wiki/Pectoralis_major#Parts". */
export function titleFromUrl(url) {
  const m = String(url).match(/^https?:\/\/(\w+)\.wikipedia\.org\/wiki\/([^?#\s]+)/i)
  if (!m) return null
  try {
    return { wiki: m[1].toLowerCase(), title: decodeURIComponent(m[2]).replace(/_/g, ' ') }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- wikitext

/** Return { type, params } of the first {{Infobox ...}} template, or null. */
export function parseInfobox(wikitext) {
  if (!wikitext) return null
  const src = wikitext.replace(/<!--[\s\S]*?-->/g, '')
  const start = src.search(/\{\{\s*infobox[\s_]/i)
  if (start < 0) return null
  let depth = 0
  let end = -1
  for (let i = start; i < src.length - 1; i++) {
    if (src[i] === '{' && src[i + 1] === '{') {
      depth++
      i++
    } else if (src[i] === '}' && src[i + 1] === '}') {
      depth--
      i++
      if (depth === 0) {
        end = i - 1
        break
      }
    }
  }
  if (end < 0) return null
  const body = stripRefs(src.slice(start + 2, end))
  const parts = splitTopLevel(body, '|')
  const type = parts.shift().replace(/^\s*infobox[\s_]*/i, '').trim().toLowerCase()
  const params = {}
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq < 0) continue
    const k = p.slice(0, eq).trim().toLowerCase().replace(/[_\s]+/g, ' ')
    const v = p.slice(eq + 1).trim()
    if (k && v) params[k] = v
  }
  return { type, params }
}

function stripRefs(s) {
  return s
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
}

function splitTopLevel(s, sep) {
  const out = []
  let cur = ''
  let curly = 0
  let square = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const n = s[i + 1]
    if (c === '{' && n === '{') {
      curly++
      cur += '{{'
      i++
    } else if (c === '}' && n === '}') {
      curly--
      cur += '}}'
      i++
    } else if (c === '[' && n === '[') {
      square++
      cur += '[['
      i++
    } else if (c === ']' && n === ']') {
      square--
      cur += ']]'
      i++
    } else if (c === sep && curly === 0 && square === 0) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const KEEP_LAST_ARG = new Set(['nowrap', 'small', 'nobr', 'lang', 'langx', 'transl', 'nowrap begin', 'smaller', 'big', 'em', 'strong', 'vr', 'not a typo'])
const LIST_TEMPLATES = new Set(['ubl', 'unbulleted list', 'plainlist', 'plain list', 'hlist', 'flatlist', 'bulleted list', 'ublist', 'unbulleted', 'flat list', 'bulleted'])

function templateToText(inner) {
  const parts = inner.split('|')
  const name = parts[0].trim().toLowerCase()
  const args = parts.slice(1).filter((p) => !/^\s*[\w-]+\s*=/.test(p))
  if (KEEP_LAST_ARG.has(name)) return args.at(-1) ?? ''
  if (LIST_TEMPLATES.has(name)) return '\n' + args.map((a) => (a.trim().startsWith('*') ? a : `* ${a}`)).join('\n') + '\n'
  if (name === 'abbr' || name === 'sub' || name === 'sup' || name === 'sc' || name === 'smallcaps') return args[0] ?? ''
  if (name === 'nbsp' || name === 'sp') return ' '
  if (name === '!') return '|'
  if (name === 'ndash' || name === 'snd' || name === 'spaced ndash') return ' – '
  if (name === 'mdash' || name === 'spaced mdash') return ' — '
  if (name === 'cvt' || name === 'convert') return args.slice(0, 2).join(' ')
  return ''
}

/**
 * Convert a wikitext fragment to plain text. Returns { text, links } where
 * links = [{ target, label }] for every [[wikilink]] that survived.
 */
export function wikiToText(input) {
  const links = []
  let s = stripRefs(String(input || '').replace(/<!--[\s\S]*?-->/g, ''))
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, (_, target, label) => {
    if (/^(file|image|plik|grafika|category|kategoria):/i.test(target.trim())) return ''
    links.push({ target: target.trim(), label: label.trim() })
    return label
  })
  s = s.replace(/\[\[([^\]|]+)\]\]/g, (_, target) => {
    if (/^(file|image|plik|grafika|category|kategoria):/i.test(target.trim())) return ''
    links.push({ target: target.trim(), label: target.trim() })
    return target
  })
  for (let guard = 0; guard < 12 && /\{\{/.test(s); guard++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => templateToText(inner))
  }
  s = s.replace(/\{\{|\}\}/g, '')
  s = s.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]]+\]/g, '')
  s = s.replace(/'''''|'''|''/g, '')
  s = s.replace(/<\/?(?:small|big|span|div|sup|sub|abbr|center|nowiki|i|b|u|s)[^>]*>/gi, '')
  s = s.replace(/<[^>]+>/g, '')
  s = s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  const lines = s
    .split('\n')
    .map((l) => l.replace(/^\s*[*#:;]+\s*/, (m) => (/[*#]/.test(m) ? '• ' : '')).replace(/[ \t]{2,}/g, ' ').trim())
    .filter((l) => l && l !== '•')
  const text = lines.join('\n').replace(/\s+([,.;:])/g, '$1').trim()
  return { text, links }
}
