# Spin

A web app for building and riding spin bike workouts. It works with no internet connection.

A workout is a list of **sets**, and each set has:

- **Length** – typed as `m:ss` (e.g. `1:30`) or plain seconds (`90`)
- **Resistance** – 0 to 100
- **Position** – seated or standing
- **Cadence** – an optional target RPM

The app opens on **Today**: today's ride from the weekly schedule, with its chart, a **Start ride** button and the
next few days. The **Workouts** tab is the editor (plus the Ride Library, files and sync), and **Week** is the
schedule. The tab is kept in the address (`#today`, `#workouts`, `#week`), so the back button moves between them.

The editor shows the total time, the average and peak resistance, and a chart of the workout's resistance over time.
**Ride mode** gives you a big countdown for each set, shows the resistance to dial in, beeps when a set changes,
and keeps the screen awake while the timer runs.

## Changing resistance mid-ride (touch screens)

During a ride, drag up or down on the current-set card to raise or lower that set's resistance
(about 3 px per point). The first change saves a **new workout** named like
`Hill Climb (ride Oct 14, 6:05 PM)` with the new numbers, and the ride continues on that copy. Later changes
in the same ride update the copy. The original workout is never changed.

## Workout config files

Each workout can be saved as a `.json` config file:

```json
{
  "format": "spin-workout",
  "version": 1,
  "name": "Hill Climb",
  "sets": [
    { "label": "Warm-up", "duration": "4:00", "resistance": 30, "position": "seated", "cadence": 90 },
    { "label": "Summit", "duration": 90, "resistance": 90, "position": "standing" }
  ]
}
```

`duration` takes `"m:ss"`, `"h:mm:ss"` or a number of seconds. `label`, `position` (default `seated`)
and `cadence` are optional.

- **The files in [`workouts/`](workouts/)** are the shared library when sync is on (see below). Without sync, they
  are the starting workouts bundled into the app.
- **On each device**, workouts are also kept in the browser's storage, so the app works offline. Use **Export this workout** to download one as a
  `.json` file, and **Import files…** to load one or more `.json` files.

## Ride Library (no account needed)

Anyone can use the app without GitHub: workouts are saved in their browser. The **Ride Library** card has a
**Check for new rides** button that downloads the current `workouts/` folder from this public repo, with no
token (2 GitHub API calls, then the files from raw.githubusercontent.com at that commit). New rides are added, rides
that came from the library and haven't been edited are updated, and the user's own workouts and edited rides are
never changed. Each library ride remembers a fingerprint of the version it came from to tell whether it was edited.
The card is hidden when sync is connected to this repo, since sync already keeps those rides current.

People who want sync across their own devices can point **Sync with GitHub** at their own repo; library rides they
have are then uploaded there too.

## Weekly schedule

The **This week** card assigns a ride (or Rest) to each day, and the **Today** bar at the top shows today's ride
with a button that starts it. It starts as a suggested 80/20 week (mostly easy and endurance riding, two hard
days apart); **Use the suggested week** resets it. With sync on, the schedule is saved to `schedule/week.json`
and shared by every device; the last device to change it wins.

## Syncing workouts across devices

Connect the app to this GitHub repo (the **Sync with GitHub** panel) and every workout is saved as its own file in
[`workouts/`](workouts/), shared by every device you connect: new workouts, edits, duplicates, deletions, and the
copies made by dragging resistance mid-ride.

- **Setup, once per device:** create a
  [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to only this repo and
  *Contents: Read and write*, then paste it into the panel. It is stored only in that browser.
- **When it syncs:** when the app opens, a few seconds after a change, when the connection comes back, when the app
  returns to the foreground, every 2 minutes, and on **Sync now**. Each change is a commit, so the repo history is a
  full undo log.
- **Offline:** everything keeps working; changes are saved on the device and sent the next time it's online.
- **Conflicts:** if the same workout was changed on two devices before syncing, the version already on GitHub keeps
  the file and the other is saved as a separate workout named `… (conflict <date>)`. Nothing is lost.
- A workout keeps its file name when renamed.
- Commits that only touch `workouts/` don't redeploy the site; the app reads them straight from the repo.

The sync logic is in `src/sync/` (`sync.ts` is the algorithm, tested in `sync.test.ts` against a fake repo).

## Offline use

The production build includes a service worker (`sw/sw.js`) that saves every file of the app on the device the
first time it loads. After that, the app opens and runs with no connection. On a phone or tablet you can also
use "Add to Home Screen" to install it like an app. Offline mode needs the app to be served over HTTPS (or from
`localhost`), and it is turned off in `npm run dev`. Use `npm run build && npm run preview` to try it.

## Ads

`src/components/AdBanner.tsx` shows a Google AdSense banner (ad unit "Spin app banner") at the bottom of the editor. It
only runs on `spin.paulgeorge.com`, never in ride mode, and not when offline; an unfilled slot collapses to nothing.
Keep AdSense **Auto ads** off for this site so Google doesn't place ads elsewhere, such as during a ride.

## Hosting on GitHub Pages

`.github/workflows/deploy.yml` builds the app, runs the tests, and publishes it to GitHub Pages on every push
to `main`. You can also run it by hand from the Actions tab. One-time setup: in the repo's **Settings → Pages**,
set **Source** to **GitHub Actions**. The app is then at `https://<user>.github.io/Spin/`.

To use it on a phone, open that address once in the browser while online, then (on iPhone) tap
Share → **Add to Home Screen**. After that it works offline.

## Development

```bash
npm install
npm run dev       # start the dev server
npm test          # unit tests (Vitest)
npm run build     # type-check and build to dist/
npm run preview   # serve the production build, with offline support
```

Built with React, TypeScript and Vite. The workout model is in `src/workout.ts`, and the config file format is
in `src/configFile.ts`.
