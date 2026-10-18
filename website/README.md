# EasyCPTrans website

The official site, its interactive demo, and the product film:

- **Landing page**: features, shortcuts, installation, and GitHub links.
- **Live demo**: the real application components (`ClipboardCard`, `CardContextMenu`,
  `SettingsModal`, `TagManagementPage`, OCR/lightbox/context panels) rendered with
  sample data. There is no backend and no Tauri runtime in the browser.
- **Product film** (`/video.html`): a twelve-shot, 2:14 promo that runs in the
  browser. Every scene is a pure function of its shot clock, so the player can
  pause and scrub. The soundtrack and sound effects are synthesised with Web Audio;
  there is no video or audio file to download.

## Local development

From the repository root:

```bash
pnpm install
pnpm website:dev
```

Open <http://localhost:4173/> for the site and
<http://localhost:4173/video.html> for the film.

Production build and preview:

```bash
pnpm website:build      # writes website/dist (index.html + video.html)
pnpm website:preview
```

Type-check only:

```bash
pnpm exec tsc -p website/tsconfig.json --noEmit
```

## The product film

- `src/video/storyboard.ts` is the single source of truth: shot number, duration,
  burnt-in subtitle, visual description, edit note, music cue, and sound effects.
  Both the player and the written storyboard below it read from this file.
- `src/video/scenes.tsx` renders the twelve shots. Everything is driven by
  `t` (seconds since the shot began), never by CSS animations, which is what
  keeps pause and seek exact. Shot 03 is the interaction shot: it scrolls the
  real nav strip, card strip, card body, and metadata row, and applies the same
  tilt transform the app's `useCardTilt` produces.
- `src/video/PromoPanel.tsx` is the panel replica: real nav tokens, real
  `MemoryChip`, real `ClipboardCard`, and the real scroll containers. Shot 07
  opens the real match stack so a text chip can be dragged out.
- `src/video/music.ts` schedules pads, bass, percussion, arpeggios, and effects
  against the same clock at 96 BPM (Am7–Fmaj7–Cmaj7–G6). Audio starts on the
  first user gesture, as browsers require.
- `src/video/VideoPage.tsx` owns the transport, captions, storyboard, fullscreen,
  and deep links.
- Deep links: `video.html?shot=5` opens on shot 5, `video.html?t=42.5` on an
  exact second. Both start paused, which is handy for stills and review.
- To export a file, press `F` for fullscreen and record the player with Xbox Game
  Bar (`Win + G`) or OBS. The DOM stage is drawn live; nothing needs rendering
  ahead of time.
- Keyboard: `Space` play/pause, `←`/`→` previous/next shot, `M` mute, `C`
  captions, `S` storyboard, `F` fullscreen, `R` restart.

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

Expected URL: <https://minghf85.github.io/EasyCPTrans/>

The Vite build uses a relative `base` (`./`), so the same artifact works at the
project path and at a custom domain without rebuilding.
