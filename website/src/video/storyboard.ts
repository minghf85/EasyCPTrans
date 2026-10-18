/**
 * The promo film, as data.
 *
 * The page is a player, not a recording: every shot is a React scene whose
 * visuals are a pure function of the scene-local clock, so the timeline can be
 * paused, scrubbed, and replayed without losing sync. The storyboard below is
 * the single source of truth for both the player and the written shot list.
 */

export type SceneId =
  | "hook"
  | "summon"
  | "ui"
  | "paste"
  | "media"
  | "search"
  | "rules"
  | "ocr"
  | "queue"
  | "private"
  | "sync"
  | "outro";

export type SfxName =
  | "whoosh"
  | "pop"
  | "click"
  | "chime"
  | "lock"
  | "sync"
  | "riser";

export interface SfxCue {
  /** Seconds from the start of the shot. */
  at: number;
  name: SfxName;
}

export interface Scene {
  id: SceneId;
  /** Shot number shown in the storyboard and the corner slate. */
  shot: string;
  title: string;
  /** Seconds. */
  duration: number;
  /** Burned-in subtitle / voice-over line. */
  narration: string;
  /** What the audience sees, for the written storyboard. */
  visual: string;
  /** How the shot is cut and paced. */
  edit: string;
  /** Music section and sound design. */
  bgm: string;
  sfx: SfxCue[];
  /** Light or dark stage; drives the caption and slate colours. */
  tone: "light" | "dark";
}

export const SCENES: Scene[] = [
  {
    id: "hook",
    shot: "01",
    title: "开场 · 复制失忆",
    duration: 8,
    narration: "刚才复制的那段，还在吗？",
    visual:
      "深色背景，一页文档里刚复制的段落淡出、变成三个问号。Ctrl / Shift / V 三枚键帽落下，标题「复制过的，都在这里」压轴出现。",
    edit: "冷开场；文档虚焦 → 键帽特写 → 标题推近。段落消失与键帽落下都是硬切点，卡在 BGM 的弱拍上。",
    bgm: "Intro：低频 pad 铺底，第 2 秒加入 whoosh，标题落定时一记 chime。",
    sfx: [
      { at: 2.0, name: "whoosh" },
      { at: 3.4, name: "riser" },
      { at: 5.6, name: "chime" },
    ],
    tone: "dark",
  },
  {
    id: "summon",
    shot: "02",
    title: "唤出 · 一个快捷键",
    duration: 10,
    narration: "Ctrl + Shift + V —— 在任何应用里唤出。",
    visual:
      "桌面上的编辑器与浏览器退到背景，光标移到屏幕中央，三枚键帽被按下。面板在光标旁弹出，五张卡片依次滑入，选中环落到最新的一张上。",
    edit: "由暗转亮的第一镜。键帽按下 → 0.4 秒后面板弹出，卡片 120ms 错峰入场；结尾光标已经开始向下一镜的卡片移动，形成动作接动作。",
    bgm: "Intro 尾段：pad 打开低通，kick 进入，whoosh 与面板同时出现。",
    sfx: [
      { at: 2.0, name: "click" },
      { at: 2.4, name: "whoosh" },
      { at: 2.9, name: "pop" },
    ],
    tone: "light",
  },
  {
    id: "ui",
    shot: "03",
    title: "界面 · 鼠标与滚轮",
    duration: 12,
    narration: "导航栏、卡片带、元数据和正文都能滚；鼠标移过，卡片会跟着倾斜。",
    visual:
      "面板定场。光标扫过一张卡片，卡片轻微 3D 倾斜并出现选中环；滚轮把正文向下卷动，再在底部 metadata 行横向滚动标签；随后卡片带整体横向切换，最后点击导航栏右箭头让标签栏滚动。",
    edit:
      "五个连续动作各占约 2 秒，镜头不动，只让光标和滚动容器动；每个动作在画面下方标出当前操作，最后 2 秒把光标移回卡片，接下一镜的点击。",
    bgm: "Flow：鼓组保持，滚动段只留 hat，避免盖住界面反馈音。",
    sfx: [
      { at: 2.2, name: "click" },
      { at: 6.2, name: "click" },
      { at: 8.2, name: "click" },
    ],
    tone: "light",
  },
  {
    id: "paste",
    shot: "04",
    title: "粘贴 · 回到原来的窗口",
    duration: 12,
    narration: "点一下卡片，内容就贴回刚才的窗口。",
    visual:
      "编辑器铺满背景，面板浮在右下。光标点中一张 issue 卡片，卡片被蓝色选中环扣住；一小块内容幽灵飞向编辑器插入点，带高亮的段落随后出现在文档里。",
    edit: "点击瞬间做 1.06 倍推近，幽灵飞行用 0.6 秒曲线运动；落字用两次高亮扫过，最后面板下移退出，把画面让给结果。",
    bgm: "Flow 主段：96 BPM 的 kick + hat 稳定推进，落字处一记 pop。",
    sfx: [
      { at: 2.6, name: "click" },
      { at: 3.0, name: "pop" },
      { at: 3.9, name: "chime" },
    ],
    tone: "light",
  },
  {
    id: "media",
    shot: "05",
    title: "图片与文件 · 收得下，也拖得出",
    duration: 12,
    narration: "截图、多选文件自动收好；按住卡片，直接拖进别的程序。",
    visual:
      "三个快速节拍：截图选区罩住仪表盘并闪光 → 图片卡片落入面板；资源管理器里三个文件被框选 → 文件卡片出现；光标拖起图片卡片，幽灵芯片飞向资源管理器并落成一个文件。",
    edit: "三段等长节拍（各 4 秒），每段用一次白闪做分句；拖拽段用跟随光标的幽灵芯片保持方向感。",
    bgm: "Flow 继续，hat 加密；截图闪光与文件落地各配一记 pop。",
    sfx: [
      { at: 3.2, name: "pop" },
      { at: 6.6, name: "pop" },
      { at: 7.6, name: "whoosh" },
      { at: 10.2, name: "click" },
    ],
    tone: "light",
  },
  {
    id: "search",
    shot: "06",
    title: "搜索 · 会读语法",
    duration: 14,
    narration: "app:code tag:work PROJ —— 搜索框、标签栏和卡片会一起收窄。",
    visual:
      "搜索框从导航栏展开，逐字打出语法；结果计数从 58 掉到 1，卡片带同步收窄；随后标签栏右移，点开 Tags 展开多标签 AND 选择，两个标签同时亮起。",
    edit:
      "打字是这一镜的节拍器：每完成一个字段，结果计数跳一次。第 9 秒清空搜索时做一次 180ms 的横向甩镜，切到标签筛选；标签栏同时滚到 Tags 位置。",
    bgm: "Flow 主段保持，去掉 kick 留下 hat，让打字声和计数更清楚。",
    sfx: [{ at: 1.2, name: "click" }],
    tone: "light",
  },
  {
    id: "rules",
    shot: "07",
    title: "规则标签 · 自动打标与文字拖拽",
    duration: 12,
    narration: "给标签写一条正则，匹配到的文字可以直接拖出来。",
    visual:
      "右侧 Tag Admin 抽屉展开，规则 [A-Z]+-\\d+ 逐字输入，试跑区把 PROJ-128…PROJ-277 依次高亮。左侧卡片展开真实的 #issue 匹配堆叠，拖出第一枚文字芯片到卡片带，生成一张新卡。",
    edit:
      "左侧卡片带与右侧抽屉同框，视线从右往左；3 秒展开匹配堆叠，5 秒开始拖拽文字芯片，9 秒新卡弹出。文字匹配项是应用里真正可拖拽的对象。",
    bgm: "Flow 尾段，pad 稍亮；试跑命中时加一层轻 pluck 琶音。",
    sfx: [
      { at: 3.0, name: "pop" },
      { at: 5.0, name: "click" },
      { at: 9.0, name: "chime" },
    ],
    tone: "light",
  },
  {
    id: "ocr",
    shot: "08",
    title: "OCR 与划词翻译",
    duration: 14,
    narration: "截图里的字能搜、能复制；选中的词，Alt + C 就能译。",
    visual:
      "左半屏：图片卡片上扫描线自上而下，右侧 OCR 文本框逐行出现，字数徽标跳到 128。右半屏：编辑器里 ubiquitous 被选中，Alt + C 键帽按下，翻译卡片带着音标和释义滑入。",
    edit: "左右分屏对切：0–6 秒给 OCR，6–7 秒用扫描线扫过整个画面完成转场，7–14 秒给翻译。",
    bgm: "Feature 段：加入 bass 与 snare，音色更满；识别完成一记 chime，翻译落地再用一次高音。",
    sfx: [
      { at: 4.2, name: "chime" },
      { at: 6.0, name: "whoosh" },
      { at: 7.0, name: "pop" },
    ],
    tone: "light",
  },
  {
    id: "queue",
    shot: "09",
    title: "队列粘贴 · 把表单一次填完",
    duration: 10,
    narration: "Space 排队，Ctrl + Alt + V 逐条粘贴。",
    visual:
      "左侧表单有四个空字段和提交按钮；底部三张卡片被 Space 依次加上 Q1 / Q2 / Q3。随后队列快捷键连按三次，字段从左到右被填满，进度停在 3 / 3。",
    edit: "严格的三拍结构：Q1/Q2/Q3 各一拍，填入各一拍。每次粘贴用一次 120ms 的字段闪光，节奏与 BGM 的 4/4 对齐。",
    bgm: "Feature 段继续；入队用 click，填入用 pop，三次落点都在正拍。",
    sfx: [
      { at: 1.2, name: "click" },
      { at: 2.4, name: "click" },
      { at: 3.6, name: "click" },
      { at: 5.2, name: "pop" },
      { at: 6.6, name: "pop" },
      { at: 8.0, name: "pop" },
    ],
    tone: "light",
  },
  {
    id: "private",
    shot: "10",
    title: "私密 · 真加密，不上云",
    duration: 10,
    narration: "敏感内容一条命令上锁；密码和明文都不离开本机。",
    visual:
      "右键菜单在卡片上展开，「设为私密 M」被选中。卡片内容进入模糊与锁形状态，密码框浮起，六个圆点依次填入；AES-GCM / Argon2 / 本地存储三枚徽标落位。",
    edit: "这一镜整体放慢：右键菜单停留 1.2 秒，上锁用 0.5 秒的模糊与降饱和，徽标最后一枚落下时画面短暂静止。",
    bgm: "Focus 段：鼓组撤掉，只留低频 pad 与心跳般的 sub；上锁时一记低沉的 lock 音。",
    sfx: [
      { at: 1.2, name: "click" },
      { at: 2.6, name: "lock" },
      { at: 6.0, name: "chime" },
    ],
    tone: "light",
  },
  {
    id: "sync",
    shot: "11",
    title: "同步 · 换台电脑也接得上",
    duration: 10,
    narration: "WebDAV 或局域网配对，每条记录都带着来源设备。",
    visual:
      "左右两台设备框相对，中间一条虚线弧，光点往返移动。WebDAV 云图标与 mDNS 配对码悬浮在上方；两边面板同时出现带 Office-PC / Laptop 标签的卡片，同步计数走到 12。",
    edit: "对称构图；光点每 1.5 秒走一趟，卡片在每趟到达时出现一张。结尾两台设备向中间轻推 20px，把视线交给下一镜的标题。",
    bgm: "Sync 段：琶音加宽、加入高频 shimmer；每趟同步一记轻 sync 音。",
    sfx: [
      { at: 2.0, name: "sync" },
      { at: 6.5, name: "chime" },
    ],
    tone: "light",
  },
  {
    id: "outro",
    shot: "12",
    title: "收尾 · 下载",
    duration: 10,
    narration: "复制过的，都在这里。",
    visual:
      "回到深色舞台，快捷键矩阵快速闪过后收成 Logo 与标语。下载按钮、MIT 许可与 GitHub 地址依次落位，最后画面停在完整的品牌锁版。",
    edit: "0–2 秒用前几镜的卡片剪影做三帧闪回；2 秒后所有元素向中心收拢，品牌锁版保持 3 秒，方便截取封面。",
    bgm: "Outro：鼓组退出，pad 回到开场和弦，最后一个长音留 2 秒自然衰减。",
    sfx: [
      { at: 0.2, name: "riser" },
      { at: 2.5, name: "chime" },
    ],
    tone: "dark",
  },
];

export const TOTAL_DURATION = SCENES.reduce((sum, scene) => sum + scene.duration, 0);

/** Start time of a shot, in seconds. */
export function sceneStart(index: number): number {
  let start = 0;
  for (let i = 0; i < index && i < SCENES.length; i += 1) {
    start += SCENES[i].duration;
  }
  return start;
}

/** Which shot contains `time`, clamped to the last shot at the very end. */
export function sceneIndexAt(time: number): number {
  let start = 0;
  for (let i = 0; i < SCENES.length; i += 1) {
    const end = start + SCENES[i].duration;
    if (time < end) return i;
    start = end;
  }
  return SCENES.length - 1;
}

/** `m:ss`, used by the player and the storyboard timecodes. */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.min(TOTAL_DURATION, seconds));
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** `mm:ss – mm:ss`, the range shown on each storyboard card. */
export function sceneRange(index: number): string {
  const start = sceneStart(index);
  return `${formatTime(start)} – ${formatTime(start + SCENES[index].duration)}`;
}
