module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    'react',
    'react-hooks',
    '@typescript-eslint',
  ],
  rules: {
    // React rules
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    
    // TypeScript rules
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    
    // General rules
    'no-console': ['warn', { 
      allow: ['warn', 'error'] 
    }], // Warn on console.log, allow console.warn/error
    'no-unused-vars': 'off', // Use TypeScript version instead
    'prefer-const': 'warn',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      // Server-side JavaScript files
      files: ['server/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': ['warn', { 
          allow: ['warn', 'error', 'info', 'debug'] 
        }], // Allow more console methods in server code
      },
    },
    {
      // Test files
      files: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off', // Allow console in tests
      },
    },
  ],
};
