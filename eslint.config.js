import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', 'scripts/*.js'],
        },
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '**/*.d.ts'],
  }
);
