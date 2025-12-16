import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/GHPageTemplate/",

  // does not work D:
  resolve: {
    alias: {
      '@Components': resolve(__dirname, 'src/Components')
    }
  }
})
