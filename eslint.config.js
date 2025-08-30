import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importX from 'eslint-plugin-import-x'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'android/**',
      'ios/**',
      '*.config.{js,ts}',
      'vite.config.ts',
      'vitest.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'src/__tests__/**',
      'src/__mocks__/**',
      'src/test-setup.ts',
      'src/test-utils/**'
    ]
  },
  
  // Base configs
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'import-x': importX
    },
    
    rules: {
      // TypeScript rules
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      
      // React rules
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/jsx-uses-react': 'off', // Not needed with React 17+ JSX transform
      
      // React Hooks
      ...reactHooks.configs.recommended.rules,
      
      // React Refresh
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true }
      ],
      
      // Accessibility rules
      ...jsxA11y.configs.recommended.rules,
      
      // Import rules
      'import-x/no-unresolved': 'error',
      'import-x/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external', 
            'internal',
            'parent',
            'sibling',
            'index'
          ],
          'newlines-between': 'never'
        }
      ]
    },
    
    settings: {
      react: {
        version: 'detect'
      },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json'
        }
      }
    }
  }
]