import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

const eslintConfig = defineConfig([
  // Flat-config equivalents of next/core-web-vitals + next/typescript. Loading
  // these *and* the FlatCompat eslintrc versions crashes @eslint/eslintrc's
  // validator on a circular plugin reference.
  ...nextVitals,
  ...nextTs,
  // Registers the prettier plugin, enables prettier/prettier, and turns off
  // the stylistic rules that conflict with it. eslint-config-prettier alone
  // only does the last part, which leaves prettier/prettier unresolvable.
  prettierRecommended,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
