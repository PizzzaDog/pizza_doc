import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@pizza-doc/cli',
    root: __dirname,
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
