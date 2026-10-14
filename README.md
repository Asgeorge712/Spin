# Spin

A web app for building spin bike workouts. A workout is a list of **sets**, and each set has:

- **Length** – typed as `m:ss` (e.g. `1:30`) or plain seconds (`90`)
- **Resistance** – 1 to 10
- **Position** – seated or standing
- **Cadence** – an optional target RPM

The editor shows the total time, the average and peak resistance, and a chart of the workout's resistance over time.
**Ride mode** gives you a big countdown for each set, shows the resistance to dial in, and beeps when a set changes.

Workouts are saved in your browser's `localStorage`. Two example workouts are loaded the first time you open the app.

## Development

```bash
npm install
npm run dev       # start the dev server
npm test          # unit tests (Vitest)
npm run build     # type-check and build to dist/
```

Built with React, TypeScript and Vite. The workout model and math are in `src/workout.ts`.
