/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves project pages at https://<owner>.github.io/<repo>/,
// so asset URLs need that repo-name prefix when built for Pages. Local dev
// and other deployment targets keep the default root base.
const base = process.env.GH_PAGES === 'true' ? '/ui-ux-pro-max-skill/' : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/domain/**/*.test.ts'],
  },
})
