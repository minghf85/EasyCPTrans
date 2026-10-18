# EasyCPTrans website

The official site and its interactive demo:

- **Landing page**: features, shortcuts, installation, and GitHub links.
- **Live demo**: the real application components (`ClipboardCard`, `CardContextMenu`,
  `SettingsModal`, `TagManagementPage`, OCR/lightbox/context panels) rendered with
  sample data. There is no backend and no Tauri runtime in the browser.

## Local development

From the repository root:

```bash
pnpm install
pnpm website:dev
```

Open <http://localhost:4173/>.

Production build and preview:

```bash
pnpm website:build      # writes website/dist
pnpm website:preview
```

Type-check only:

```bash
pnpm exec tsc -p website/tsconfig.json --noEmit
```

## How the demo works

- `src/DemoSection.tsx` re-creates the panel shell (header, tabs, filters, card
  strip, keyboard) and reuses the app's components directly from `../../src`.
  The mouse wheel scrolls the card strip and tab bar sideways, and hovering a
  card makes it the current one, matching the desktop app.
- `src/demo/data.ts` holds the sample history, managed tags, config, and the two
  SVG "screenshots" served as image content.
- `src/demo/icons.ts` embeds the source-application marks (VS Code, Chrome, QQ,
  WeChat, Explorer, Notepad, …). The mocked `get_app_icon` draws them into a
  canvas and returns RGBA, so the real card icon and header-band pipeline runs.
- `src/demo/tauri/core.ts` is a browser stand-in for every Tauri command the
  reused components call (`get_config`, `get_image_content`, `get_app_icon`,
  `preview_tag_pattern`, `translate_text_api`, OCR, sync status, …).
- `vite.config.ts` aliases `@tauri-apps/api/core`, `@tauri-apps/api/event`, and
  `@tauri-apps/plugin-dialog` to that mock layer **only for this build**. The
  desktop app's own Vite config is untouched.

If a reused component starts calling a new Rust command, add a case to the mock
in `src/demo/tauri/core.ts`; the browser build will otherwise fall through to
`null`.

## Deploying to GitHub Pages

The site is built and deployed by
[`.github/workflows/deploy-website.yml`](../.github/workflows/deploy-website.yml).

One-time setup:

1. Open the repository on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

After that, every push to `main` that touches `website/**`, `src/**`,
`package.json`, or the lockfile rebuilds and deploys the site. You can also run
**Actions → Deploy website → Run workflow** manually.

Expected URL: <https://minghf85.github.io/easycptrans/>

The Vite build uses a relative `base` (`./`), so the same artifact works at the
project path and at a custom domain without rebuilding.
