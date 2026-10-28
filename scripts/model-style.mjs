// Anatomical colour palette baked into public/model.glb by optimize-model.mjs.
// Colours are sRGB hex; roughness is PBR roughness (metalness is always 0).
// Rules are matched in order against the structure name first, then against
// the original Z-Anatomy material name.

const NAME_RULES = [
  [/segment of liver|^liver$|caudate lobe|quadrate lobe/i, { color: '#8a3b2e', roughness: 0.45 }],
  [/^spleen$/i, { color: '#7a3448', roughness: 0.45 }],
  [/^kidney$/i, { color: '#97412f', roughness: 0.45 }],
  [/urinary bladder/i, { color: '#d9ab8f', roughness: 0.5 }],
  [/\b(atrium|ventricle)\b|papillary muscle|auricle of/i, { color: '#a5372f', roughness: 0.45, onlyMaterials: /trapezius|organ|flexion|extension/i }],
  [/^stomach$/i, { color: '#d6958a', roughness: 0.5 }],
  [/pancrea/i, { color: '#e3b685', roughness: 0.55 }],
  [/thymus/i, { color: '#e2bba6', roughness: 0.55 }],
  [/thyroid gland|parathyroid/i, { color: '#b8584a', roughness: 0.5 }],
  [/parotid gland|submandibular gland|sublingual gland|lacrimal gland/i, { color: '#e6c084', roughness: 0.6 }],
  [/ duct$|^ductus|ureter|urethra|ejaculatory/i, { color: '#dccf9e', roughness: 0.45 }],
  [/^tongue$/i, { color: '#c76b6b', roughness: 0.6 }],
  [/gingiva/i, { color: '#de8f8f', roughness: 0.55 }],
  [/^sclera$|segment of eyeball/i, { color: '#f3f1ec', roughness: 0.3 }],
  [/^lens$/i, { color: '#e7f1f7', roughness: 0.1, opacity: 0.55 }],
  [/vitreous body|anterior chamber of eyeball/i, { color: '#e4f0f6', roughness: 0.1, opacity: 0.18 }],
  [/^cornea$/i, { color: '#dff0f8', roughness: 0.05, opacity: 0.3 }],
  [/^retina$/i, { color: '#c4554b', roughness: 0.5 }],
  [/^iris$/i, { color: '#6c4a32', roughness: 0.5 }],
  [/infrapatellar fat pad/i, { color: '#efd27f', roughness: 0.55 }],
  [/grey matter|gray matter/i, { color: '#b9a39b', roughness: 0.6 }],
]

const MATERIAL_RULES = [
  [/^origin|^muscular origin/i, { color: '#e2583e', roughness: 0.5 }],
  [/^end[- ]/i, { color: '#3d7fe0', roughness: 0.5 }],
  [/^bone/i, { color: '#e7dbc1', roughness: 0.62, jitter: 0.035 }],
  [/^cartilage$/i, { color: '#c7dce2', roughness: 0.35 }],
  [/^teeth-roots$/i, { color: '#e3d5b4', roughness: 0.4 }],
  [/^teeth$/i, { color: '#f4f0e6', roughness: 0.22 }],
  [/^dentine$/i, { color: '#efe4c6', roughness: 0.35 }],
  [/^suture/i, { color: '#cdbb97', roughness: 0.65 }],
  [/^ligament$/i, { color: '#d8d1b1', roughness: 0.45 }],
  [/^articular capsule$/i, { color: '#d3cba9', roughness: 0.45 }],
  [/^bursa$/i, { color: '#a7cbd8', roughness: 0.3 }],
  [/^fat$/i, { color: '#efd27f', roughness: 0.55 }],
  [/^tendon$/i, { color: '#e7e0cd', roughness: 0.35 }],
  [/^fascia$/i, { color: '#dcc8af', roughness: 0.5 }],
  [/^pulmonary artery$/i, { color: '#4b6fc6', roughness: 0.4 }],
  [/^pulmonary vein$/i, { color: '#c43c33', roughness: 0.4 }],
  [/artery/i, { color: '#c8302a', roughness: 0.4 }],
  [/vein/i, { color: '#3a5bb4', roughness: 0.4 }],
  [/^lymph/i, { color: '#7db764', roughness: 0.5, jitter: 0.05 }],
  [/^nerve/i, { color: '#f0c44b', roughness: 0.45, jitter: 0.04 }],
  [/^frontal lobe$/i, { color: '#e6aa9c', roughness: 0.6 }],
  [/^parietal lobe$/i, { color: '#e8c78f', roughness: 0.6 }],
  [/^temporal lobe$/i, { color: '#bccf95', roughness: 0.6 }],
  [/^occipital lobe$/i, { color: '#a9bfe0', roughness: 0.6 }],
  [/^limbic lobe$/i, { color: '#ccb0dc', roughness: 0.6 }],
  [/^insula$/i, { color: '#e6d28c', roughness: 0.6 }],
  [/^cerebellum$/i, { color: '#d99c90', roughness: 0.6 }],
  [/^white matter$/i, { color: '#f0eadb', roughness: 0.55 }],
  [/^interlobar sulci$/i, { color: '#9e7d73', roughness: 0.7 }],
  [/afferent/i, { color: '#6f9bd6', roughness: 0.5 }],
  [/efferent/i, { color: '#d66f6f', roughness: 0.5 }],
  [/^nucleus$/i, { color: '#c98bb0', roughness: 0.5 }],
  [/^brain-inner$/i, { color: '#dcaa9f', roughness: 0.6 }],
  [/^brain$/i, { color: '#dfb0a5', roughness: 0.6 }],
  [/^lcr$/i, { color: '#8fd0e6', roughness: 0.25 }],
  [/^eye$/i, { color: '#f3f1ec', roughness: 0.3 }],
  [/^cornea$/i, { color: '#dff0f8', roughness: 0.05, opacity: 0.3 }],
  [/^iris$/i, { color: '#6c4a32', roughness: 0.5 }],
  [/^organ-\d/i, { color: '#8a3b2e', roughness: 0.45, jitter: 0.06 }],
  [/^organ$/i, { color: '#b65a4e', roughness: 0.45 }],
  [/^gland$/i, { color: '#dba16f', roughness: 0.55 }],
  [/^intestine$/i, { color: '#d9978b', roughness: 0.5 }],
  [/^mucosa$/i, { color: '#d47f7a', roughness: 0.5 }],
  [/^peritoneum$/i, { color: '#e6c6ad', roughness: 0.5, opacity: 0.5 }],
  [/^gallbladder$/i, { color: '#5f8d45', roughness: 0.4 }],
  [/^ductus$/i, { color: '#dccf9e', roughness: 0.45 }],
  [/^lung/i, { color: '#e7a7a5', roughness: 0.55, jitter: 0.05 }],
  [/^bronchi/i, { color: '#dad2bf', roughness: 0.45, jitter: 0.03 }],
  [/^text$/i, { color: '#b9a39b', roughness: 0.6 }],
  // Muscle bodies (Z-Anatomy names them by action): realistic red with a
  // slight per-group variation so neighbouring muscles stay distinguishable.
  [/./, { color: '#ab4239', roughness: 0.52, jitter: 0.045 }],
]

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Lightness jitter in sRGB space, deterministic per key. */
function jitter(rgb, amount, key) {
  if (!amount) return rgb
  const t = ((hash(key) % 1000) / 999) * 2 - 1
  return rgb.map((v) => Math.min(1, Math.max(0, v * (1 + t * amount))))
}

/**
 * Style for a primitive: { baseColor: linear RGBA, roughness, opacity }.
 * `variantKey` (original material name) drives the jitter so "Bone-3" and
 * "Bone-4" differ slightly while staying in the same family.
 */
export function styleFor(structureName, materialName) {
  let style = null
  for (const [re, s] of NAME_RULES) {
    if (!re.test(structureName || '')) continue
    if (s.onlyMaterials && !s.onlyMaterials.test(materialName || '')) continue
    style = s
    break
  }
  if (!style) style = MATERIAL_RULES.find(([re]) => re.test(materialName || ''))?.[1] || { color: '#cccccc', roughness: 0.5 }
  const rgb = jitter(hexToRgb(style.color), style.jitter, materialName || '')
  const opacity = style.opacity ?? 1
  return {
    key: `${style.color}|${style.jitter ? materialName : ''}|${style.roughness}|${opacity}`,
    baseColor: [...rgb.map(srgbToLinear), opacity],
    roughness: style.roughness,
    opacity,
  }
}
