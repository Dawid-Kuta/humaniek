// Quick GLB node-hierarchy inspector. Reads only the JSON chunk (no Draco
// decode needed) and prints the scene's node tree + top-level node names.
import { readFileSync } from 'node:fs'

const path = process.argv[2] || 'public/model.glb'
const buf = readFileSync(path)

// GLB header: magic(4) version(4) length(4), then chunks: length(4) type(4) data
const magic = buf.readUInt32LE(0)
if (magic !== 0x46546c67) throw new Error('Not a GLB file')

let offset = 12
let json = null
while (offset < buf.length) {
  const chunkLen = buf.readUInt32LE(offset)
  const chunkType = buf.readUInt32LE(offset + 4)
  const data = buf.subarray(offset + 8, offset + 8 + chunkLen)
  if (chunkType === 0x4e4f534a) {
    json = JSON.parse(new TextDecoder().decode(data))
    break
  }
  offset += 8 + chunkLen
}

const nodes = json.nodes || []
const scenes = json.scenes || []
const roots = scenes[json.scene ?? 0]?.nodes ?? []

console.log('\n=== TOP-LEVEL NODES ===')
for (const i of roots) console.log('-', JSON.stringify(nodes[i]?.name))

console.log('\n=== FIRST 2 LEVELS ===')
const printTree = (i, depth) => {
  const n = nodes[i]
  if (!n) return
  console.log('  '.repeat(depth) + (n.name ?? '(unnamed)'))
  if (depth < 1 && n.children) for (const c of n.children) printTree(c, depth + 1)
}
for (const i of roots) printTree(i, 0)

console.log('\nTotal nodes:', nodes.length)

// --- classification probe ---
const RULES = [
  ['insertions', (n) => n.startsWith('(') || /\.(ol|or|il|ir)$/.test(n) || /insertion|origin of/.test(n)],
  ['joints', (n) => /joint|articular|ligament|meniscus|labrum|capsule|synovial|interosseous membrane|fontanelle|suture|symphysis/.test(n)],
  ['cardiovascular', (n) => /artery|arteries|arterial|vein|venous| vena|aorta|ventricle|atrium|atrial|heart|cardiac|pulmonary trunk|capillary|sinus of|vascular/.test(n)],
  ['nervous', (n) => /nerve|nervous|ganglion|plexus|brain|cereb|spinal cord|medulla|\bpons\b|cortex|gyrus|sulcus|nucleus|optic|olfactory|retina|cochlea|eyeball|\beye\b|\bear\b|tympan|labyrinth/.test(n)],
  ['visceral', (n) => /lung|pulmonary|liver|hepatic|stomach|gastric|intestine|kidney|renal|bladder|spleen|pancrea|trachea|bronch|esophag|oesophag|colon|rectum|duoden|jejun|ileum|gland|thyroid|uterus|ovary|testis|prostate|larynx|pharynx|tonsil|gallbladder|thymus|diaphragm/.test(n)],
  ['muscular', (n) => /muscle|musculus|tendon|aponeurosis|fascia/.test(n)],
  ['skeletal', (n) => /bone|phalanx|phalanges|vertebra|\brib\b|ribs|metatarsal|metacarpal|carpal|tarsal|femur|tibia|fibula|humerus|radius|ulna|scapula|clavicle|sternum|skull|crani|mandible|maxilla|sacrum|coccyx|patella|ilium|ischium|pubis|calcaneus|talus|hyoid|incus|malleus|stapes|sesamoid|occipital|parietal|temporal|frontal|sphenoid|ethmoid|zygomatic|nasal|lacrimal|palatine|vomer|cuneiform|cuboid|navicular|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|atlas|axis|acetabulum|condyle|process|tubercle|tuberosity|crest|fossa|foramen|epicondyle|malleolus|trochanter/.test(n)],
]
const classify = (raw) => {
  const n = raw.toLowerCase().trim()
  for (const [id, fn] of RULES) if (fn(n)) return id
  return 'UNCLASSIFIED'
}
const counts = {}
const examples = {}
for (const n of nodes) {
  const name = n.name || ''
  const id = classify(name)
  counts[id] = (counts[id] || 0) + 1
  if (id === 'UNCLASSIFIED' && (examples.un ??= []).length < 30) examples.un.push(name)
}
console.log('\n=== CLASSIFICATION COUNTS ===')
console.log(counts)
console.log('\n=== UNCLASSIFIED EXAMPLES ===')
console.log(examples.un)

// --- materials probe ---
const materials = json.materials || []
console.log('\n=== MATERIALS (', materials.length, ') ===')
console.log(materials.map((m, i) => `${i}: ${m.name}`).join('\n'))

// histogram: how many mesh-primitives use each material
const meshes2 = json.meshes || []
const matUse = {}
for (const n of nodes) {
  if (n.mesh == null) continue
  const prims = meshes2[n.mesh]?.primitives || []
  for (const p of prims) {
    const mi = p.material
    const mname = mi == null ? '(none)' : materials[mi]?.name ?? `#${mi}`
    matUse[mname] = (matUse[mname] || 0) + 1
  }
}
console.log('\n=== MATERIAL USAGE (node count) ===')
console.log(matUse)

// --- material -> system classification probe ---
const MUSCLE = new Set([
  'internal rotator', 'external rotation', 'flexion', 'extension', 'tendon',
  'orbicularis/constrictor', 'depressor', 'levator', 'phonation', 'ingestion',
  'abductor', 'biarticular', 'masticator', 'adductor', 'superficial',
  'extensor extremities', 'extension hand/foot', 'flexion hand/foot',
  'flexion fingers', 'trapezius', 'diaphragm', 'fascia',
])
const systemForMaterial = (raw) => {
  const n = (raw || '').toLowerCase().trim()
  if (!n) return null
  if (n.startsWith('origin') || n.startsWith('end-') || n.startsWith('end ') || n === 'muscular origin') return 'insertions'
  if (n.startsWith('bone') || n === 'cartilage' || n.startsWith('teeth') || n === 'dentine') return 'skeletal'
  if (n.startsWith('suture') || n === 'ligament' || n === 'articular capsule' || n === 'bursa') return 'joints'
  if (n.includes('artery') || n.includes('vein') || n.startsWith('lymph')) return 'cardiovascular'
  if (n.startsWith('nerve') || n.startsWith('brain') || n.startsWith('nucleus') || n === 'white matter' || n === 'cerebellum' || n === 'insula' || n.includes('lobe') || n === 'interlobar sulci' || n === 'lcr' || n === 'eye' || n === 'cornea' || n === 'iris') return 'nervous'
  if (n.startsWith('organ') || n === 'gland' || n === 'intestine' || n === 'gallbladder' || n === 'peritoneum' || n === 'mucosa' || n === 'ductus' || n.startsWith('lung') || n.startsWith('bronchi')) return 'visceral'
  if (MUSCLE.has(n)) return 'muscular'
  return null
}
const sysCounts = {}
const nullMats = new Set()
for (const n of nodes) {
  if (n.mesh == null) continue
  const prims = meshes2[n.mesh]?.primitives || []
  const mi = prims[0]?.material
  const mname = mi == null ? '' : materials[mi]?.name ?? ''
  const sys = systemForMaterial(mname) || 'NULL'
  sysCounts[sys] = (sysCounts[sys] || 0) + 1
  if (sys === 'NULL') nullMats.add(mname || '(none)')
}
console.log('\n=== SYSTEM COUNTS (by material) ===')
console.log(sysCounts)
console.log('\n=== MATERIALS LEFT UNASSIGNED ===')
console.log([...nullMats])

