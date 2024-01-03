import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [],
    build: {
      lib: {
        entry: 'src/main.ts',
        name: 'main',
        fileName: () => 'main.js',
        formats: ['cjs' as const],
      },
      minify: false,
      outDir: '.',
      rollupOptions: {
        output: {
          exports: 'named' as const,
        },
        external: ['obsidian', 'electron'],
      },
    },
  };
});
