import type { Config } from 'tailwindcss';
import { baseTailwindConfig } from '../../packages/tailwind-config/tailwind.config';

const config: Config = {
  ...baseTailwindConfig,
  content: ['app/**/*.{ts,tsx}', '../../components/**/*.{ts,tsx}']
};

export default config;
