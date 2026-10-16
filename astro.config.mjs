// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // The sound worklet is loaded with audioWorklet.addModule(), which expects an ES module.
    worker: { format: 'es' }
  }
});