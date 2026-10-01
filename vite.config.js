import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: './',
  plugins: [glsl()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
