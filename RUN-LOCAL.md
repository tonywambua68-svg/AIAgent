# Running JARVIS OS locally (Windows / PowerShell)

## The standard flow

Open PowerShell **inside the project folder** (the folder that contains `package.json`, `index.html` and `src/`), then:

```
npm install
npm run dev
```

Then open the printed address (usually `http://localhost:5173`).

Production check:

```
npm run build
npx vite preview
```

## Fixing `npm error Missing script: "dev"`

This error means npm found a `package.json`, but it has no `dev` script. Three possible causes:

### 1. You are in the wrong folder

A zipped repo often unzips into a nested folder. Check where the real project root is:

```
dir
```

You must see `package.json`, `index.html`, `src`, `public`, `vite.config.ts`.
If those are inside a subfolder (e.g. `AIAgent-main\jarvis-os\`), `cd` into it first.

Note: `AIAgent-main` is a **different, older project** — the JARVIS OS build ships as
the `sandbox-workspace` package. If you unzipped the old repo, it is not this codebase.

### 2. The download is missing this project's package.json

If `dir` shows `src/` and `index.html` but **no** `package.json` (or an empty/alien one),
replace it with exactly this content — it matches the lockfile of this build:

```json
{
  "name": "sandbox-workspace",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.7",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.1.7",
    "typescript": "^5.7.0",
    "vite": "^6.3.5"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

Then: `npm install` → `npm run dev`.

### 3. Bypass the script entirely

Vite can run without any npm script at all:

```
npm install
npx vite
```

## Checklist before anything else

- Node.js 18 or newer installed → verify with `node -v`
- You ran `npm install` first (zips never include `node_modules`)
- `npm run` with no script name lists what your current package.json actually defines —
  if the list is empty or alien, you are looking at the wrong package.json

## Good to know

- All data (sales, memory, audit log, settings) lives in your browser's `localStorage` —
  it survives restarts and stays on your machine.
- After `npm run dev`, use the topbar **Install app** button to install JARVIS as a
  standalone app; it then launches in its own window, offline-capable.
- Voice features need Chrome or Edge (Web Speech API); the mic diagnostics panel under
  Settings → Voice & audio tells you exactly what is wrong if anything fails.
