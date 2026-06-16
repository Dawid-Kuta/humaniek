import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` must match the GitHub Pages sub-path (the repo name).
// If you deploy to https://USERNAME.github.io/humaniek/ keep "/humaniek/".
export default defineConfig({
  base: '/humaniek/',
  plugins: [react(), tailwindcss()],
})
