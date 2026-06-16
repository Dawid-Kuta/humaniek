// Anatomical systems shown in the left-hand layer panel.
//
// The exported model.glb is FLAT (no Blender collection/empty groups survived
// the glTF export), so we cannot group meshes by node hierarchy. Instead each
// mesh is classified by its MATERIAL name, which Z-Anatomy assigns per system
// (e.g. "Bone-3", "Artery", "Nerve-2", "Origin-Flexion", "Lung-base"...).
export const SYSTEMS = [
  { id: 'skeletal', label: 'Skeletal system' },
  { id: 'muscular', label: 'Muscular system' },
  { id: 'insertions', label: 'Muscular insertions' },
  { id: 'joints', label: 'Joints' },
  { id: 'cardiovascular', label: 'Cardiovascular system' },
  { id: 'nervous', label: 'Nervous system & Sense organs' },
  { id: 'visceral', label: 'Visceral systems' },
]

export const DEFAULT_VISIBILITY = SYSTEMS.reduce((acc, s) => {
  acc[s.id] = true
  return acc
}, {})

// Muscle bodies: Z-Anatomy colours them by movement/function, not "muscle".
const MUSCLE_MATERIALS = new Set([
  'internal rotator', 'external rotation', 'flexion', 'extension', 'tendon',
  'orbicularis/constrictor', 'depressor', 'levator', 'phonation', 'ingestion',
  'abductor', 'biarticular', 'masticator', 'adductor', 'superficial',
  'extensor extremities', 'extension hand/foot', 'flexion hand/foot',
  'flexion fingers', 'trapezius', 'diaphragm', 'fascia',
])

/**
 * Map a three.js material name to a system id, or null if it belongs to none
 * of the toggleable systems (skin, nail, fat, text, ...). Order matters:
 * "Origin-*"/"End-*" (attachment footprints) must win before bone/muscle rules.
 */
export function systemForMaterial(rawName) {
  const n = (rawName || '').toLowerCase().trim()
  if (!n) return null

  // Muscular insertions — attachment footprints (origin / end markers).
  if (n.startsWith('origin') || n.startsWith('end-') || n.startsWith('end ') || n === 'muscular origin') {
    return 'insertions'
  }
  // Skeletal — bones, cartilage, teeth.
  if (n.startsWith('bone') || n === 'cartilage' || n.startsWith('teeth') || n === 'dentine') {
    return 'skeletal'
  }
  // Joints — ligaments, capsules, bursae, sutures.
  if (n.startsWith('suture') || n === 'ligament' || n === 'articular capsule' || n === 'bursa') {
    return 'joints'
  }
  // Cardiovascular — arteries, veins, lymphatics.
  if (n.includes('artery') || n.includes('vein') || n.startsWith('lymph')) {
    return 'cardiovascular'
  }
  // Nervous system & sense organs — nerves, brain, eye.
  if (
    n.startsWith('nerve') || n.startsWith('brain') || n.startsWith('nucleus') ||
    n === 'white matter' || n === 'cerebellum' || n === 'insula' || n.includes('lobe') ||
    n === 'interlobar sulci' || n === 'lcr' || n === 'eye' || n === 'cornea' || n === 'iris'
  ) {
    return 'nervous'
  }
  // Visceral — organs, glands, lungs, bronchi, digestive tract.
  if (
    n.startsWith('organ') || n === 'gland' || n === 'intestine' || n === 'gallbladder' ||
    n === 'peritoneum' || n === 'mucosa' || n === 'ductus' || n.startsWith('lung') ||
    n.startsWith('bronchi')
  ) {
    return 'visceral'
  }
  // Muscular system — muscle bodies (named by action).
  if (MUSCLE_MATERIALS.has(n)) return 'muscular'

  return null
}

const materialNamesOf = (mesh) => {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return mats.map((m) => m?.name || '')
}

/**
 * Bucket every mesh in the scene under its system id (via material name).
 * Returns { [systemId]: Mesh[] }. Meshes that match no system are left out
 * (so they stay permanently visible).
 */
export function classifyMeshes(meshes) {
  const result = {}
  for (const s of SYSTEMS) result[s.id] = []
  for (const mesh of meshes) {
    let sys = null
    for (const name of materialNamesOf(mesh)) {
      sys = systemForMaterial(name)
      if (sys) break
    }
    if (sys) result[sys].push(mesh)
  }
  return result
}
