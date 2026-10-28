import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` must match the GitHub Pages sub-path (the repo name).
// If you deploy to https://USERNAME.github.io/humaniek/ keep "/humaniek/".
export default defineConfig({
  base: '/humaniek/',
  plugins: [react(), tailwindcss()],
  build: {
    // three.js + React Three Fiber change far less often than the app code,
    // so keep them in their own long-cached chunk.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-mesh-bvh', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
