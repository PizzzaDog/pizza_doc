import * as path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import cliPackage from '../cli/package.json'

export default defineConfig({
  plugins: [react()],
  define: {
    __PIZZA_DOC_VERSION__: JSON.stringify(cliPackage.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('@monaco-editor/react') || id.includes('monaco-editor')) {
            return 'editor-vendor'
          }
          if (id.includes('@tanstack/react-router')) {
            return 'router-vendor'
          }
          if (id.includes('lucide-react')) {
            return 'icons-vendor'
          }
          if (id.includes('/yaml/')) {
            return 'yaml-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
