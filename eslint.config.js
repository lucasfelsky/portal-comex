import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Função para rebaixar todas as regras de 'error' para 'warn'
const downgradeToWarn = (rules) => {
  return Object.fromEntries(
    Object.entries(rules).map(([key, value]) => {
      if (value === 'error' || value === 2) return [key, 'warn'];
      if (Array.isArray(value) && (value[0] === 'error' || value[0] === 2)) {
        return [key, ['warn', ...value.slice(1)]];
      }
      return [key, value];
    })
  );
};

export default [
  // Ignorar pastas de build e dependências
  {
    ignores: [
      'dist',
      'node_modules',
      'functions/node_modules',
      '.gemini',
      'playwright-report',
      'test-results',
      'coverage',
      'eslint.config.js',
      'vite.config.js',
      'vitest.config.js',
      'playwright.config.js'
    ],
  },
  
  // BLOCO FRONTEND (React)
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx,mjs}'],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.2' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...downgradeToWarn(js.configs.recommended.rules),
      ...downgradeToWarn(react.configs.recommended.rules),
      ...downgradeToWarn(react.configs['jsx-runtime'].rules),
      ...downgradeToWarn(reactHooks.configs.recommended.rules),
      
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  
  // BLOCO BACKEND (Node / Cloud Functions / Scripts)
  {
    files: ['functions/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', 'scripts/**/*.cjs'],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: {
      ...downgradeToWarn(js.configs.recommended.rules),
    },
  },
];
