import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { classifyMeshes } from '../lib/layers'

// Local model in public/ for dev; on GitHub Pages the 115 MB file can't live in
// the repo, so set VITE_MODEL_URL (e.g. a GitHub Release asset URL) at build time.
const MODEL_URL = import.meta.env.VITE_MODEL_URL || `${import.meta.env.BASE_URL}model.glb`

const SELECT_COLOR = new THREE.Color('#22d3ee')
const HIGHLIGHT_COLOR = new THREE.Color('#f59e0b')

// True only if the object and all its ancestors are visible.
function isVisibleChain(obj) {
  let o = obj
  while (o) {
    if (o.visible === false) return false
    o = o.parent
  }
  return true
}

/**
 * Renders the GLB model. Each mesh gets a cloned material so we can change its
 * emissive colour independently for selection / search highlighting.
 *
 * - selectedName: mesh name currently shown in the side panel
 * - highlightName: mesh name matched by the search box
 */
export default function Model({ onSelect, selectedName, highlightName, visibility, onSystemsFound }) {
  const { scene } = useGLTF(MODEL_URL, true) // second arg = enable DRACOLoader
  const meshesRef = useRef([])
  const systemNodesRef = useRef({})

  // Clone the scene once and give every mesh its own material instance.
  const root = useMemo(() => {
    const clone = scene.clone(true)
    const meshes = []
    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = Array.isArray(child.material)
          ? child.material.map((m) => m.clone())
          : child.material.clone()
        child.userData.baseEmissive = (Array.isArray(child.material)
          ? child.material[0]
          : child.material
        ).emissive?.clone() ?? new THREE.Color('#000000')
        meshes.push(child)
      }
    })
    meshesRef.current = meshes

    // Group meshes by anatomical system (via material name) for the toggles.
    const systemNodes = classifyMeshes(meshes)
    systemNodesRef.current = systemNodes
    if (import.meta.env.DEV) {
      console.log(
        '[Humaniek] meshes per system:',
        Object.fromEntries(Object.entries(systemNodes).map(([k, v]) => [k, v.length])),
      )
    }
    return clone
  }, [scene])

  // Report which systems actually exist in the model (non-empty buckets).
  useEffect(() => {
    if (!onSystemsFound) return
    const found = {}
    for (const [id, nodes] of Object.entries(systemNodesRef.current)) {
      found[id] = nodes.length > 0
    }
    onSystemsFound(found)
  }, [root, onSystemsFound])

  // Toggle visibility of each system's node groups.
  useEffect(() => {
    if (!visibility) return
    for (const [id, nodes] of Object.entries(systemNodesRef.current)) {
      const visible = visibility[id] !== false
      for (const node of nodes) node.visible = visible
    }
  }, [visibility, root])

  // Apply emissive highlight whenever the selection / search changes.
  useEffect(() => {
    const norm = (s) => (s || '').trim().toLowerCase()
    const sel = norm(selectedName)
    const high = norm(highlightName)

    for (const mesh of meshesRef.current) {
      const name = norm(mesh.name)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      let color = mesh.userData.baseEmissive
      let intensity = 0

      if (sel && name === sel) {
        color = SELECT_COLOR
        intensity = 0.9
      } else if (high && name === high) {
        color = HIGHLIGHT_COLOR
        intensity = 0.8
      }

      for (const m of mats) {
        if (!m.emissive) continue
        m.emissive.copy(color)
        m.emissiveIntensity = intensity
        m.needsUpdate = true
      }
    }
  }, [selectedName, highlightName])

  // three.js r169 raycaster no longer skips invisible objects, so a hidden
  // layer would still capture clicks. Pick the nearest *visible* hit instead.
  const firstVisibleHit = (e) => {
    const hits = e.intersections?.length ? e.intersections : e.object ? [e] : []
    return hits.find((i) => isVisibleChain(i.object)) || null
  }

  const handleClick = (e) => {
    e.stopPropagation()
    const hit = firstVisibleHit(e)
    if (hit?.object?.name) onSelect(hit.object.name)
  }

  const handlePointerOver = (e) => {
    e.stopPropagation()
    if (firstVisibleHit(e)) document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto'
  }

  return (
    <primitive
      object={root}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  )
}

useGLTF.preload(MODEL_URL, true)
