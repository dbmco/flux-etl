import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

// Base Tailwind config shared by all UI apps in the monorepo
export const baseTailwindConfig: Config = {
  // Each app should extend/override `content` for its own file locations
  content: [],
  theme: {
    extend: {}
  },
  plugins: [forms]
};
