#!/usr/bin/env node
// Turns the raw Z-Anatomy export (scripts/sources/model-source.glb) into the
// web model (public/model.glb):
//
//  1. tags every mesh node with extras { sid, side, sys, mk, on } so the app
//     never has to parse names or material names at runtime
//  2. removes the three baked KHR_lights_punctual lights (thousands of lux,
//     they blow the scene out to white), empty label anchors and strays
//  3. flattens the hierarchy, so attachment markers no longer inherit the
//     visibility of the bone they sit on
//  4. replaces the exported materials (white base colour, emissive 1, half
//     metallic bones, KHR_materials_* leftovers) with scripts/model-style.mjs
//  5. drops unused UVs, welds and simplifies with an absolute error budget,
//     then compresses (Draco by default, --meshopt for EXT_meshopt_compression)
//
// Usage: node scripts/optimize-model.mjs [--error=0.00015] [--meshopt] [--in=...] [--out=...]
import { statSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, flatten, getBounds, meshopt, prune, quantize, reorder, simplifyPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import { parseMeshName, structureId } from '../src/lib/names.js'
import { systemFor } from '../src/lib/layers.js'
import { styleFor } from './model-style.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const SRC = args.in || 'scripts/sources/model-source.glb'
const OUT = args.out || 'public/model.glb'
// Max geometric deviation allowed by the simplifier, in metres (model units).
const ABS_ERROR = Number(args.error ?? 0.00015)
const MIN_REL_ERROR = 0.0004
const MAX_REL_ERROR = 0.01

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})

function report(doc, label) {
  const root = doc.getRoot()
  let verts = 0
  let tris = 0
  let renderedTris = 0
  let draws = 0
  const meshTris = new Map()
  for (const mesh of root.listMeshes()) {
    let t = 0
    for (const p of mesh.listPrimitives()) {
      verts += p.getAttribute('POSITION').getCount()
      t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
    }
    meshTris.set(mesh, t)
    tris += t
  }
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    draws += mesh.listPrimitives().length
    renderedTris += meshTris.get(mesh)
  }
  console.log(
    `${label.padEnd(12)} nodes ${root.listNodes().length}, meshes ${root.listMeshes().length}, materials ${root.listMaterials().length}, ` +
      `draw calls ${draws}, vertices ${(verts / 1e6).toFixed(2)}M, triangles ${(tris / 1e6).toFixed(2)}M (rendered ${(renderedTris / 1e6).toFixed(2)}M)`,
  )
}

const t0 = Date.now()
const doc = await io.read(SRC)
const root = doc.getRoot()
report(doc, 'source')

// 1. Tag nodes while the parent (bone) of every marker is still known.
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const p = parseMeshName(node.getName())
  const mats = mesh.listPrimitives().map((prim) => prim.getMaterial()?.getName() || '')
  const extras = { sid: structureId(p.base), sys: systemFor(mats, p.base) }
  if (p.side) extras.side = p.side
  if (p.marker) {
    extras.mk = p.marker === 'origin' ? 'o' : 'e'
    const parent = node.getParentNode()
    if (parent) extras.on = structureId(parseMeshName(parent.getName()).base)
  }
  node.setExtras({ ...node.getExtras(), ...extras })
}

// 2. Baked lights.
for (const node of root.listNodes()) if (node.getExtension('KHR_lights_punctual')) node.dispose()
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_lights_punctual') ext.dispose()

// 3. Flatten, then drop strays that sit far away from the body (they break
//    camera framing) and every now-empty node.
await doc.transform(flatten())
const centers = []
for (const node of root.listNodes()) {
  if (!node.getMesh()) continue
  const { min, max } = getBounds(node)
  centers.push({ node, c: min.map((v, i) => (v + max[i]) / 2), size: Math.max(...max.map((v, i) => v - min[i])) })
}
const median = [0, 1, 2].map((i) => centers.map((x) => x.c[i]).sort((a, b) => a - b)[centers.length >> 1])
for (const { node, c, size } of centers) {
  const dist = Math.hypot(c[0] - median[0], c[1] - median[1], c[2] - median[2])
  if (dist > 1.6 || size > 3) {
    console.log(`  removing stray node "${node.getName()}" (${dist.toFixed(2)} m from the body, ${size.toFixed(2)} m wide)`)
    node.dispose()
  }
}

// 4. Materials: one shared material per palette entry.
const styled = new Map()
for (const mesh of root.listMeshes()) {
  const owner = mesh.listParents().find((p) => p.propertyType === 'Node')
  const base = owner ? parseMeshName(owner.getName()).base : mesh.getName()
  for (const prim of mesh.listPrimitives()) {
    const original = prim.getMaterial()?.getName() || ''
    const style = styleFor(base, original)
    let mat = styled.get(style.key)
    if (!mat) {
      mat = doc
        .createMaterial(original || 'default')
        .setBaseColorFactor(style.baseColor)
        .setMetallicFactor(0)
        .setRoughnessFactor(style.roughness)
        .setEmissiveFactor([0, 0, 0])
        .setDoubleSided(true)
      if (style.opacity < 1) mat.setAlphaMode('BLEND')
      styled.set(style.key, mat)
    }
    prim.setMaterial(mat)
  }
}
await doc.transform(prune({ keepLeaves: false, keepAttributes: false, keepExtras: true }))
for (const ext of root.listExtensionsUsed()) if (ext.extensionName.startsWith('KHR_materials_')) ext.dispose()
report(doc, 'cleaned')

// 5. Geometry. Simplify against an absolute budget: the per-mesh relative
//    error is ABS_ERROR / world radius, clamped so tiny parts (ear ossicles)
//    keep their shape and huge sheets are not over-simplified.
await doc.transform(weld())
for (const mesh of root.listMeshes()) {
  const owner = mesh.listParents().find((p) => p.propertyType === 'Node')
  const m = owner ? owner.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
  const scale = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]))
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const min = pos.getMin([])
    const max = pos.getMax([])
    const radius = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * scale
    if (!(radius > 0)) continue
    const error = Math.min(MAX_REL_ERROR, Math.max(MIN_REL_ERROR, ABS_ERROR / radius))
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error, lockBorder: true })
  }
}
await doc.transform(dedup(), prune({ keepLeaves: false, keepAttributes: false, keepExtras: true }))
report(doc, 'simplified')

if (args.meshopt) {
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose()
  await doc.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ quantizePosition: 14, quantizeNormal: 10 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
} else {
  await doc.transform(
    draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, encodeSpeed: 5, decodeSpeed: 5 }),
  )
}
root.getAsset().generator = 'Humaniek scripts/optimize-model.mjs (glTF-Transform)'
await io.write(OUT, doc)
console.log(`wrote ${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB (source ${(statSync(SRC).size / 1e6).toFixed(2)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
