import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['node_modules/**', '**/build/**', '**/.react-router/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'packages/api-client/src/generated.ts', 'docs/parity/**', '.scratch/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
