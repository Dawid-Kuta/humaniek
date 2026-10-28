#!/usr/bin/env node
// Builds the anatomy data the app loads at runtime:
//
//   public/data/index.json        every structure: id, PL / LA / EN name, system
//   public/data/details/NN.json   descriptions, facts and attachments, fetched
//                                 lazily in DETAIL_CHUNKS shards
//   public/data/export/*.csv      muscles & bones as spreadsheets
//
// Inputs (run scripts/fetch-sources.mjs first):
//   - model GLB: structure list, systems, L/R sides, origin/insertion markers
//   - Z-Anatomy TA2 sheet: Polish, Latin and English nomenclature
//   - Z-Anatomy definitions (EN)
//   - Wikidata (TA2 ID -> Wikipedia articles) and Wikipedia PL / EN
//     (intro extracts, thumbnails, EN infobox facts, PL article sentences)
// Every HTTP response is cached in scripts/.cache, so reruns are offline.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readGlbJson, nodeMaterialNames } from './lib/glb.mjs'
import { parseCsv } from './lib/csv.mjs'
import { mwQuery, mwSingle, sparql, wikiUrl, titleFromUrl, parseInfobox, wikiToText, stats } from './lib/wiki.mjs'
import { factKey as translationKey } from './lib/fact-key.mjs'
import { parseMeshName, structureId, chunkOf, DETAIL_CHUNKS, foldText } from '../src/lib/names.js'
import { systemFor } from '../src/lib/layers.js'

const ROOT = new URL('../', import.meta.url)
const MODEL = new URL(process.env.MODEL_SOURCE || 'scripts/sources/model-source.glb', ROOT)
const SOURCES = new URL('scripts/sources/', ROOT)
const OUT = new URL('public/data/', ROOT)
const MAX_DEF_CHARS = 9000
const MAX_EXTRACT_CHARS = 4000
const MAX_FACT_CHARS = 700

const log = (...a) => console.log(...a)
const lcFirst = (s) => (s && /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const uniq = (arr) => [...new Set(arr.filter(Boolean))]

// ------------------------------------------------------------ 1. structures
log('1/9 Reading model', MODEL.pathname)
const glb = readGlbJson(MODEL)
const parentOf = new Map()
glb.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)))

const structures = new Map()
const isUsefulBase = (b) => b && /[a-z]{3}/i.test(b)

for (const [i, node] of glb.nodes.entries()) {
  if (node.mesh == null) continue
  const p = parseMeshName(node.name)
  if (!isUsefulBase(p.base)) continue
  const id = structureId(p.base)
  if (!id) continue
  let s = structures.get(id)
  if (!s) structures.set(id, (s = { id, base: p.base, votes: {}, sides: new Set(), meshes: 0, markers: [] }))
  if (p.side) s.sides.add(p.side)
  const mats = nodeMaterialNames(glb, node)
  if (p.marker) {
    const parent = glb.nodes[parentOf.get(i)]
    const on = parent ? structureId(parseMeshName(parent.name).base) : null
    s.markers.push({ kind: p.marker, side: p.side, on, ligament: mats.some((m) => /ligament/i.test(m)) })
  } else {
    const sys = systemFor(mats, p.base)
    s.votes[sys] = (s.votes[sys] || 0) + 1
    s.meshes++
  }
}
for (const s of structures.values()) {
  const top = Object.entries(s.votes).sort((a, b) => b[1] - a[1])[0]
  s.sys = top ? top[0] : s.markers.some((m) => m.ligament) ? 'joints' : 'muscular'
}
log(`   ${structures.size} structures`)

// ------------------------------------------------------------ 2. names (TA2)
log('2/9 Matching Z-Anatomy TA2 nomenclature')
const sheet = parseCsv(readFileSync(new URL('zanatomy-ta2.csv', SOURCES), 'utf8'))
const header = sheet[0]
const C = { ta2: header.indexOf('TA2ID'), en: header.indexOf('English'), la: header.indexOf('Latin'), pl: header.indexOf('Polski') }
C.enSyn = C.en + 1
C.laSyn = C.la + 1
if (Object.values(C).some((i) => i < 0) || header[C.enSyn] !== 'Synonyms') throw new Error('Unexpected TA2 sheet header')

const termKey = (t) => foldText(t).replace(/\*/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()
const splitSyn = (s) => String(s || '').split(/[%;]/).map(clean).filter(Boolean)
const terms = new Map()
const addTerm = (t, rec, primary) => {
  const k = termKey(t)
  if (!k) return
  const prev = terms.get(k)
  if (!prev || (primary && !prev.primary)) terms.set(k, { rec, primary })
}
// Obvious typos in the source sheet (wrong case ending).
const PL_FIXES = [
  [/^Głowa przyśrodkową\b/, 'Głowa przyśrodkowa'],
  [/^Płuco lewye$/, 'Płuco lewe'],
]
const fixPl = (s) => PL_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), s)
for (const r of sheet.slice(1)) {
  const en = clean(r[C.en])
  if (!en) continue
  const rec = { ta2: clean(r[C.ta2]), en, la: clean(r[C.la]), pl: fixPl(clean(r[C.pl])), enSyn: splitSyn(r[C.enSyn]), laSyn: splitSyn(r[C.laSyn]) }
  addTerm(en, rec, true)
  for (const syn of rec.enSyn) addTerm(syn, rec, false)
}

// Muscles present in the model but missing from the Z-Anatomy sheet.
const MANUAL_NAMES = {
  'abdominal part of pectoralis major muscle': { pl: 'Część brzuszna mięśnia piersiowego większego', la: 'Pars abdominalis musculi pectoralis majoris' },
  'adductor minimus': { pl: 'Mięsień przywodziciel najmniejszy', la: 'Musculus adductor minimus' },
  'opponens digiti minimi muscle of foot': { pl: 'Mięsień przeciwstawiacz palca małego stopy', la: 'Musculus opponens digiti minimi pedis' },
}

function lookupName(base) {
  const direct = [base, base.replace(/\*/g, ''), base.replace(/\bof\s+the\b/gi, 'of'), base.replace(/ muscles?$/i, ''), `${base} muscle`]
  for (const v of direct) {
    const hit = terms.get(termKey(v))
    if (hit) return { ...hit.rec }
  }
  const manual = MANUAL_NAMES[base.toLowerCase()]
  if (manual) return { ta2: '', en: base, enSyn: [], laSyn: [], ...manual }
  // "Middle cerebral artery (M3 segment)" -> name of the parent + the qualifier
  const m = base.match(/^(.*?)\s*\(([^()]*)\)\s*\*?$/)
  if (m) {
    const hit = terms.get(termKey(m[1]))
    if (hit) return { ...hit.rec, en: base, pl: hit.rec.pl ? `${hit.rec.pl} (${m[2]})` : '', la: hit.rec.la ? `${hit.rec.la} (${m[2]})` : '', partial: true }
  }
  return null
}

// --------------------------------------------------------- 3. definitions
log('3/9 Z-Anatomy definitions')
const defs = JSON.parse(readFileSync(new URL('zanatomy-definitions.json', SOURCES), 'utf8'))
function parseDefinition(raw) {
  if (!raw) return null
  const urls = uniq([...raw.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0].replace(/[.,;]+$/, '')))
  const lines = raw.replace(/\r/g, '').replace(/https?:\/\/[^\s)\]]+/g, '').split('\n')
  while (lines.length && !lines[0].trim()) lines.shift()
  if (lines.length && /[A-Z]/.test(lines[0]) && lines[0].trim() === lines[0].trim().toUpperCase()) lines.shift()
  let text = lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  let truncated = false
  if (text.length > MAX_DEF_CHARS) {
    const cut = text.lastIndexOf('\n\n', MAX_DEF_CHARS)
    text = text.slice(0, cut > MAX_DEF_CHARS / 2 ? cut : MAX_DEF_CHARS).trim()
    truncated = true
  }
  return text ? { text, urls, truncated } : null
}

// ------------------------------------------------- 3b. parts -> structures
// Many muscles only exist as their parts ("Clavicular part of deltoid
// muscle", "Long head of biceps brachii"); some parents have no mesh of their
// own (trapezius). Link parts to parents, creating the missing parents, so
// selecting "Mięsień naramienny" highlights all of its parts.
const PART_RE = /^(.+?)\s+(?:part|head|belly|portion|fibres|fibers|layer|lamina|segment|lobe)s?\s+of\s+(?:the\s+)?(.+?)(?:\s*\([^()]*\))?$/i
const COMPOSITES = [
  ['Quadriceps femoris muscle', /^(rectus femoris|vastus (lateralis|medialis|intermedius)) muscle$/i],
  ['Triceps surae muscle', /^(gastrocnemius( muscle)?|soleus muscle)$/i],
  ['Erector spinae', /^(iliocostalis|longissimus|spinalis) (capitis|colli|thoracis|lumborum) muscle$/i],
  ['Iliopsoas muscle', /^(iliacus muscle|psoas major( muscle)?)$/i],
  ['Levator ani', /^(puborectalis|pubococcygeus|iliococcygeus) muscle$/i],
]
const findStructure = (name) =>
  [name, `${name} muscle`, name.replace(/ muscle$/i, '')].map(structureId).map((id) => structures.get(id)).find(Boolean)

function ensureParent(name, children) {
  let parent = findStructure(name)
  if (!parent) {
    if (children.length < 2) return null
    const rec = lookupName(name) || lookupName(`${name} muscle`)
    if (!rec || rec.partial) return null
    const id = structureId(rec.en)
    parent = structures.get(id)
    if (!parent) {
      parent = { id, base: rec.en, votes: {}, sides: new Set(), meshes: 0, markers: [], sys: children[0].sys, virtual: true }
      structures.set(id, parent)
    }
  }
  for (const child of children) {
    if (child === parent || child.parent || parent.sys !== child.sys) continue
    child.parent = parent.id
    ;(parent.children ??= []).push(child.id)
    for (const side of child.sides) parent.sides.add(side)
  }
  return parent
}

const byParentName = new Map()
for (const s of [...structures.values()]) {
  const m = s.base.match(PART_RE)
  if (!m || /\bof$/i.test(m[1].trim())) continue
  const key = m[2].toLowerCase()
  if (!byParentName.has(key)) byParentName.set(key, [])
  byParentName.get(key).push(s)
}
for (const [name, children] of byParentName) ensureParent(name, children)
for (const [name, re] of COMPOSITES) {
  const children = [...structures.values()].filter((s) => re.test(s.base) && !s.parent)
  if (children.length) ensureParent(name, children)
}

for (const s of structures.values()) {
  s.names = lookupName(s.base)
  s.def = parseDefinition(defs[s.base.toLowerCase()])
}

// ------------------------------------------------------------ 4. Wikidata
log('4/9 Wikidata: TA2 ID -> Wikipedia articles')
const wdRows = await sparql(`SELECT ?item ?ta2 ?plTitle ?enTitle WHERE {
  ?item wdt:P7173 ?ta2 .
  OPTIONAL { ?pl schema:about ?item ; schema:isPartOf <https://pl.wikipedia.org/> ; schema:name ?plTitle . }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
}`)
const wdByTa2 = new Map()
for (const r of wdRows) {
  const list = wdByTa2.get(r.ta2.value) ?? []
  list.push({ qid: r.item.value.split('/').pop(), pl: r.plTitle?.value, en: r.enTitle?.value })
  wdByTa2.set(r.ta2.value, list)
}
const wdFor = (ta2) => {
  const list = (ta2 && wdByTa2.get(ta2)) || []
  return { en: list.find((x) => x.en)?.en, pl: list.find((x) => x.pl)?.pl, qid: list[0]?.qid }
}

/** QIDs that carry an anatomical identifier (FMA, TA98, TA2, TA98 Latin, UBERON). */
async function anatomicalQids(qids) {
  const ok = new Set()
  for (let i = 0; i < qids.length; i += 250) {
    const values = qids.slice(i, i + 250).map((q) => `wd:${q}`).join(' ')
    const rows = await sparql(`SELECT DISTINCT ?item WHERE { VALUES ?item { ${values} }
      { ?item wdt:P1402 [] } UNION { ?item wdt:P1323 [] } UNION { ?item wdt:P7173 [] } UNION { ?item wdt:P3982 [] } UNION { ?item wdt:P1554 [] } }`)
    for (const r of rows) ok.add(r.item.value.split('/').pop())
  }
  return ok
}

// ------------------------------------------------------ 5. pick articles
log('5/9 Resolving Wikipedia articles')
for (const s of structures.values()) {
  const ta2 = s.names?.ta2
  const ta2Parent = ta2?.includes('*') ? ta2.split('*')[0] : null
  s.wd = wdFor(ta2)
  s.wdParent = wdFor(ta2Parent)
  const defTitle = (s.def?.urls || []).map(titleFromUrl).find((t) => t?.wiki === 'en')?.title
  s.enCandidates = [
    s.wd.en && { title: s.wd.en, trusted: true },
    defTitle && { title: defTitle, trusted: true },
    { title: s.base, trusted: false },
    s.names?.en && s.names.en !== s.base && { title: s.names.en, trusted: false },
    s.wdParent.en && { title: s.wdParent.en, trusted: true, generic: true },
  ].filter(Boolean)
}
const enMeta = await mwQuery('en', [...structures.values()].flatMap((s) => s.enCandidates.map((c) => c.title)), {
  prop: 'pageprops|langlinks',
  ppprop: 'disambiguation|wikibase_item',
  lllang: 'pl',
  lllimit: 'max',
})
const untrustedEn = uniq(
  [...structures.values()].flatMap((s) => s.enCandidates.filter((c) => !c.trusted).map((c) => enMeta.resolve(c.title)?.pageprops?.wikibase_item)),
)
const enAnatomical = await anatomicalQids(untrustedEn)

const pickPage = (meta, candidates, verified) => {
  for (const c of candidates) {
    const page = meta.resolve(c.title)
    if (!page || page.pageprops?.disambiguation !== undefined) continue
    if (!c.trusted && !verified.has(page.pageprops?.wikibase_item)) continue
    return { page, generic: !!c.generic }
  }
  return null
}

for (const s of structures.values()) {
  s.en = pickPage(enMeta, s.enCandidates, enAnatomical)
  const langlink = s.en?.page.langlinks?.find((l) => l.lang === 'pl')?.title
  const byName = s.names?.pl && !s.names.partial ? { title: s.names.pl, trusted: false } : null
  s.plCandidates = [
    s.wd.pl && { title: s.wd.pl, trusted: true },
    !s.en?.generic && langlink && { title: langlink, trusted: true },
    byName,
    s.en?.generic && langlink && { title: langlink, trusted: true, generic: true },
    s.wdParent.pl && { title: s.wdParent.pl, trusted: true, generic: true },
  ].filter(Boolean)
}
const plMeta = await mwQuery('pl', [...structures.values()].flatMap((s) => s.plCandidates.map((c) => c.title)), {
  prop: 'pageprops',
  ppprop: 'disambiguation|wikibase_item',
})
const untrustedPl = uniq(
  [...structures.values()].flatMap((s) => s.plCandidates.filter((c) => !c.trusted).map((c) => plMeta.resolve(c.title)?.pageprops?.wikibase_item)),
)
const plAnatomical = await anatomicalQids(untrustedPl)
for (const s of structures.values()) s.pl = pickPage(plMeta, s.plCandidates, plAnatomical)

// ------------------------------------------------------- 6. summaries
log('6/9 Fetching Wikipedia intros + thumbnails')
const summaryParams = {
  prop: 'extracts|pageimages',
  exintro: '1',
  explaintext: '1',
  exsectionformat: 'plain',
  exlimit: '20',
  piprop: 'thumbnail',
  pithumbsize: '400',
}
const enSum = await mwQuery('en', uniq([...structures.values()].map((s) => s.en?.page.title)), summaryParams, 20)
const plSum = await mwQuery('pl', uniq([...structures.values()].map((s) => s.pl?.page.title)), summaryParams, 20)

const trimExtract = (t) => {
  let text = String(t || '').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > MAX_EXTRACT_CHARS) {
    const cut = text.lastIndexOf('\n', MAX_EXTRACT_CHARS)
    text = `${text.slice(0, cut > MAX_EXTRACT_CHARS / 2 ? cut : MAX_EXTRACT_CHARS).trim()}…`
  }
  return text
}
const wikiEntry = (wiki, pick, sum) => {
  if (!pick) return null
  const p = sum.resolve(pick.page.title)
  const extract = trimExtract(p?.extract)
  if (!extract) return null
  return {
    t: pick.page.title,
    u: wikiUrl(wiki, pick.page.title),
    x: extract,
    img: p?.thumbnail?.source || undefined,
    generic: pick.generic || undefined,
  }
}

// --------------------------------------------------------- 7. EN facts
log('7/9 Parsing English infoboxes')
const enLead = await mwQuery('en', uniq([...structures.values()].map((s) => s.en?.page.title)), {
  prop: 'revisions',
  rvprop: 'content',
  rvslots: 'main',
  rvsection: '0',
}, 20)

function factKey(type, key) {
  const t = type.split(/\s+/)[0]
  switch (key) {
    case 'origin': return 'origin'
    case 'insertion': return 'insertion'
    case 'action': case 'actions': return 'action'
    case 'antagonist': case 'antagonists': return 'antagonist'
    case 'nerve': case 'innervation': return 'nerve'
    case 'blood': case 'artery': case 'arterial supply': return 'artery'
    case 'vein': return 'vein'
    case 'lymph': return 'lymph'
    case 'articulations': case 'articulation': return 'articulations'
    case 'origins': return t === 'bone' ? 'muscleOrigins' : null
    case 'insertions': return t === 'bone' ? 'muscleInsertions' : null
    case 'from': return t === 'ligament' ? 'ligFrom' : t === 'vein' ? 'tributaries' : 'branchOf'
    case 'branch from': case 'branchfrom': case 'source': return t === 'vein' ? 'tributaries' : 'branchOf'
    case 'to': return t === 'ligament' ? 'ligTo' : t === 'vein' ? 'drainsTo' : 'branches'
    case 'branches': case 'branch to': case 'branchto': return 'branches'
    case 'tributaries': return 'tributaries'
    case 'drains to': case 'drainsto': return 'drainsTo'
    case 'drains from': case 'drainsfrom': case 'drainage': return 'drainsFrom'
    case 'innervates': return 'innervates'
    case 'supplies': return 'supplies'
    case 'precursor': return 'precursor'
    case 'system': return 'system'
    case 'part of': case 'partof': return 'partOf'
    case 'movements': return 'movements'
    case 'bones': return 'bones'
    default: return null
  }
}

for (const s of structures.values()) {
  if (!s.en || s.en.generic) continue
  const page = enLead.resolve(s.en.page.title)
  const box = parseInfobox(page?.revisions?.[0]?.slots?.main?.content)
  if (!box) continue
  s.infoboxType = box.type
  s.facts = []
  for (const [key, raw] of Object.entries(box.params)) {
    const k = factKey(box.type, key)
    if (!k || s.facts.some((f) => f.k === k)) continue
    const { text, links } = wikiToText(raw)
    if (!text || /^(\?|none|n\/a|-|–)$/i.test(text) || text.length > MAX_FACT_CHARS) continue
    s.facts.push({ k, en: text, links })
  }
  // Infobox nerve often abuses BranchFrom/BranchTo for the root span
  // ("L2" / "L4"), which would read as parent nerve / branches.
  const from = s.facts.find((f) => f.k === 'branchOf')
  const to = s.facts.find((f) => f.k === 'branches')
  const isSeg = (f) => f && /^[CTLS]\d{1,2}$/.test(f.en)
  if (box.type.startsWith('nerve') && isSeg(from) && isSeg(to)) {
    s.facts = s.facts.filter((f) => f !== from && f !== to)
    s.facts.push({ k: 'roots', en: `${from.en}–${to.en}`, links: [] })
  }
}

// --------------------------------------------- 8. EN -> PL term translation
log('8/9 Translating fact terms to Polish')
const linkTargets = uniq([...structures.values()].flatMap((s) => (s.facts || []).flatMap((f) => f.links.map((l) => l.target))))
const targetMeta = await mwQuery('en', linkTargets, { prop: 'langlinks', lllang: 'pl', lllimit: 'max' })
const targetPl = (target) => {
  const page = targetMeta.resolve(target, { strict: true })
  const pl = page?.langlinks?.find((l) => l.lang === 'pl')?.title
  return pl ? lcFirst(pl.replace(/\s*\([^)]*\)$/, '')) : null
}

const HEAD_LABELS = new Map(Object.entries({
  'short head': 'głowa krótka', 'long head': 'głowa długa', 'lateral head': 'głowa boczna',
  'medial head': 'głowa przyśrodkowa', 'deep head': 'głowa głęboka', 'superficial head': 'głowa powierzchowna',
  'humeral head': 'głowa ramienna', 'ulnar head': 'głowa łokciowa', 'radial head': 'głowa promieniowa',
  'oblique head': 'głowa skośna', 'transverse head': 'głowa poprzeczna', 'humeroulnar head': 'głowa ramienno-łokciowa',
  'clavicular head': 'część obojczykowa', 'sternocostal head': 'część mostkowo-żebrowa', 'sternal head': 'głowa mostkowa',
  'abdominal head': 'część brzuszna', 'abdominal part': 'część brzuszna', 'clavicular part': 'część obojczykowa',
  'acromial part': 'część barkowa', 'spinal part': 'część grzebieniowa', 'superficial part': 'część powierzchowna',
  'deep part': 'część głęboka', 'upper fibers': 'włókna górne', 'middle fibers': 'włókna środkowe',
  'lower fibers': 'włókna dolne', 'anterior fibers': 'włókna przednie', 'posterior fibers': 'włókna tylne',
  'superior part': 'część górna', 'inferior part': 'część dolna', 'medial part': 'część przyśrodkowa', 'lateral part': 'część boczna',
}))
const SEPARATORS = new Map([[',', ', '], [';', '; '], ['and', ' i '], ['or', ' lub '], ['&', ' i '], ['/', ' / ']])

// Spinal segments / cranial nerve numbers: "L5", "C5–C7", "S1 and S2 nerve roots", "CN VII".
const SEGMENT_RE = /^(?:(?:[CTLS]\d{1,2}|CN\s?[IVX]+|[IVX]+)(?:\s*[–-]\s*(?:[CTLS]?\d{1,2}|[IVX]+))?(?:\s*(?:,|and|or|&)\s*)?)+$/i
function translateSegments(s) {
  const core = s.replace(/\b(spinal\s+)?nerve\s+roots?\b|\bspinal nerves?\b|\broots?\b/gi, '').replace(/\s{2,}/g, ' ').trim()
  return SEGMENT_RE.test(core) ? core.replace(/\s+and\s+/gi, ' i ').replace(/\s+or\s+/gi, ' lub ') : null
}

function lookupTermPl(t) {
  const variants = [t, `${t} muscle`, `${t} bone`, t.replace(/s$/, ''), t.replace(/^(left|right)\s+/i, '')]
  for (const v of variants) {
    const hit = terms.get(termKey(v))
    if (hit?.rec.pl) return lcFirst(hit.rec.pl)
  }
  return null
}

function translateTerm(item, linkMap) {
  let t = item.trim().replace(/^(the|a|an)\s+/i, '').replace(/[.:]+$/, '').trim()
  if (!t) return ''
  let suffix = ''
  const paren = t.match(/\s*\(([^()]*)\)$/)
  if (paren) {
    const seg = translateSegments(paren[1])
    if (seg === null) return null
    suffix = ` (${seg})`
    t = t.slice(0, paren.index).trim()
    if (!t) return suffix.trim()
  }
  const bareSeg = translateSegments(t)
  if (bareSeg) return bareSeg + suffix
  const direct = lookupTermPl(t)
  if (direct) return direct + suffix
  const target = linkMap.get(t.toLowerCase())
  if (target) {
    const pl = targetPl(target)
    if (pl) return pl + suffix
  }
  // "Deltoid tuberosity of humerus" -> "guzowatość naramienna (kość ramienna)"
  const of = t.match(/^(.+?)\s+of\s+(?:the\s+)?(.+)$/i)
  if (of) {
    const head = lookupTermPl(of[1]) || (linkMap.has(of[1].toLowerCase()) && targetPl(linkMap.get(of[1].toLowerCase())))
    const tail = lookupTermPl(of[2]) || (linkMap.has(of[2].toLowerCase()) && targetPl(linkMap.get(of[2].toLowerCase())))
    if (head && tail) return `${head} (${tail})${suffix}`
  }
  return null
}

function translateFact(text, links) {
  const linkMap = new Map(links.map((l) => [l.label.toLowerCase().trim(), l.target]))
  const out = []
  for (const rawLine of text.split('\n')) {
    let line = rawLine
    let bullet = ''
    if (line.startsWith('• ')) {
      bullet = '• '
      line = line.slice(2)
    }
    let prefix = ''
    const pm = line.match(/^([A-Za-z][A-Za-z ]{2,30}):\s*(.+)$/)
    if (pm) {
      const pl = HEAD_LABELS.get(pm[1].toLowerCase().trim())
      if (!pl) return null
      prefix = `${pl}: `
      line = pm[2]
    }
    // Keep parenthesised groups ("(L5, S1 and S2)") in one token while splitting.
    const groups = []
    const masked = line.replace(/\([^()]*\)/g, (g) => `\u0000${groups.push(g) - 1}\u0000`)
    const tokens = masked.split(/(\s*[,;&/]\s*|\s+and\s+|\s+or\s+)/i).map((tok) => tok.replace(/\u0000(\d+)\u0000/g, (_, i) => groups[i]))
    let result = ''
    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 1) {
        result += SEPARATORS.get(tokens[i].trim().toLowerCase()) ?? tokens[i]
        continue
      }
      const tr = translateTerm(tokens[i], linkMap)
      if (tr === null) return null
      result += tr
    }
    out.push(bullet + prefix + result.trim())
  }
  return out.join('\n')
}

let translated = 0
let factCount = 0
for (const s of structures.values()) {
  for (const f of s.facts || []) {
    factCount++
    const pl = translateFact(f.en, f.links)
    if (pl && pl.trim()) {
      f.pl = pl
      translated++
    }
  }
}
log(`   ${translated}/${factCount} facts translated term-by-term`)

// Hand-made translations of the remaining muscle and bone facts
// (scripts/list-untranslated.mjs lists what is still English-only).
const manualTranslations = JSON.parse(readFileSync(new URL('translations-pl.json', SOURCES), 'utf8'))
let manual = 0
for (const s of structures.values()) {
  for (const f of s.facts || []) {
    if (f.pl) continue
    const t = manualTranslations[translationKey(f.en)]
    if (t?.pl) {
      f.pl = t.pl
      manual++
    }
  }
}
log(`   ${manual} facts from translations-pl.json`)

// ------------------------------- 9. Polish article sentences for muscles
log('9/9 Polish article sentences (muscles, bones, joints)')
const PL_ABBR = /\b(łac|ang|gr|tzw|m\.in|np|ok|tj|tzn|itd|itp|por|zob|dł|szer|ww|nn|aa|vv|lig|ligg|proc|art|dr|prof|r|w|n|a|v|m|mm|cm|kr|ż|t|k|ust|wg)\.$/i
const PL_END_SECTIONS = /^(Przypisy|Bibliografia|Zobacz też|Linki zewnętrzne|Uwagi|Galeria|Historia)$/i
function splitSentencesPl(text) {
  // Plain-text extracts keep section titles as their own lines ("Unerwienie");
  // drop them so they do not glue onto the next sentence, and stop at the
  // reference sections.
  const paragraphs = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (PL_END_SECTIONS.test(line)) break
    if (!/[.!?:;)]$/.test(line) && line.split(/\s+/).length <= 6) continue
    paragraphs.push(line)
  }
  const out = []
  for (const para of paragraphs) {
    const parts = para.split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ(])/)
    let first = true
    for (const p of parts) {
      if (!first && out.length && PL_ABBR.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`
      else out.push(p)
      first = false
    }
  }
  return out.map((x) => x.trim()).filter((x) => x.length > 25 && x.length < 600 && x.split(/\s+/).length >= 5)
}
const PL_RULES = [
  ['attachments', /przyczep|rozpoczyna się|przyczepia się|bierze początek|kończy się na|przyczepiając|rozpięty między/i],
  ['function', /czynno|działa|funkcj|prostownik|zginacz|odwodziciel|przywodziciel|\b(zgina|prostuje|odwodzi|przywodzi|unosi|obniża|opuszcza|obraca|rotuje|skręca|nawraca|odwraca|napina|pociąga|przyciąga|stabilizuje|zbliża|wciąga|rozszerza|zwęża|zamyka|otwiera|marszczy|ściąga)\b/i],
  ['nerve', /unerwi/i],
  ['artery', /unaczyni|zaopatrywan/i],
]
// A sentence like "Unaczyniony jest przez…, a unerwiony przez…" belongs to
// both of these keys.
const SHARED_KEYS = new Set(['nerve', 'artery'])
// Bones / joints are left out: their Polish articles mostly compare
// vertebrates, so keyword-picked sentences are often not about humans.
const plFactTargets = [...structures.values()].filter((s) => s.pl && !s.pl.generic && s.sys === 'muscular')
for (const s of plFactTargets) {
  const page = await mwSingle('pl', s.pl.page.title, { prop: 'extracts', explaintext: '1', exsectionformat: 'plain' })
  const sentences = splitSentencesPl(page?.extract)
  const picked = {}
  const used = new Map()
  for (const [key, re] of PL_RULES) {
    if (['attachments', 'function'].includes(key) && s.sys !== 'muscular') continue
    const hits = sentences
      .filter((x) => re.test(x) && (!used.has(x) || (SHARED_KEYS.has(key) && SHARED_KEYS.has(used.get(x)))))
      .slice(0, key === 'attachments' ? 4 : 3)
    for (const h of hits) if (!used.has(h)) used.set(h, key)
    if (hits.length) picked[key] = hits.join(' ')
  }
  if (Object.keys(picked).length) s.plFacts = picked
}

// ------------------------------------------- attachments from the 3D model
for (const s of structures.values()) {
  for (const m of s.markers) {
    if (!m.on || m.on === s.id || !structures.has(m.on)) continue
    const key = m.kind === 'origin' ? 'o' : 'e'
    s.att ??= { o: new Set(), e: new Set() }
    s.att[key].add(m.on)
    const bone = structures.get(m.on)
    bone.boneAtt ??= { o: new Set(), e: new Set() }
    bone.boneAtt[key].add(s.id)
  }
}
// A parent muscle attaches wherever its parts do.
const descendantsOf = (s) => (s.children || []).flatMap((id) => [structures.get(id), ...descendantsOf(structures.get(id))])
for (const s of structures.values()) {
  for (const d of descendantsOf(s)) {
    if (!d.att) continue
    s.att ??= { o: new Set(), e: new Set() }
    for (const k of ['o', 'e']) for (const id of d.att[k]) s.att[k].add(id)
  }
}

// ----------------------------------------------------------------- output
rmSync(new URL('details/', OUT), { recursive: true, force: true })
mkdirSync(new URL('details/', OUT), { recursive: true })
mkdirSync(new URL('export/', OUT), { recursive: true })

const sorted = [...structures.values()].sort((a, b) => a.id.localeCompare(b.id))
const sideCode = (s) => [...s.sides].sort().join('')
const index = sorted.map((s) => {
  const e = { id: s.id, en: s.names?.en && !s.names.partial ? s.names.en : s.base, s: s.sys }
  if (s.names?.pl) e.pl = s.names.pl
  if (s.names?.la) e.la = s.names.la
  if (s.sides.size) e.sd = sideCode(s)
  if (s.children?.length) e.ch = [...s.children].sort()
  if (s.parent) e.pa = s.parent
  if (!s.meshes && !s.children?.length) e.m = 1
  return e
})
writeFileSync(new URL('index.json', OUT), JSON.stringify({ v: 2, chunks: DETAIL_CHUNKS, structures: index }))

const setToArr = (x) => (x ? { o: [...x.o].sort(), e: [...x.e].sort() } : undefined)
const shards = Array.from({ length: DETAIL_CHUNKS }, () => ({}))
for (const s of sorted) {
  const wikiPl = wikiEntry('pl', s.pl, plSum)
  const wikiEn = wikiEntry('en', s.en, enSum)
  const d = {}
  if (s.names?.ta2) d.ta2 = s.names.ta2
  const syn = {}
  if (s.names?.enSyn?.length) syn.en = s.names.enSyn
  if (s.names?.laSyn?.length) syn.la = s.names.laSyn
  if (Object.keys(syn).length) d.syn = syn
  if (wikiPl) d.wpl = wikiPl
  if (wikiEn && !(s.def && s.def.text.length > 400 && s.def.urls.some((u) => titleFromUrl(u)?.title === wikiEn.t))) d.wen = wikiEn
  else if (wikiEn) d.wen = { t: wikiEn.t, u: wikiEn.u, img: wikiEn.img, generic: wikiEn.generic }
  if (s.def) d.def = { x: s.def.text, src: s.def.urls, cut: s.def.truncated || undefined }
  if (s.facts?.length) d.facts = s.facts.map(({ k, en, pl }) => (pl ? { k, en, pl } : { k, en }))
  if (s.plFacts) d.plf = s.plFacts
  if (s.att) d.att = setToArr(s.att)
  if (s.boneAtt) d.batt = setToArr(s.boneAtt)
  if (s.wd.qid) d.qid = s.wd.qid
  if (Object.keys(d).length) shards[chunkOf(s.id, DETAIL_CHUNKS)][s.id] = d
}
let detailBytes = 0
shards.forEach((shard, i) => {
  const body = JSON.stringify(shard)
  detailBytes += body.length
  writeFileSync(new URL(`details/${String(i).padStart(2, '0')}.json`, OUT), body)
})

// ------------------------------------------------------------ CSV exports
const csvCell = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' | ')
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const factOf = (s, k, lang) => {
  const f = s.facts?.find((x) => x.k === k)
  return f ? (lang === 'pl' ? f.pl || '' : f.en) : ''
}
const namesOf = (ids) => [...(ids || [])].map((id) => structures.get(id)?.names?.pl || structures.get(id)?.base).join(', ')
const writeCsv = (file, rows) => writeFileSync(new URL(`export/${file}`, OUT), `\ufeff${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`)

const muscles = sorted.filter((s) => s.sys === 'muscular')
writeCsv('miesnie.csv', [
  ['id', 'nazwa_pl', 'nazwa_lac', 'nazwa_en', 'TA2', 'przyczep_poczatkowy_en', 'przyczep_koncowy_en', 'czynnosc_en', 'unerwienie', 'unaczynienie', 'antagonisci', 'przyczepy_poczatkowe_w_modelu', 'przyczepy_koncowe_w_modelu', 'opis_pl_wikipedia', 'wikipedia_pl', 'wikipedia_en'],
  ...muscles.map((s) => [
    s.id, s.names?.pl, s.names?.la, s.names?.en || s.base, s.names?.ta2,
    factOf(s, 'origin', 'en'), factOf(s, 'insertion', 'en'), factOf(s, 'action', 'en'),
    factOf(s, 'nerve', 'pl') || factOf(s, 'nerve', 'en'), factOf(s, 'artery', 'pl') || factOf(s, 'artery', 'en'),
    factOf(s, 'antagonist', 'pl') || factOf(s, 'antagonist', 'en'),
    namesOf(s.att?.o), namesOf(s.att?.e),
    [s.plFacts?.attachments, s.plFacts?.function, s.plFacts?.nerve, s.plFacts?.artery].filter(Boolean).join(' '),
    s.pl ? wikiUrl('pl', s.pl.page.title) : '', s.en ? wikiUrl('en', s.en.page.title) : '',
  ]),
])
const bones = sorted.filter((s) => s.sys === 'skeletal')
writeCsv('kosci.csv', [
  ['id', 'nazwa_pl', 'nazwa_lac', 'nazwa_en', 'TA2', 'polaczenia_en', 'miesnie_przyczep_poczatkowy_w_modelu', 'miesnie_przyczep_koncowy_w_modelu', 'wikipedia_pl', 'wikipedia_en'],
  ...bones.map((s) => [
    s.id, s.names?.pl, s.names?.la, s.names?.en || s.base, s.names?.ta2,
    factOf(s, 'articulations', 'en'), namesOf(s.boneAtt?.o), namesOf(s.boneAtt?.e),
    s.pl ? wikiUrl('pl', s.pl.page.title) : '', s.en ? wikiUrl('en', s.en.page.title) : '',
  ]),
])

// ----------------------------------------------------------------- report
const report = {}
for (const s of sorted) {
  const r = (report[s.sys] ??= { total: 0, namePl: 0, nameLa: 0, wikiPl: 0, wikiEn: 0, def: 0, facts: 0, factsPl: 0, plSentences: 0, attachments: 0 })
  r.total++
  if (s.names?.pl) r.namePl++
  if (s.names?.la) r.nameLa++
  if (s.pl) r.wikiPl++
  if (s.en) r.wikiEn++
  if (s.def) r.def++
  if (s.facts?.length) r.facts++
  if (s.facts?.some((f) => f.pl)) r.factsPl++
  if (s.plFacts) r.plSentences++
  if (s.att || s.boneAtt) r.attachments++
}
console.table(report)
log(`index.json: ${(JSON.stringify(index).length / 1024).toFixed(0)} KB, details: ${(detailBytes / 1e6).toFixed(2)} MB in ${DETAIL_CHUNKS} shards`)
log(`network requests this run: ${stats().networkRequests}`)
