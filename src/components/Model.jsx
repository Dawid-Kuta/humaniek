import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree

// Built by scripts/optimize-model.mjs. VITE_MODEL_URL can point elsewhere
// (e.g. a GitHub Release asset) at build time.
const MODEL_URL = import.meta.env.VITE_MODEL_URL || `${import.meta.env.BASE_URL}model.glb`
const DRACO_URL = `${import.meta.env.BASE_URL}draco/`

/** Set by the camera controls while the user drags, to skip hover picking. */
export const pickState = { suspended: false }

const HIGHLIGHT = {
  select: { color: '#22d3ee', intensity: 0.55 },
  search: { color: '#f59e0b', intensity: 0.5 },
  related: { color: '#a78bfa', intensity: 0.45 },
  hover: { color: '#ffffff', intensity: 0.16 },
}
const PRIORITY = { select: 5, search: 4, related: 3, hover: 2, ghost: 1 }
const GHOST_OPACITY = 0.045

const isVisibleChain = (obj) => {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

const _sphere = new THREE.Sphere()

// BVHs are built lazily, the first time a ray actually reaches a mesh's
// bounding sphere (plus in idle time after load), so the 1.1 M triangles do
// not block startup. Hidden meshes never take part in picking.
function lazyBvhRaycast(raycaster, intersects) {
  if (pickState.suspended || this.userData.ghost || !isVisibleChain(this)) return
  const geometry = this.geometry
  if (!geometry.boundsTree) {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere()
    _sphere.copy(geometry.boundingSphere).applyMatrix4(this.matrixWorld)
    if (!raycaster.ray.intersectsSphere(_sphere)) return
    geometry.computeBoundsTree()
  }
  acceleratedRaycast.call(this, raycaster, intersects)
}

export const nodeOf = (obj) => (obj.userData.sid !== undefined ? obj : obj.parent)

function buildRegistry(scene) {
  const entries = []
  const bySid = new Map()
  scene.traverse((obj) => {
    if (obj.userData.sid === undefined || obj === scene) return
    const meshes = []
    obj.traverse((m) => m.isMesh && meshes.push(m))
    if (!meshes.length) return
    const { sid, side = null, sys, mk = null, on = null } = obj.userData
    const entry = { obj, sid, side, sys, mk, on, meshes }
    entries.push(entry)
    if (!bySid.has(sid)) bySid.set(sid, [])
    bySid.get(sid).push(entry)
  })

  const counts = {}
  for (const e of entries) {
    counts[e.sys] = (counts[e.sys] || 0) + 1
    for (const mesh of e.meshes) {
      mesh.raycast = lazyBvhRaycast
      mesh.userData.baseMaterial ??= mesh.material
      const mat = mesh.userData.baseMaterial
      // Attachment footprints are drawn on the bone surface: pull them forward.
      if (e.mk && !mat.polygonOffset) {
        mat.polygonOffset = true
        mat.polygonOffsetFactor = -2
        mat.polygonOffsetUnits = -2
      }
      if (mat.transparent) mat.depthWrite = false
    }
  }

  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    o.matrixAutoUpdate = false
    o.matrixWorldAutoUpdate = false
  })

  const bounds = new THREE.Box3()
  for (const e of entries) if (!e.mk) bounds.expandByObject(e.obj)
  return { entries, bySid, counts, bounds }
}

const highlightCache = new Map()
// `onTop`: in X-ray mode the selection is moved into the transparent pass
// (with a higher renderOrder) so it is drawn after, i.e. over, the ghosts.
function highlightMaterial(base, kind, onTop = false) {
  const key = `${base.uuid}:${kind}:${onTop}`
  let mat = highlightCache.get(key)
  if (!mat) {
    mat = base.clone()
    if (kind === 'ghost') {
      mat.transparent = true
      mat.opacity = Math.min(base.opacity, GHOST_OPACITY)
      mat.depthWrite = false
    } else {
      mat.emissive = new THREE.Color(HIGHLIGHT[kind].color)
      mat.emissiveIntensity = HIGHLIGHT[kind].intensity
      if (onTop) mat.transparent = true
    }
    highlightCache.set(key, mat)
  }
  return mat
}

const sideMatches = (entry, side) => !side || !entry.side || entry.side === side

/**
 * selection / hover: { id, side } of the structure under focus; selectionIds /
 * searchIds: that structure plus all of its parts (see membersOf()).
 */
export default function Model({ selection, selectionIds, hover, searchIds, relatedIds, visibility, hidden, isolatedId, xray, onHover, onSelect, onFocus, onReady }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL)
  const invalidate = useThree((s) => s.invalidate)
  const registry = useMemo(() => buildRegistry(scene), [scene])
  const highlighted = useRef(new Map())
  const hoverKey = useRef(null)

  useEffect(() => {
    onReady?.({
      counts: registry.counts,
      bounds: registry.bounds.clone(),
      boundsFor(ids, side) {
        const box = new THREE.Box3()
        const markers = new THREE.Box3()
        for (const id of ids) {
          for (const e of registry.bySid.get(id) || []) {
            if (!sideMatches(e, side)) continue
            ;(e.mk ? markers : box).expandByObject(e.obj)
          }
        }
        return box.isEmpty() ? markers : box
      },
      /** World-space centres of up to `max` meshes of the given structures. */
      centersFor(ids, side, max = 6) {
        const out = []
        for (const id of ids) {
          for (const e of registry.bySid.get(id) || []) {
            if (e.mk || !sideMatches(e, side) || !e.obj.visible) continue
            out.push(new THREE.Box3().setFromObject(e.obj).getCenter(new THREE.Vector3()))
            if (out.length >= max) return out
          }
        }
        return out
      },
      has: (id) => registry.bySid.has(id),
    })
  }, [registry, onReady])

  // Prebuild the remaining BVHs while the browser is idle.
  useEffect(() => {
    const geometries = [...new Set(registry.entries.flatMap((e) => e.meshes.map((m) => m.geometry)))]
    let i = 0
    let handle = null
    const idle = window.requestIdleCallback
      ? (fn) => window.requestIdleCallback(fn, { timeout: 1000 })
      : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 50)
    const cancel = window.cancelIdleCallback || clearTimeout
    const step = (deadline) => {
      do {
        const g = geometries[i++]
        if (g && !g.boundsTree) g.computeBoundsTree()
      } while (i < geometries.length && deadline.timeRemaining() > 4)
      if (i < geometries.length) handle = idle(step)
    }
    handle = idle(step)
    return () => cancel(handle)
  }, [registry])

  // Layer toggles, per-structure hiding and "show only this". Attachment
  // footprints of the selection (a muscle's own, or those on a selected bone)
  // are shown even when the attachment layer is off.
  useEffect(() => {
    const selected = selectionIds || new Set()
    for (const e of registry.entries) {
      const footprint = !!e.mk && (selected.has(e.sid) || selected.has(e.on))
      let visible
      if (isolatedId) visible = selected.has(e.sid) || footprint
      else visible = (visibility[e.sys] !== false || footprint) && !hidden.has(e.sid)
      e.obj.visible = visible
    }
    invalidate()
  }, [registry, visibility, hidden, isolatedId, selectionIds, invalidate])

  // Highlights: swap in emissive copies of the shared materials.
  useEffect(() => {
    const next = new Map()
    const mark = (entry, kind) => {
      for (const mesh of entry.meshes) {
        const prev = next.get(mesh)
        if (!prev || PRIORITY[kind] > PRIORITY[prev]) next.set(mesh, kind)
      }
    }
    const ghosting = xray && selectionIds?.size
    for (const e of registry.entries) {
      // Footprints keep their origin (red) / insertion (blue) colour.
      if (e.mk) continue
      const selected = selectionIds?.has(e.sid) && sideMatches(e, selection?.side)
      if (selected) mark(e, 'select')
      else if (searchIds?.has(e.sid)) mark(e, 'search')
      else if (relatedIds?.has(e.sid)) mark(e, 'related')
      else if (ghosting) mark(e, 'ghost')
      else if (hover && e.sid === hover.id && sideMatches(e, hover.side)) mark(e, 'hover')
    }
    for (const [mesh] of highlighted.current) {
      if (next.has(mesh)) continue
      mesh.material = mesh.userData.baseMaterial
      mesh.userData.ghost = false
      mesh.renderOrder = 0
    }
    for (const [mesh, kind] of next) {
      const onTop = !!ghosting && kind !== 'ghost'
      mesh.material = highlightMaterial(mesh.userData.baseMaterial, kind, onTop)
      mesh.renderOrder = onTop ? 10 : 0
      // X-rayed structures must not steal clicks from the selection behind them.
      mesh.userData.ghost = kind === 'ghost'
    }
    highlighted.current = next
    invalidate()
  }, [registry, selection, selectionIds, hover, searchIds, relatedIds, xray, invalidate])

  const entryOf = (hit) => {
    const node = hit && nodeOf(hit.object)
    if (!node) return null
    const { sid, side = null, mk = null, on = null } = node.userData
    return sid ? { id: sid, side, mk, on } : null
  }

  const handleMove = (e) => {
    e.stopPropagation()
    const hit = entryOf(e.intersections[0])
    const key = hit ? `${hit.id}|${hit.side}|${hit.mk}` : null
    if (key === hoverKey.current) return
    hoverKey.current = key
    document.body.style.cursor = hit ? 'pointer' : 'auto'
    onHover?.(hit)
  }

  const handleOut = () => {
    hoverKey.current = null
    document.body.style.cursor = 'auto'
    onHover?.(null)
  }

  const handleClick = (e) => {
    e.stopPropagation()
    const hit = entryOf(e.intersections[0])
    if (hit) onSelect(hit)
  }

  const handleDoubleClick = (e) => {
    e.stopPropagation()
    const hit = entryOf(e.intersections[0])
    if (hit) onFocus?.(hit)
  }

  return (
    <primitive
      object={scene}
      onPointerMove={handleMove}
      onPointerOut={handleOut}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    />
  )
}

useGLTF.preload(MODEL_URL, DRACO_URL)
