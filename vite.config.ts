import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/photoshop-shk9t2/',
  test: { environment: 'node' },
});
