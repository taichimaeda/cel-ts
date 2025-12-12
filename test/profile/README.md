# Profiling

Profile CEL evaluation using Clinic.js against the benchmark-style cases in `test/profile/cases.ts`.

```bash
pnpm run profile:doctor
pnpm run profile:flame
pnpm run profile:bubble
```

The profiling scripts build the package and emit `test/profile/*.js` from the TypeScript sources, then run Clinic against the generated `test/profile/run.js`.
