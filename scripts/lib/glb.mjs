import { readFileSync } from 'node:fs'

/** Read only the JSON chunk of a .glb (no Draco decoding needed). */
export function readGlbJson(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB file`)
  let offset = 12
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset)
    const type = buf.readUInt32LE(offset + 4)
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(offset + 8, offset + 8 + len).toString('utf8'))
    offset += 8 + len
  }
  throw new Error(`${path} has no JSON chunk`)
}

/** Material names of a glTF node's mesh primitives. */
export function nodeMaterialNames(json, node) {
  if (node.mesh == null) return []
  return json.meshes[node.mesh].primitives.map((p) => (p.material == null ? '' : json.materials[p.material]?.name || ''))
}
