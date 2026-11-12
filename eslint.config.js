import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**', '.e2e-data/**', '.load-data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['daemon/**/*.ts', 'e2e/**/*.ts', 'scripts/**', 'bin/**', '*.config.{js,ts}', 'web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // The import boundary: the web app talks to the daemon only through the
    // wire protocol in shared/. It may never import daemon code.
    files: ['web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aubergine/daemon', '@aubergine/daemon/**', '**/daemon', '**/daemon/**'],
              message: 'web/ may import shared/ but never daemon/.',
            },
            {
              group: ['node:*', 'fastify', 'node-pty'],
              message: 'web/ runs in the browser.',
            },
          ],
        },
      ],
    },
  },
  {
    // shared/ is the bottom layer: it imports neither of the others.
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aubergine/*', '**/daemon/**', '**/web/**', 'node:*'],
              message: 'shared/ must stay free of daemon, web and Node-only code.',
            },
          ],
        },
      ],
    },
  },
);
