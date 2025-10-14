// eslint.config.mjs
import next from 'eslint-config-next'

export default [
  next,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
    },
    ignores: ['.next/**', 'node_modules/**'],
  },
]

