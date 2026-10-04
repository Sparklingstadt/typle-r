import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

// Packages that tie code to the UI, the framework or a storage backend.
const frameworks = ['react', 'react-dom', 'next', 'next/*', 'next-auth', 'next-auth/*', 'next-intl', 'next-intl/*', '@prisma/*', '@sentry/*', 'pg']

export default defineConfig([
  ...nextVitals,
  // core is plain TypeScript: the rules of word lists, typing, records and the workspace, used by every screen and store.
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: frameworks, message: 'src/core must not depend on the UI, the framework or a storage backend.' },
        // The error keys' type comes from the Japanese messages; anything else outside core is off limits.
        { regex: '^(@/(?!messages/)|\\.\\./(?!messages/))', message: 'src/core may only import from src/core.' },
      ] }],
    },
  },
  // A plugin implements a port of core; screens choose plugins, never the other way round.
  {
    files: ['src/plugins/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-dom', 'next', 'next/*', 'next-auth', 'next-auth/*', 'next-intl', 'next-intl/*'], message: 'src/plugins must not depend on the UI.' },
        { regex: '^(@/|(\\.\\./)+)(app|components|i18n|lib)/', message: 'src/plugins may only import from src/core and src/plugins.' },
      ] }],
    },
  },
  globalIgnores(['.next/**', '.next-production/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts']),
])
