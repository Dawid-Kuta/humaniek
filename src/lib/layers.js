// Anatomical systems shown in the layer panel. Each mesh is classified by its
// original Z-Anatomy MATERIAL name ("Bone-3", "Artery", "Nerve-2",
// "Origin-Flexion", ...). The build scripts bake the result into every glTF
// node as `extras.sys`, so at runtime the app only reads `userData.sys`.
export const SYSTEMS = [
  { id: 'skeletal', label: 'Układ kostny', en: 'Skeletal system', color: '#e9dfc9' },
  { id: 'muscular', label: 'Układ mięśniowy', en: 'Muscular system', color: '#b4483c' },
  { id: 'fascia', label: 'Powięzie', en: 'Fasciae', color: '#dcc8af' },
  { id: 'insertions', label: 'Przyczepy mięśni', en: 'Muscle attachments', color: '#e8743b' },
  { id: 'joints', label: 'Stawy i więzadła', en: 'Joints & ligaments', color: '#d2c9a6' },
  { id: 'cardiovascular', label: 'Układ krążenia i chłonny', en: 'Cardiovascular & lymphatic', color: '#c8302a' },
  { id: 'nervous', label: 'Układ nerwowy i zmysły', en: 'Nervous system & senses', color: '#f0c24b' },
  { id: 'visceral', label: 'Narządy wewnętrzne', en: 'Visceral systems', color: '#d98a7c' },
]

export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((s) => [s.id, s]))

// Fasciae wrap whole limbs and attachment footprints sit on the bones, so both
// start hidden: the default view shows bones, muscles, vessels, nerves, organs.
export const DEFAULT_VISIBILITY = SYSTEMS.reduce((acc, s) => {
  acc[s.id] = s.id !== 'insertions' && s.id !== 'fascia'
  return acc
}, {})

// Muscle bodies: Z-Anatomy colours them by movement/function, not "muscle".
const MUSCLE_MATERIALS = new Set([
  'internal rotator', 'external rotation', 'flexion', 'extension', 'tendon',
  'orbicularis/constrictor', 'depressor', 'levator', 'phonation', 'ingestion',
  'abductor', 'biarticular', 'masticator', 'adductor', 'superficial',
  'extensor extremities', 'extension hand/foot', 'flexion hand/foot',
  'flexion fingers', 'trapezius', 'diaphragm',
])

/**
 * Map a Z-Anatomy material name to a system id, or null if unknown. Order
 * matters: "Origin-*"/"End-*" (attachment footprints) must win before the
 * bone/muscle rules.
 */
export function systemForMaterial(rawName) {
  const n = (rawName || '').toLowerCase().trim()
  if (!n) return null

  if (n.startsWith('origin') || n.startsWith('end-') || n.startsWith('end ') || n === 'muscular origin') {
    return 'insertions'
  }
  if (n.startsWith('bone') || n === 'cartilage' || n.startsWith('teeth') || n === 'dentine') {
    return 'skeletal'
  }
  if (n.startsWith('suture') || n === 'ligament' || n === 'articular capsule' || n === 'bursa' || n === 'fat') {
    return 'joints'
  }
  if (n.includes('artery') || n.includes('vein') || n.startsWith('lymph')) {
    return 'cardiovascular'
  }
  if (
    n.startsWith('nerve') || n.startsWith('brain') || n.startsWith('nucleus') ||
    n === 'white matter' || n === 'cerebellum' || n === 'insula' || n.includes('lobe') ||
    n === 'interlobar sulci' || n === 'lcr' || n === 'eye' || n === 'cornea' || n === 'iris'
  ) {
    return 'nervous'
  }
  if (
    n.startsWith('organ') || n === 'gland' || n === 'intestine' || n === 'gallbladder' ||
    n === 'peritoneum' || n === 'mucosa' || n === 'ductus' || n.startsWith('lung') ||
    n.startsWith('bronchi')
  ) {
    return 'visceral'
  }
  if (n === 'fascia') return 'fascia'
  if (MUSCLE_MATERIALS.has(n)) return 'muscular'
  return null
}

// Heart chambers use a skeletal-muscle material in Z-Anatomy, heart valve
// leaflets a cartilage / ligament one.
const HEART_RE = /\b(atrium|ventricle)\b|papillary muscle of (left|right) ventricle|septal papillary|auricle of (left|right)/i
const VALVE_RE = /\b(leaflet|cusp)\b|\bvalve\b/i
const NOT_HEART_RE = /fourth|third|lateral ventricle|ventricle of larynx/i
export const isHeartPart = (base) => HEART_RE.test(base || '') && !NOT_HEART_RE.test(base || '')

/** System of a mesh from its primitives' material names and structure name. */
export function systemFor(materialNames, base) {
  let sys = null
  for (const m of materialNames) if ((sys = systemForMaterial(m))) break
  sys ||= systemForName(base)
  if (sys === 'muscular' && isHeartPart(base)) sys = 'cardiovascular'
  if ((sys === 'skeletal' || sys === 'joints') && VALVE_RE.test(base || '')) sys = 'cardiovascular'
  return sys
}

/** Fallback for the few meshes exported without a usable material. */
export function systemForName(base) {
  const n = (base || '').toLowerCase()
  if (/bone|cells of ethmoid|vertebra|rib\b|cartilage|tooth|incisor|molar|canine/.test(n)) return 'skeletal'
  if (/matter|medulla|nerve|gyrus|sulcus|nucleus|brain|cerebr/.test(n)) return 'nervous'
  if (/artery|vein|node|lymph/.test(n)) return 'cardiovascular'
  if (/ligament|bursa|capsule|fat pad|sheath/.test(n)) return 'joints'
  if (/muscle|tendon|fascia|aponeurosis/.test(n)) return 'muscular'
  return 'visceral'
}
