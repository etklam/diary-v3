import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['node_modules/**', '**/build/**', '**/.react-router/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'packages/api-client/src/generated.ts', 'docs/parity/**', '.scratch/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['apps/web/public/sw.js', 'apps/web/public/sw-update-v2.js'], languageOptions: { globals: { self: 'readonly', caches: 'readonly', clients: 'readonly', URL: 'readonly', fetch: 'readonly', Request: 'readonly', Response: 'readonly' } } },
);
