# MATA

Wildfire command demo — simulated Kalimantan incident from sensor anomaly through suppression and containment.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase Hosting

This app is a **static export** (`output: "export"` in `next.config.ts`) served from the `out/` directory via [Firebase Hosting](https://firebase.google.com/docs/hosting).

### One-time setup

1. Install the Firebase CLI (or use `npx`, which the npm scripts do automatically):

   ```bash
   npx -y firebase-tools@latest login
   ```

2. Create or select a Firebase project, then link it locally:

   ```bash
   cp .firebaserc.example .firebaserc
   # Edit .firebaserc and set your project ID, or:
   npx -y firebase-tools@latest use --add
   ```

3. Enable Hosting in the [Firebase console](https://console.firebase.google.com/) if prompted on first deploy.

### Deploy

```bash
npm run deploy:firebase
```

Your site will be available at `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`.

### Local preview (production build)

```bash
npm run serve:firebase
```

Serves the built `out/` folder at [http://localhost:5000](http://localhost:5000) via the Hosting emulator.

### Preview channel (optional)

```bash
npm run build
npx -y firebase-tools@latest hosting:channel:deploy preview --expires 7d
```

## Stack

- [Next.js](https://nextjs.org) (App Router, static export)
- MapLibre GL, React Three Fiber, Tailwind CSS
