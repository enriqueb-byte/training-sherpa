# Training Sherpa, web app

Small **local** app: list onboarding journeys, enter SP basics, follow the **M01–M12** learning plan, mark **Complete** or **Skip**.

**Data:** Stored in your browser (`localStorage`). It does **not** sync to Jobber or the cloud. Use **Export backup** on the home screen before clearing browser data or switching machines; use **Import backup** to restore.

## Run locally

**Important:** The dev server must be running **and** you must use the URL Vite prints. If you see a **blank page**, the wrong app may be on port 5173, or JavaScript failed, open **DevTools → Console** (⌥⌘J on Mac, F12 on Windows).

From the **`app`** folder:

```bash
cd app
npm install
npm run dev
```

Or from the **`Training Sherpa`** folder (parent of `app`):

```bash
npm install   # once, inside app/, or: npm install --prefix app
npm run dev   # runs Vite in app/
```

Open **http://localhost:5173** (or the URL Vite prints).

### Blank page checklist

1. Terminal shows `VITE v… ready` and `Local: http://localhost:5173/`, if not, run `npm run dev` from `app` (or `npm run dev` from repo root using the script above).  
2. **Hard refresh** the browser (⌘⇧R / Ctrl+Shift+R).  
3. **Console**, any red errors? Screenshot helps.  
4. **Do not** open `index.html` with *File → Open*, use `npm run dev` (ES modules need a server).

## Build static files (optional)

```bash
npm run build
```

Output is in `dist/`, you can host on any static host or open `dist/index.html` if your server allows.

## Deep content

The **markdown playbook** (focus areas, Help Center ideas) lives one folder up: [`../modules/`](../modules/), [`../playbook/routing.md`](../playbook/routing.md). This app is the **tracker**; the repo is the **reference**.
