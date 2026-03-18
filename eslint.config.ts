import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json']
      },
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': 'off',
      'indent': 'off',
      '@typescript-eslint/indent': ['error', 2],
      'quotes': 'off',
      '@typescript-eslint/quotes': ['error', 'single', { avoidEscape: true }],
      'semi': 'off',
      '@typescript-eslint/semi': ['error', 'always'],
      'comma-dangle': 'off',
      '@typescript-eslint/comma-dangle': ['error', 'never'],
      'object-curly-spacing': 'off',
      '@typescript-eslint/object-curly-spacing': ['error', 'never'],
      'space-before-function-paren': 'off',
      '@typescript-eslint/space-before-function-paren': ['error', 'never']
    }
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    ignores: [
      'dist/',
      'types/',
      'node_modules/',
      'coverage/',
      '*.js',
      '*.jsx'
    ]
  }
);
