# StafferFi

Next.js 15 + TypeScript + TailwindCSS + ESLint + Prettier + Storybook + Vitest + Cypress, deployable on Vercel.

## Getting Started

- Install: `npm install`
- Dev: `npm run dev`
- Storybook: `npm run storybook`
- Test: `npm run test`
- E2E: run app with `npm run dev` then `npm run cypress:open` or `npm run cypress`
- Lint: `npm run lint` / Format: `npm run format`
- Build: `npm run build` / Start: `npm start`

## Vercel

- Connect the repo to Vercel.
- Framework preset: Next.js.
- No custom build command needed: `next build`.

## Notes

- Vitest uses jsdom and RTL.
- Storybook runs with Vite builder and uses Tailwind styles from `app/globals.css`.
- Cypress configured with baseUrl `http://localhost:3000`.
