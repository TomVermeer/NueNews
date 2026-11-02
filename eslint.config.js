import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
    },
  },
  {
    // Inferred return types are the point here: Hono route builders feed the typed client,
    // and composables and query hooks return what Vue and TanStack Query build.
    files: [
      'apps/api/src/app.ts',
      'apps/api/src/web.ts',
      'apps/api/src/routes/**/*.ts',
      'apps/web/src/composables/**/*.ts',
      'apps/web/src/api/queries.ts',
    ],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    // Test code: loose typing for fakes, and several tiny components per file are fine.
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'vue/one-component-per-file': 'off',
    },
  },
  prettier,
)
