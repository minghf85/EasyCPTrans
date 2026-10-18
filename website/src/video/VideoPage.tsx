/**
 * The promo player.
 *
 * The film is a DOM stage plus a synthesised soundtrack, not a video file. The
 * page therefore owns the clock: `time` drives both the scenes and the Web Audio
 * scheduler, so pause, seek and replay stay in sync.
 */

import { useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Captions,
  CaptionsOff,
  GitBranch,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

import {
  SCENES,
  TOTAL_DURATION,
  formatTime,
  sceneIndexAt,
  sceneRange,
  sceneStart,
  type SceneId,
} from "./storyboard";
import {
  HookScene,
  MediaScene,
  OcrScene,
  OutroScene,
  PasteScene,
  PrivateScene,
  QueueScene,
  RulesScene,
  SearchScene,
  SummonScene,
  SyncScene,
  UiScene,
  type SceneProps,
} from "./scenes";
import { STAGE_HEIGHT, STAGE_WIDTH, clamp01, useStageScale } from "./primitives";
import { promoMusic } from "./music";

const SCENE_COMPONENTS: Record<SceneId, ComponentType<SceneProps>> = {
  hook: HookScene,
  summon: SummonScene,
  ui: UiScene,
  paste: PasteScene,
  media: MediaScene,
  search: SearchScene,
  rules: RulesScene,
  ocr: OcrScene,
  queue: QueueScene,
  private: PrivateScene,
  sync: SyncScene,
  outro: OutroScene,
};

export function VideoPage() {
  // Deep links are useful for reviews and for grabbing a still: `?shot=5` opens
  // on the fifth shot, `?t=42.5` on an exact second. Both start paused.
  const initialTime = (() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("t")) {
      const value = Number(params.get("t"));
      if (Number.isFinite(value)) return Math.max(0, Math.min(TOTAL_DURATION - 0.001, value));
    }
    if (params.has("shot")) {
      const value = Number(params.get("shot"));
      if (Number.isFinite(value)) {
        const index = Math.max(0, Math.min(SCENES.length - 1, Math.floor(value) - 1));
        return sceneStart(index) + 0.001;
      }
    }
    return 0;
  })();

  const [time, setTime] = useState(initialTime);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [storyboardOpen, setStoryboardOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [started, setStarted] = useState(initialTime > 0);

  const timeRef = useRef(initialTime);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);

  const sceneIndex = sceneIndexAt(time);
  const scene = SCENES[sceneIndex];
  const sceneLocal = time - sceneStart(sceneIndex);
  const SceneView = SCENE_COMPONENTS[scene.id];

  const setClock = useCallback((value: number) => {
    const next = Math.max(0, Math.min(TOTAL_DURATION, value));
    timeRef.current = next;
    setTime(next);
  }, []);

  const fireSfx = useCallback((from: number, to: number) => {
    if (to <= from || to - from > 0.75) return;
    SCENES.forEach((entry, index) => {
      const start = sceneStart(index);
      entry.sfx.forEach((cue) => {
        const at = start + cue.at;
        if (at > from && at <= to) promoMusic.playSfx(cue.name);
      });
    });
  }, []);

  const play = useCallback(() => {
    if (timeRef.current >= TOTAL_DURATION - 0.01) {
      timeRef.current = 0;
      setTime(0);
    }
    setStarted(true);
    setPlaying(true);
    playingRef.current = true;
    promoMusic.start(timeRef.current);
    promoMusic.setEnabled(!muted);
  }, [muted]);

  const pause = useCallback(() => {
    setPlaying(false);
    playingRef.current = false;
    promoMusic.stop();
  }, []);

  const seek = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(TOTAL_DURATION - 0.001, value));
      setClock(next);
      if (playingRef.current) {
        promoMusic.start(next);
        promoMusic.setEnabled(!muted);
      }
    },
    [muted, setClock],
  );

  const jumpToScene = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(SCENES.length - 1, index));
      seek(sceneStart(next) + 0.001);
    },
    [seek],
  );

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  // The playback clock. Only the delta is read from `performance.now`, so a
  // dropped frame does not stretch the edit.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.25, (now - last) / 1000);
      last = now;
      const from = timeRef.current;
      const next = Math.min(TOTAL_DURATION, from + delta);
      timeRef.current = next;
      setTime(next);
      fireSfx(from, next);
      if (next >= TOTAL_DURATION) {
        setPlaying(false);
        playingRef.current = false;
        // Do not close the audio context here: the last pad is still ringing.
        // `start()` on replay, `pause()`, and unmount all close it explicitly.
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, fireSfx]);

  useEffect(() => () => promoMusic.stop(), []);

  useEffect(() => {
    promoMusic.setEnabled(!muted);
  }, [muted]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current?.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by the embedding frame; the page still works.
    }
  }, []);

  // Keyboard transport. Ignore fields so the page stays usable inside a form.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      switch (event.code) {
        case "Space":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          jumpToScene(sceneIndexAt(timeRef.current) - 1);
          break;
        case "ArrowRight":
          event.preventDefault();
          jumpToScene(sceneIndexAt(timeRef.current) + 1);
          break;
        case "KeyM":
          setMuted((value) => !value);
          break;
        case "KeyC":
          setCaptions((value) => !value);
          break;
        case "KeyS":
          setStoryboardOpen((value) => !value);
          break;
        case "KeyR":
          setClock(0);
          if (playingRef.current) {
            promoMusic.start(0);
          }
          break;
        case "KeyF":
          void toggleFullscreen();
          break;
        case "Escape":
          if (document.fullscreenElement) void document.exitFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpToScene, setClock, togglePlay]);

  const scrubTo = useCallback(
    (clientX: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const ratio = clamp01((clientX - rect.left) / Math.max(1, rect.width));
      setClock(ratio * TOTAL_DURATION);
    },
    [setClock],
  );

  const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbingRef.current = true;
    resumeAfterScrubRef.current = playingRef.current;
    if (playingRef.current) pause();
    scrubTo(event.clientX, event.currentTarget);
  };

  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubTo(event.clientX, event.currentTarget);
  };

  const endScrub = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    if (resumeAfterScrubRef.current) {
      promoMusic.start(timeRef.current);
      promoMusic.setEnabled(!muted);
      setPlaying(true);
      playingRef.current = true;
    }
    resumeAfterScrubRef.current = false;
  };

  const { ref: stageRef, scale } = useStageScale();
  const progressRatio = time / TOTAL_DURATION;

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <header className="border-b border-white/10 bg-[#070b14]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-5">
          <a href="./index.html" className="flex items-center gap-2 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <ClipboardGlyphSmall />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">EasyCPTrans</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-white/50">
              Film
            </span>
          </a>
          <span className="hidden text-[13px] text-white/35 sm:block">产品宣传片 · 网页实时演出</span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="./index.html"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-[13px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              返回官网
            </a>
            <a
              href="https://github.com/minghf85/EasyCPTrans"
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-[13px] font-medium text-white/70 transition hover:border-white/30 hover:text-white sm:inline-flex"
            >
              <GitBranch className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-6">
        <div
          ref={playerRef}
          className={`overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_40px_120px_rgba(0,0,0,0.55)] ${
            fullscreen ? "flex h-screen w-screen flex-col rounded-none border-0" : ""
          }`}
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              EasyCPTrans · Product film
            </span>
            <span className="ml-auto font-mono text-[11px] text-white/35">
              SHOT {scene.shot} / {SCENES.length}
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
              {formatTime(time)} / {formatTime(TOTAL_DURATION)}
            </span>
          </div>

          <div
            className={`relative w-full overflow-hidden bg-[#05080f] ${fullscreen ? "min-h-0 flex-1" : ""}`}
            style={fullscreen ? undefined : { aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
          >
            <div ref={stageRef} className="absolute inset-0">
              <div
                className="absolute left-1/2 top-1/2"
                style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale, transform: "translate(-50%, -50%)" }}
              >
                <div
                  className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
                  style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}
                >
                <div key={scene.id} className="absolute inset-0">
                  <SceneView t={sceneLocal} duration={scene.duration} />
                </div>

                {/* Cut flash: a one-frame lift on light scenes, a short fade on dark ones. */}
                <div
                  className="pointer-events-none absolute inset-0 bg-white"
                  style={{ opacity: scene.tone === "light" ? Math.max(0, 1 - sceneLocal / 0.18) * 0.55 : 0 }}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    boxShadow: "inset 0 0 180px rgba(2,6,23,0.28)",
                    opacity: scene.tone === "dark" ? 0.8 : 0.35,
                  }}
                />

                {captions && scene.id !== "outro" && (
                  <div
                    className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2"
                    style={{
                      opacity: clamp01((sceneLocal - 0.35) / 0.35),
                      transform: `translate(-50%, ${(1 - clamp01((sceneLocal - 0.35) / 0.35)) * 10}px)`,
                    }}
                  >
                    <div className="flex items-center gap-3 rounded-lg bg-black/65 px-5 py-2.5 backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      <span className="text-[22px] font-medium tracking-tight text-white">{scene.narration}</span>
                    </div>
                  </div>
                )}

                <div
                  className={`pointer-events-none absolute left-8 top-7 flex items-center gap-3 ${
                    scene.tone === "dark" ? "text-white/45" : "text-slate-500/70"
                  }`}
                >
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] tracking-widest ${
                      scene.tone === "dark" ? "border-white/20" : "border-slate-400/40"
                    }`}
                  >
                    {scene.shot}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.26em]">{scene.title}</span>
                </div>
                </div>
              </div>
            </div>

            {!started && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05080f]/70 backdrop-blur-[2px]">
                <button
                  type="button"
                  onClick={play}
                  className="group flex flex-col items-center gap-5"
                  aria-label="播放宣传片"
                >
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_24px_70px_rgba(37,99,235,0.55)] transition group-hover:scale-105 group-active:scale-95">
                    <Play className="ml-1 h-10 w-10" fill="currentColor" />
                  </span>
                  <span className="text-center">
                    <span className="block text-[20px] font-semibold tracking-tight">播放宣传片</span>
                    <span className="mt-1 block text-[13px] text-white/45">
                      {formatTime(TOTAL_DURATION)} · BGM 由浏览器实时合成 · 建议开启声音
                    </span>
                  </span>
                </button>
              </div>
            )}

            {started && !playing && time >= TOTAL_DURATION - 0.05 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05080f]/70 backdrop-blur-[2px]">
                <button
                  type="button"
                  onClick={() => {
                    setClock(0);
                    play();
                  }}
                  className="flex flex-col items-center gap-4"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-gray-900 shadow-2xl transition hover:scale-105 active:scale-95">
                    <RotateCcw className="h-8 w-8" />
                  </span>
                  <span className="text-[17px] font-semibold">再看一遍</span>
                </button>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="border-t border-white/10 bg-[#0a0f1a] px-4 py-3">
            <div
              className="group relative h-6 cursor-pointer select-none"
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
              role="slider"
              aria-label="播放进度"
              aria-valuemin={0}
              aria-valuemax={Math.round(TOTAL_DURATION)}
              aria-valuenow={Math.round(time)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setClock(timeRef.current - 1);
                if (event.key === "ArrowRight") setClock(timeRef.current + 1);
              }}
            >
              <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/12" />
              <div
                className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
                style={{ width: `${progressRatio * 100}%` }}
              />
              {SCENES.map((entry, index) => (
                <span
                  key={entry.id}
                  className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 rounded bg-white/30"
                  style={{ left: `${(sceneStart(index) / TOTAL_DURATION) * 100}%` }}
                  title={`${entry.shot} ${entry.title}`}
                />
              ))}
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-[0_0_14px_rgba(37,99,235,0.8)] transition group-hover:scale-110"
                style={{ left: `${progressRatio * 100}%` }}
              />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 transition hover:scale-105 active:scale-95"
                aria-label={playing ? "暂停" : "播放"}
              >
                {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setClock(0);
                  if (playingRef.current) promoMusic.start(0);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="重新开始"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <span className="font-mono text-[12px] text-white/45">
                {formatTime(time)} <span className="text-white/20">/</span> {formatTime(TOTAL_DURATION)}
              </span>

              <div className="ml-2 hidden items-center gap-1 sm:flex">
                {SCENES.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => jumpToScene(index)}
                    title={`${entry.shot} · ${entry.title}`}
                    className={`h-7 rounded px-1.5 font-mono text-[11px] transition ${
                      index === sceneIndex
                        ? "bg-blue-600 text-white"
                        : "text-white/40 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    {entry.shot}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <span className="mr-1 hidden items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/40 md:flex">
                  <Music2 className="h-3.5 w-3.5" />
                  BGM 96 BPM · 本地合成
                  <span className="ml-1 flex h-3 items-end gap-[2px]">
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className="promo-eq w-[2px] rounded-sm bg-blue-400"
                        style={{
                          height: playing ? [6, 11, 8][bar] : 3,
                          animation: playing ? `promo-eq 900ms ease-in-out ${bar * 140}ms infinite alternate` : undefined,
                        }}
                      />
                    ))}
                  </span>
                </span>
                <TransportButton label={muted ? "打开声音" : "静音"} onClick={() => setMuted((value) => !value)}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </TransportButton>
                <TransportButton label={captions ? "关闭字幕" : "打开字幕"} onClick={() => setCaptions((value) => !value)}>
                  {captions ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
                </TransportButton>
                <TransportButton label={storyboardOpen ? "收起分镜" : "展开分镜"} onClick={() => setStoryboardOpen((value) => !value)}>
                  <span className="text-[11px] font-semibold">分镜</span>
                </TransportButton>
                <TransportButton label={fullscreen ? "退出全屏" : "全屏"} onClick={() => void toggleFullscreen()}>
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </TransportButton>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/30">
          <span>Space 播放 / 暂停</span>
          <span>← → 上一镜 / 下一镜</span>
          <span>M 静音</span>
          <span>C 字幕</span>
          <span>S 分镜</span>
          <span>F 全屏</span>
          <span>R 重播</span>
          <span className="ml-auto">建议使用耳机；BGM 与音效均由 Web Audio 实时合成</span>
        </div>

        {storyboardOpen && (
          <>
            <Storyboard
              activeIndex={sceneIndex}
              onSelect={jumpToScene}
            />
            <ProductionNotes />
          </>
        )}
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-5 text-[12px] text-white/35 sm:flex-row sm:items-center">
          <span className="font-medium text-white/60">EasyCPTrans · 产品宣传片</span>
          <span>11 个镜头 · {formatTime(TOTAL_DURATION)} · 网页实时演出</span>
          <a href="./index.html" className="sm:ml-auto hover:text-white">
            官网
          </a>
          <a href="https://github.com/minghf85/EasyCPTrans" target="_blank" rel="noreferrer" className="hover:text-white">
            GitHub
          </a>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-white/55 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function Storyboard({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-400">Storyboard</p>
          <h2 className="mt-1 text-[26px] font-semibold tracking-tight">分镜脚本</h2>
        </div>
        <p className="mb-1 text-[13px] text-white/40">
          {SCENES.length} 个镜头 · {formatTime(TOTAL_DURATION)} · 96 BPM · 点击任意镜头跳转
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SCENES.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`group overflow-hidden rounded-xl border p-4 text-left transition ${
              index === activeIndex
                ? "border-blue-500 bg-blue-500/10"
                : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold ${
                  index === activeIndex ? "bg-blue-600 text-white" : "bg-white/10 text-white/60"
                }`}
              >
                {entry.shot}
              </span>
              <span className="text-[14px] font-semibold text-white/90">{entry.title}</span>
              <span className="ml-auto font-mono text-[11px] text-white/30">{sceneRange(index)}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-white/55">{entry.visual}</p>
            <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px] leading-relaxed">
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 font-medium text-blue-300">剪辑</dt>
                <dd className="text-white/40">{entry.edit}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 font-medium text-cyan-300">声音</dt>
                <dd className="text-white/40">{entry.bgm}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 font-medium text-white/50">旁白</dt>
                <dd className="text-white/60">{entry.narration}</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductionNotes() {
  return (
    <section className="mt-12 grid gap-3 lg:grid-cols-3">
      <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-[15px] font-semibold">剪辑节奏</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          开场 8 秒建立问题，随后每 10–14 秒推进一个能力；三个场景镜头（填表、截图、隐私）保持在 10
          秒左右，让观众看清动作而不是只看转场。所有硬切都落在 96 BPM 的正拍上。
        </p>
      </article>
      <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-[15px] font-semibold">画面与转场</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          亮场与暗场交替：开场和收尾在深色舞台，功能段落在浅色桌面。切镜用 0.18 秒白闪，
          同场景内的节拍用卡片入场、幽灵芯片飞行和字段闪光来分句。
        </p>
      </article>
      <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-[15px] font-semibold">BGM 与音效</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          96 BPM，Am7–Fmaj7–Cmaj7–G6 四小节循环。Intro 只有 pad，功能段加入 kick / hat
          / bass，隐私段撤掉鼓组，收尾回到 pad。所有音符和音效都由 Web Audio 合成，页面不加载任何音频文件。
        </p>
      </article>
      <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-3">
        <h3 className="text-[15px] font-semibold">录制建议</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          需要导出成视频时，按 F 进入全屏，用 Win + G（Windows 游戏栏）或 OBS 录制播放器区域，
          开始播放后按 C 打开字幕即可。整支片子没有视频文件，画面由 DOM 实时绘制，暂停、拖动进度条都不会失步。
        </p>
      </article>
    </section>
  );
}

function ClipboardGlyphSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1.5" fill="currentColor" />
      <path d="M8.5 11h7M8.5 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
