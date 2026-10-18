import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Cloud,
  Code2,
  CornerDownLeft,
  Download,
  Keyboard,
  Languages,
  Layers,
  ListOrdered,
  type LucideIcon,
  MonitorSmartphone,
  MousePointerClick,
  MoveUpRight,
  Regex,
  ScanText,
  Search,
  ShieldCheck,
  Tags,
  Wifi,
  Zap,
} from "lucide-react";

import { DemoSection, type SiteLang } from "./DemoSection";
import type { Locale } from "../../src/lib/i18n";
import {
  buttonPrimary,
  buttonSecondary,
  focusRing,
  surface,
  surfaceInteractive,
  transition,
} from "../../src/components/ui";

const REPO = "https://github.com/minghf85/EasyCPTrans";
const RELEASES = `${REPO}/releases/latest`;
const SITE_URL = "https://minghf85.github.io/easycptrans/";

/* ────────────────────────────── Copy ───────────────────────────────────── */

const COPY = {
  zh: {
    nav: {
      features: "功能",
      demo: "在线体验",
      video: "宣传片",
      shortcuts: "快捷键",
      download: "下载",
      github: "GitHub",
      language: "语言",
    },
    hero: {
      badge: "Windows 10 / 11 · Tauri 2 · 本地优先",
      titleA: "复制过的，",
      titleB: "都在这里。",
      desc: "EasyCPTrans 把剪贴板变成一条可以搜索、筛选、拖拽的卡片带。按 Ctrl + Shift + V 唤出面板，点一下就能贴回刚才的窗口。",
      primary: "下载 Windows 版",
      secondary: "先在线试试",
      note: "免费 · MIT 许可 · 无需注册 · 数据只在本机",
      keyCaption: "打开 / 隐藏面板",
      keyHint: "点卡片就贴回上一个窗口",
      chips: ["#work", "PROJ-128", "Q1", "OCR", "Alt+C"],
    },
    stats: [
      { value: "3 种", label: "文本 / 图片 / 文件" },
      { value: "20+", label: "搜索字段与筛选条件" },
      { value: "100%", label: "本地运行，无账号" },
    ],
    features: {
      eyebrow: "功能",
      title: "一个面板，装下整条工作流",
      desc: "从捕获、整理、搜索到粘贴和同步。每个动作都有快捷键，所有数据留在你自己的电脑上。",
    },
    tech: {
      eyebrow: "技术",
      title: "原生桌面，不是网页套壳",
      desc: "Tauri 2 负责窗口、托盘和全局快捷键，Rust 处理剪切板、OLE 拖拽、OCR 与 SQLite。前端只有 React 和 TypeScript。",
      items: [
        {
          icon: Zap,
          title: "启动快，占得少",
          desc: "没有 Electron 运行时。面板随叫随到，空闲时几乎不占 CPU。",
        },
        {
          icon: ShieldCheck,
          title: "私密内容真加密",
          desc: "Argon2 派生密钥，AES-GCM 加密内容；密码和明文都不离开本机。",
        },
        {
          icon: MonitorSmartphone,
          title: "设备之间同步",
          desc: "WebDAV 或局域网 mDNS 配对。每条记录自动带上来源设备标签。",
        },
      ],
    },
    shortcuts: {
      eyebrow: "快捷键",
      title: "手不用离开键盘",
      desc: "默认值如下，全部可以在设置里重新录制。",
      global: "全局快捷键",
      card: "面板内快捷键",
      note: "桌面版独有的全局快捷键由 Rust 注册；网页演示里可以直接用面板内的按键。",
    },
    download: {
      eyebrow: "下载",
      title: "三分钟开始使用",
      desc: "从 GitHub Releases 下载最新的 NSIS 安装包。如果你更习惯 MSI，也在同一个页面。",
      primary: "前往 Releases",
      secondary: "查看源代码",
      steps: [
        { title: "下载并安装", desc: "运行 EasyCPTrans_x.x.x_x64-setup.exe，按向导完成安装。" },
        { title: "复制任意内容", desc: "文本、图片或多选文件都可以，面板会自动收下。" },
        { title: "按 Ctrl + Shift + V", desc: "在任意应用里唤出面板；点击卡片即可粘贴回去。" },
      ],
      requirement: "系统要求：Windows 10 / 11（x64）。无需额外运行时。",
      smartScreen:
        "安装包目前没有代码签名，Windows SmartScreen 可能提示未知发布者。选择「更多信息 → 仍要运行」即可。",
    },
    footer: {
      builtBy: "由 minghf85 构建",
      license: "MIT 许可",
      source: "源代码",
      site: "官网源码",
      note: "本站是离线可用的静态站点；演示数据只存在于浏览器里。",
    },
  },
  en: {
    nav: {
      features: "Features",
      demo: "Live demo",
      video: "Film",
      shortcuts: "Shortcuts",
      download: "Download",
      github: "GitHub",
      language: "Language",
    },
    hero: {
      badge: "Windows 10 / 11 · Tauri 2 · local-first",
      titleA: "Everything you copy,",
      titleB: "one shortcut away.",
      desc: "EasyCPTrans turns your clipboard into a searchable, filterable strip of cards. Press Ctrl + Shift + V anywhere, click a card, and it lands back in the window you came from.",
      primary: "Download for Windows",
      secondary: "Try it in the browser",
      note: "Free · MIT licensed · No account · Data stays on your machine",
      keyCaption: "Open / hide the panel",
      keyHint: "Click a card to paste back into the previous window",
      chips: ["#work", "PROJ-128", "Q1", "OCR", "Alt+C"],
    },
    stats: [
      { value: "3", label: "text, images, and files" },
      { value: "20+", label: "search fields and filters" },
      { value: "100%", label: "local — no account" },
    ],
    features: {
      eyebrow: "Features",
      title: "One panel for the whole workflow",
      desc: "Capture, organize, search, paste, and sync. Every action has a key, and every byte stays on your machine.",
    },
    tech: {
      eyebrow: "Under the hood",
      title: "A native desktop app, not a wrapped website",
      desc: "Tauri 2 owns the window, tray, and global shortcuts. Rust handles the clipboard, OLE drag-out, OCR, and SQLite. The UI is React and TypeScript.",
      items: [
        {
          icon: Zap,
          title: "Fast to open, light to run",
          desc: "No Electron runtime. The panel appears on demand and idles almost silently.",
        },
        {
          icon: ShieldCheck,
          title: "Private means encrypted",
          desc: "Argon2 derives the key and AES-GCM encrypts the content. Neither the password nor plaintext leaves the machine.",
        },
        {
          icon: MonitorSmartphone,
          title: "Sync across devices",
          desc: "Use WebDAV or LAN pairing over mDNS. Every item is tagged with the device it came from.",
        },
      ],
    },
    shortcuts: {
      eyebrow: "Shortcuts",
      title: "Keep your hands on the keys",
      desc: "These are the defaults; every one of them can be re-recorded in Settings.",
      global: "Global shortcuts",
      card: "Inside the panel",
      note: "The global keys are registered by Rust in the desktop build. The web demo supports the in-panel keys directly.",
    },
    download: {
      eyebrow: "Download",
      title: "Up and running in three minutes",
      desc: "Grab the latest NSIS installer from GitHub Releases. An MSI is available on the same page.",
      primary: "Go to Releases",
      secondary: "Browse the source",
      steps: [
        { title: "Download and install", desc: "Run EasyCPTrans_x.x.x_x64-setup.exe and follow the wizard." },
        { title: "Copy anything", desc: "Text, an image, or several files — the panel picks it up." },
        { title: "Press Ctrl + Shift + V", desc: "Open the panel in any app; click a card to paste it back." },
      ],
      requirement: "Requires Windows 10 / 11 (x64). No extra runtime.",
      smartScreen:
        "The installer is not code-signed yet, so SmartScreen may call it an unknown publisher. Choose “More info → Run anyway”.",
    },
    footer: {
      builtBy: "Built by minghf85",
      license: "MIT License",
      source: "Source",
      site: "Site source",
      note: "This site is a static page and works offline; the demo data lives only in your browser.",
    },
  },
} as const;

const FEATURES: Array<{
  icon: LucideIcon;
  zh: { title: string; desc: string };
  en: { title: string; desc: string };
}> = [
  {
    icon: ClipboardList,
    zh: { title: "自动捕获历史", desc: "复制文本、图片或多选文件，它们会自动进入卡片带。重复内容只更新位置，不会重复堆积。" },
    en: { title: "Automatic history", desc: "Copy text, images, or multiple files and they land in the strip. Duplicates are bumped, not added twice." },
  },
  {
    icon: MousePointerClick,
    zh: { title: "点一下就贴回去", desc: "点击卡片内容区，内容会写入剪贴板并粘贴到之前的窗口。Enter 只复制，不粘贴。" },
    en: { title: "Click to paste back", desc: "Click a card to write it to the clipboard and paste into the previous window. Enter copies without pasting." },
  },
  {
    icon: MoveUpRight,
    zh: { title: "拖到别的程序", desc: "按住文件或图片卡片拖出，直接放进资源管理器、上传框或编辑器。文本暂不支持拖出。" },
    en: { title: "Drag into other apps", desc: "Hold and drag a file or image card into Explorer, an upload field, or an editor. Text drag-out is not supported yet." },
  },
  {
    icon: Search,
    zh: { title: "会读语法的搜索", desc: "tag:work、app:chrome、type:image、date:、size:、len:、短语和排除词，条件可以组合。" },
    en: { title: "Search that reads syntax", desc: "tag:work, app:chrome, type:image, date:, size:, len:, phrases, and exclusions — combine them freely." },
  },
  {
    icon: Tags,
    zh: { title: "多标签 AND 筛选", desc: "点开 Tags 同时选择多个标签，只留下同时满足全部条件的卡片。" },
    en: { title: "Multi-tag AND filters", desc: "Open Tags and select several labels; only cards that satisfy all of them remain." },
  },
  {
    icon: Regex,
    zh: { title: "正则规则自动打标", desc: "给标签写一条正则，新内容入库时自动打标；开启抽取后，匹配项会堆成可拖拽的列表。" },
    en: { title: "Regex rules tag for you", desc: "Give a tag a pattern and new clips are tagged on ingest. With extraction on, matches stack into draggable rows." },
  },
  {
    icon: ScanText,
    zh: { title: "图片 OCR", desc: "截图里的文字会变成可复制、可搜索的文本。支持自动识别和语言包选择。" },
    en: { title: "Image OCR", desc: "Text inside screenshots becomes copyable, searchable text. Auto-recognition and language selection included." },
  },
  {
    icon: Languages,
    zh: { title: "划词与整句翻译", desc: "Alt + C 查询本地 ECDICT；任意文本卡片也可以通过 OpenAI 兼容接口整句翻译。" },
    en: { title: "Word and text translation", desc: "Alt + C looks up the local ECDICT dictionary; any text card can be translated through an OpenAI-compatible API." },
  },
  {
    icon: ListOrdered,
    zh: { title: "队列粘贴", desc: "按 Space 把卡片加入队列，之后每次按队列快捷键就按顺序粘贴一张，适合填表。" },
    en: { title: "Queue paste", desc: "Press Space to queue cards, then paste them one at a time in order — ideal for forms." },
  },
  {
    icon: ShieldCheck,
    zh: { title: "私密内容加密", desc: "敏感卡片可以设为私密，内容用 Argon2 + AES-GCM 加密，解锁时才恢复明文。" },
    en: { title: "Encrypted private items", desc: "Mark sensitive cards private. Content is encrypted with Argon2 + AES-GCM and only decrypted when unlocked." },
  },
  {
    icon: Cloud,
    zh: { title: "WebDAV 与局域网同步", desc: "通过 WebDAV 或 mDNS 局域网配对同步历史，每条记录自动标注来源设备。" },
    en: { title: "WebDAV and LAN sync", desc: "Sync over WebDAV or pair devices on the LAN via mDNS. Each item carries its source-device tag." },
  },
  {
    icon: Keyboard,
    zh: { title: "每个动作都有键", desc: "全局唤出、快捷索引、队列、堆叠、划词、置顶、私密、OCR、放大，全部可重新录制。" },
    en: { title: "A key for every action", desc: "Toggle, quick-index, queue, stack, translate, pin, private, OCR, zoom — all rebindable." },
  },
];

const GLOBAL_KEYS = [
  { combo: "Ctrl + Shift + V", zh: "打开 / 隐藏面板", en: "Open / hide the panel" },
  { combo: "Ctrl + Shift + 1…0", zh: "快捷索引粘贴（第 1–10 张）", en: "Quick-index paste (cards 1–10)" },
  { combo: "Ctrl + Alt + V", zh: "按队列顺序逐个粘贴", en: "Paste the queue in order" },
  { combo: "Ctrl + Alt + ↑ / ↓", zh: "向上 / 向下堆叠复制", en: "Stack copies up / down" },
  { combo: "Alt + C", zh: "划词翻译", en: "Translate the selection" },
];

const CARD_KEYS = [
  { combo: "T", zh: "打开选中卡片的菜单", en: "Open the selected card's menu" },
  { combo: "P", zh: "置顶 / 取消置顶", en: "Pin / unpin" },
  { combo: "M", zh: "设为私密 / 解锁", en: "Make private / unlock" },
  { combo: "O", zh: "OCR 识别（图片）", en: "OCR (images)" },
  { combo: "Z", zh: "放大（图片）", en: "Zoom (images)" },
  { combo: "Delete", zh: "删除选中卡片", en: "Delete the selected card" },
  { combo: "Space", zh: "加入 / 移出队列", en: "Add / remove from the queue" },
  { combo: "Enter", zh: "只复制，不粘贴", en: "Copy without pasting" },
  { combo: "← / →", zh: "选择上一张 / 下一张", en: "Select previous / next" },
];

/* ────────────────────────────── Page ───────────────────────────────────── */

export function LandingPage() {
  const [lang, setLang] = useState<SiteLang>("zh");
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const copy = COPY[lang];

  const switchLang = (next: SiteLang) => {
    setLang(next);
    setLocale(next === "zh" ? "zh-CN" : "en");
  };

  // Keep the document language and title in sync with the visible copy for
  // assistive tech and for browser tabs / search engines.
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title =
      lang === "zh"
        ? "EasyCPTrans — 剪贴板历史与划词翻译"
        : "EasyCPTrans — Clipboard history and on-the-fly translation";
  }, [lang]);

  // The page is a single route, but deep links such as `#download` are handy in
  // a README or issue. The browser scrolls before React has rendered, so repeat
  // it once the sections exist.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <a href="#top" className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </span>
            <span className="truncate text-base font-semibold tracking-tight">EasyCPTrans</span>
          </a>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <NavLink href="#features">{copy.nav.features}</NavLink>
            <NavLink href="#demo">{copy.nav.demo}</NavLink>
            <NavLink href="./video.html">{copy.nav.video}</NavLink>
            <NavLink href="#shortcuts">{copy.nav.shortcuts}</NavLink>
            <NavLink href="#download">{copy.nav.download}</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              {(["zh", "en"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchLang(value)}
                  aria-pressed={lang === value}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${transition} ${focusRing} ${
                    lang === value
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {value === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className={`hidden h-9 items-center gap-2 px-3 text-sm lg:inline-flex ${buttonSecondary}`}
            >
              <Code2 className="h-4 w-4" aria-hidden />
              {copy.nav.github}
            </a>
            <a
              href={RELEASES}
              target="_blank"
              rel="noreferrer"
              className={`h-9 ${buttonPrimary}`}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{copy.nav.download}</span>
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="border-b border-gray-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
                {copy.hero.badge}
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {copy.hero.titleA}
                <br />
                <span className="text-blue-700">{copy.hero.titleB}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600">
                {copy.hero.desc}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href={RELEASES} target="_blank" rel="noreferrer" className={`h-11 px-5 ${buttonPrimary}`}>
                  <Download className="h-4 w-4" aria-hidden />
                  {copy.hero.primary}
                </a>
                <a href="#demo" className={`h-11 px-5 ${buttonSecondary}`}>
                  {copy.hero.secondary}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
              <p className="mt-4 text-xs text-gray-500">{copy.hero.note}</p>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
                {copy.stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-2xl font-semibold tracking-tight text-gray-900">
                      {stat.value}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-snug text-gray-500">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Keycap composition */}
            <div className="relative flex items-center justify-center">
              <div className="relative w-full max-w-md">
                <div className={`${surface} p-6`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">{copy.hero.keyCaption}</span>
                    <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      Windows
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {["Ctrl", "Shift", "V"].map((key) => (
                      <kbd
                        key={key}
                        className="flex h-20 items-center justify-center rounded-xl border border-gray-300 bg-white text-xl font-semibold text-gray-800 shadow-[0_3px_0_0_#d1d5db]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {copy.hero.keyHint}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {copy.hero.chips.map((chip, index) => (
                      <span
                        key={chip}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                          index === 2
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live demo */}
        <section id="demo" className="border-b border-gray-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <DemoSection locale={locale} lang={lang} onLocaleChange={setLocale} />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <SectionHeading
              eyebrow={copy.features.eyebrow}
              title={copy.features.title}
              desc={copy.features.desc}
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                const text = feature[lang];
                return (
                  <article
                    key={text.title}
                    className={`${surface} ${surfaceInteractive} p-5 ${transition}`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-base font-semibold tracking-tight text-gray-900">
                      {text.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{text.desc}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Tech */}
        <section className="border-b border-gray-200 bg-slate-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                {copy.tech.eyebrow}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                {copy.tech.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{copy.tech.desc}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Tauri 2", "Rust", "React 18", "TypeScript", "SQLite", "Windows OCR"].map((tag) => (
                  <span key={tag} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {copy.tech.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className={`${surface} flex gap-4 p-4`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Shortcuts */}
        <section id="shortcuts" className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <SectionHeading
              eyebrow={copy.shortcuts.eyebrow}
              title={copy.shortcuts.title}
              desc={copy.shortcuts.desc}
            />
            <div className="mt-10 grid items-start gap-4 lg:grid-cols-2">
              <ShortcutTable
                title={copy.shortcuts.global}
                icon={<Keyboard className="h-4 w-4" aria-hidden />}
                rows={GLOBAL_KEYS.map((row) => ({ combo: row.combo, label: row[lang] }))}
              />
              <ShortcutTable
                title={copy.shortcuts.card}
                icon={<Layers className="h-4 w-4" aria-hidden />}
                rows={CARD_KEYS.map((row) => ({ combo: row.combo, label: row[lang] }))}
              />
            </div>
            <p className="mt-4 text-xs text-gray-500">{copy.shortcuts.note}</p>
          </div>
        </section>

        {/* Download */}
        <section id="download" className="bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <div className={`${surface} overflow-hidden`}>
              <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.05fr_0.95fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                    {copy.download.eyebrow}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                    {copy.download.title}
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-gray-600">
                    {copy.download.desc}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      href={RELEASES}
                      target="_blank"
                      rel="noreferrer"
                      className={`h-11 px-5 ${buttonPrimary}`}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      {copy.download.primary}
                    </a>
                    <a
                      href={REPO}
                      target="_blank"
                      rel="noreferrer"
                      className={`h-11 px-5 ${buttonSecondary}`}
                    >
                      <Code2 className="h-4 w-4" aria-hidden />
                      {copy.download.secondary}
                    </a>
                  </div>
                  <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-gray-500">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                    {copy.download.requirement}
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-gray-500">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    {copy.download.smartScreen}
                  </p>
                </div>

                <ol className="space-y-3">
                  {copy.download.steps.map((step, index) => (
                    <li key={step.title} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ClipboardList className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-medium text-gray-900">EasyCPTrans</span>
            <span className="text-gray-300">·</span>
            <span>{copy.footer.builtBy}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <a className="hover:text-gray-900" href="./video.html">
              {copy.nav.video}
            </a>
            <a className="hover:text-gray-900" href={REPO} target="_blank" rel="noreferrer">
              {copy.footer.source}
            </a>
            <a className="hover:text-gray-900" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              {copy.footer.license}
            </a>
            <a className="hover:text-gray-900" href={SITE_URL} target="_blank" rel="noreferrer">
              {copy.footer.site}
            </a>
            <span className="flex items-center gap-1">
              <Wifi className="h-3 w-3" aria-hidden />
              {copy.footer.note}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ────────────────────────────── Bits ───────────────────────────────────── */

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium text-gray-600 ${transition} ${focusRing} hover:bg-gray-50 hover:text-gray-900`}
    >
      {children}
    </a>
  );
}

function SectionHeading({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{desc}</p>
    </div>
  );
}

function ShortcutTable({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: ReactNode;
  rows: Array<{ combo: string; label: string }>;
}) {
  return (
    <div className={`${surface} p-5`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </span>
        {title}
      </h3>
      <ul className="mt-4 space-y-1">
        {rows.map((row) => (
          <li
            key={row.combo}
            className="flex items-center justify-between gap-4 rounded-lg px-1 py-1.5 text-sm"
          >
            <kbd className="site-kbd shrink-0">{row.combo}</kbd>
            <span className="text-right text-gray-600">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
