# EasyCPTrans Technology

面向版本：`0.2.0`

本文面向二次开发，说明 EasyCPTrans 的项目结构、核心模块、Tauri 接口、事件流、数据模型和扩展点。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- 后端：Rust
- 数据库：SQLite，后端使用 `sqlx`
- 剪切板：`tauri-plugin-clipboard-x`
- 全局快捷键：`tauri-plugin-global-shortcut`
- 自动化粘贴：`enigo`
- 隐私加密：`aes-gcm`、`argon2`

## 目录结构

```text
EasyCPTrans/
├─ src/
│  ├─ App.tsx                         # 主应用、Tab、快捷键、筛选、卡片渲染
│  ├─ App.css                         # 全局样式（滚动条、动画、reduced-motion）
│  ├─ components/
│  │  ├─ ui.ts                         # 唯一的样式 token 出口（Corporate Clean）
│  │  ├─ ClipboardCard.tsx             # 历史 item 卡片
│  │  ├─ RegexMatchStack.tsx           # 正则标签匹配项的堆叠与溢出面板
│  │  ├─ ImageLightbox.tsx             # 图片放大查看
│  │  ├─ SettingsModal.tsx             # 设置页
│  │  ├─ TagManagementPage.tsx         # Tag Admin（含正则规则编辑）
│  │  ├─ QuickTextEditorPage.tsx       # 文本快速编辑
│  │  └─ ...
│  ├─ hooks/
│  │  ├─ useClipboardWatcher.ts        # 剪切板监听、堆叠、去重抑制
│  │  ├─ useCardGesture.ts             # 整卡手势：点击激活 / 位移拖出
│  │  └─ useHistory.ts                 # 历史加载与事件刷新
│  ├─ lib/
│  │  ├─ api.ts                        # Tauri invoke API 封装
│  │  ├─ appIcons.ts                   # 来源程序图标缓存（RGBA → data URL）
│  │  ├─ brandColor.ts                 # 来源程序主色（图标取色 + 哈希兜底）
│  │  ├─ cardInteraction.ts            # 卡片手势的决策层（纯函数，可单测）
│  │  ├─ dragChip.ts                   # 拖拽预览图（canvas 绘制 → RGBA）
│  │  ├─ dragGesture.ts                # 拖出阈值判定（纯函数）
│  │  ├─ dropStage.ts                  # 拖出用的临时图片预热与缓存
│  │  ├─ menuPlacement.ts              # 弹出层翻转/夹紧（纯函数）
│  │  ├─ fileIcons.ts                  # 扩展名 → 文件类型图标与配色
│  │  ├─ tagMatches.ts                 # 解析正则标签的匹配元数据
│  │  ├─ windowFocus.ts                # 失焦是否该隐藏面板（纯函数）
│  │  ├─ filter.ts                     # 搜索与多 Tag 筛选
│  │  ├─ i18n.ts                       # zh-CN / zh-TW / en 文案
│  │  └─ time.ts                       # 模糊时间格式化
│  ├─ test/
│  │  └─ items.ts                      # 测试用的 HistoryItem 工厂
│  └─ types.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ app_icon.rs                   # 前台窗口信息与来源程序图标提取
│  │  ├─ drag_out.rs                   # 原生 OLE 拖拽源（拖到其他程序）
│  │  ├─ focus.rs                      # 粘贴前的焦点交接（记住上一前台窗口）
│  │  ├─ commands.rs                   # Tauri 命令、配置、历史、翻译、隐私
│  │  ├─ db.rs                         # SQLite 初始化、hash、迁移
│  │  ├─ lib.rs                        # Tauri 初始化、窗口、托盘、invoke handler
│  │  ├─ shortcuts.rs                  # 全局快捷键与后端快捷粘贴
│  │  ├─ sync.rs                       # WebDAV 同步
│  │  ├─ privacy.rs                    # private item 加密
│  │  └─ pipeline/                     # 入库 pipeline
│  │     ├─ tag_rules.rs               # 用户自定义正则标签
│  │     └─ ...
│  ├─ capabilities/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ README.md
├─ TransTech.md
└─ Technology.md
```

## 数据模型

核心表：`clipboard_items`

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `content_type` | `text` / `image` / `file` |
| `content_hash` | 内容 hash，用于去重 |
| `preview_text` | 文本预览或摘要 |
| `storage_path` | 图片 data URL、文件路径列表或非文本内容 |
| `metadata` | JSON 字符串，前端解析为 `Record<string, string[]>` |
| `tags` | JSON 字符串数组 |
| `use_count` | 使用次数 |
| `is_pinned` | 是否置顶 |
| `is_private` | 是否私密 |
| `encrypted_content` | private item 加密内容 |
| `created_at` / `last_used_at` | 创建与排序时间 |

默认排序：

```sql
ORDER BY is_pinned DESC, last_used_at DESC, id DESC
```

新 pin 的 item 会进入 pinned 分组最前面；取消 pin 后进入非 pinned 分组最新位置。

### metadata 键

`metadata` 是扁平的 `Record<string, string[]>`，所有值都是字符串数组。

| 键 | 说明 |
| --- | --- |
| `sourceApp` | 前台窗口标题，例如 `notes.txt - Notepad` |
| `appName` | 前台进程可执行文件名（不含扩展名），用于来源图标与兜底字母块 |
| `appPath` | 前台进程可执行文件完整路径，同时是图标缓存键 |
| `length` | 文本长度 |
| `size` / `totalSize` / `sizes` | 图片字节数 / 文件总大小 / 逐文件大小（按行下标对应） |
| `width` / `height` | 图片尺寸 |
| `language` | 代码语言 |
| `ocrText` / `ocrLanguage` / `ocrLanguageName` | OCR 结果与语言 |
| `translationStatus` / `wordQuery` | 翻译状态与查询词 |
| `urls` / `emails` / `phones` | 内置 `RegexExtractor` 的抽取结果 |
| `tagMatch:<标签名>` | 该正则标签抽取到的匹配项（最多 100 条） |
| `tagMatchTotal:<标签名>` | 截断前的匹配总数 |

`appName` / `appPath` 由 `useClipboardWatcher` 在入库前写入，后端不感知它们的语义。

`commands` 这个键已随「常用命令」功能一起移除（`command_extract` 提取阶段、`frequent_commands`
表、`get_frequent_commands`、设置页那一栏，以及 `Command` 功能标签）。**历史数据没有动**：
老 item 的 `commands` metadata 和 `Command` 标签都还在，新 item 不再写入。注意一个隐式后果——
metadata 是自由文本搜索的来源之一，所以**新 item 不再能靠自由文本搜到命令行内容**，老的还能。

## 标签模型

标签分三类：

- 系统标签：`Text`、`Image`、`File`、`Pinned`
- 功能标签：`Word`、`Private`、设备名
- 用户标签：用户在 Tag Admin 创建的自定义 Tag

### Tag Admin

Tag Admin 管理的是 `managedTags` 配置：

- 系统标签不可删除
- 系统标签一般不可重命名
- 设备名标签可重命名，并会同步迁移历史 item 中的设备标签
- 用户标签可创建、删除、重命名、改颜色、设置是否常驻顶部栏

### 正则规则标签

用户标签可以附带一条正则表达式，从而变成**规则标签**：任何内容匹配的 item 入库时自动打上该标签。

配置字段（`ManagedTagConfig`）：

| 字段 | 说明 |
| --- | --- |
| `pattern` | 正则源码。为空表示普通标签，不参与自动打标 |
| `ignoreCase` | 是否忽略大小写（编译时加 `(?i)` 前缀） |
| `extract` | 是否把每个匹配项写入 metadata，供卡片展开为堆叠 |

执行位置：`src-tauri/src/pipeline/tag_rules.rs` 的 `TagRuleExtractor`，由
`Pipeline::with_tag_rules()` 追加在默认链最后，因此可以复用前面阶段写入的 tags / metadata。

扫描范围：

- `text` item：正文
- `file` item：换行拼接的路径列表（因此 `\.pdf$` 可以给一批 PDF 打标）
- `image` item：不扫描。图片的可搜索文本要等 OCR 之后才有

匹配结果写入 `tagMatch:<标签名>`，最多保留 100 条（去重、保持首次出现顺序），
总数写入 `tagMatchTotal:<标签名>`。

注意：使用的是 Rust `regex` crate，**不支持 lookaround 和反向引用**。
`validate_tag_pattern` 命令用同一套编译逻辑校验，因此编辑器里能通过的正则，
入库时一定能编译。

前端呈现：`src/components/RegexMatchStack.tsx`。卡片上出现扇形堆叠徽标，
点击在卡片内展开；超过 8 条时折叠为「查看全部」浮层。每一条都可以拖拽：

- 拖到卡片区（`#card-scroll`）→ 调 `create_stack_text_item` 生成新卡片
- 拖到搜索框或应用外 → 以纯文本落地

拖拽载荷同时写入自定义 MIME `application/x-eacptrans-text` 与 `text/plain`，
`App.tsx` 优先读前者。

### 多 Tag 筛选

`Tags` Tab 使用 `src/lib/filter.ts`：

- 点击 `Tags` 展开全部已有 Tag
- 多选 Tag 使用 AND 逻辑，即 item 必须同时满足所有选中 Tag
- `Text / Image / File` 按 `contentType` 匹配
- `Pinned` 按 `is_pinned` 匹配
- `Private` 按 `is_private` 匹配
- 普通 Tag 按 `item.tags` 匹配

### 时间范围搜索

搜索解析同样位于 `src/lib/filter.ts`。

支持字段：

- `after:` / `since:`：开始时间
- `before:` / `until:`：结束时间
- `date:`：日期或日期范围
- `time:`：具体时间或具体时间范围
- `created:`：等价于按创建时间范围筛选

示例：

```text
date:2026-07-25
date:2026-07-01..2026-07-25
date:2026-07-01..
date:..2026-07-25
time:"2026-07-25 09:00..2026-07-25 18:30"
time:2026-07-25T09:00..2026-07-25T18:30
```

实现规则：

- `date:YYYY-MM-DD` 会展开为当天完整范围
- 带具体时间的值按精确时间戳处理
- 范围分隔符支持 `..` 和 `~`
- 搜索条件最终合并到 `ParsedSearchQuery.after` / `ParsedSearchQuery.before`
- 多个时间条件同时存在时取交集

## 前端 API 封装

主要封装位于 `src/lib/api.ts`。

常用接口：

| 方法 | 后端命令 | 说明 |
| --- | --- | --- |
| `loadHistory(limit)` | `load_history` | 加载历史 item |
| `ingest(...)` | `ingest_clipboard` | 将剪切板内容写入历史 |
| `getTextItem(id)` | `get_text_item` | 获取文本 item 完整内容 |
| `togglePin(id)` | `toggle_pin` | pin / unpin item |
| `deleteItem(id)` | `delete_item` | 删除 item |
| `setTags(id, tags)` | `set_tags` | 更新 item 标签 |
| `renameDeviceTag(from, to)` | `rename_device_tag` | 重命名设备标签并迁移历史 |
| `protectItem(id)` | `protect_item` | 设置 private |
| `unprotectItem(id, password)` | `unprotect_item` | 取消 private |
| `updateTextItem(id, content)` | `update_text_item` | 更新文本 item |
| `translateSelectedText()` | `translate_selected_text` | 触发划词翻译 |
| `convertEcdictCsvToSqlite(csv, db)` | `convert_ecdict_csv_to_sqlite` | 转换 ECDICT CSV |
| `getConfig()` | `get_config` | 读取配置 |
| `setConfig(config)` | `set_config` | 保存配置 |
| `refreshGlobalShortcuts()` | `refresh_global_shortcuts` | 重新注册全局快捷键 |
| `probeShortcutAvailable(shortcut)` | `probe_shortcut_available` | 检测快捷键可用性 |
| `syncQueueState(ids)` | `sync_queue_state` | 同步队列状态到后端 |
| `getActiveWindowInfo()` | `get_active_window_info` | 前台窗口标题 + 可执行文件名/路径 |
| `getAppIcon(appPath)` | `get_app_icon` | 来源程序图标（原始 RGBA） |
| `startDragOut(payload)` | `start_drag_out` | 发起原生拖拽，拖到其他程序 |
| `stageImageForDrag(id)` | `stage_image_for_drag` | 按 id 落一份临时图片，供拖出使用 |
| `pasteToPreviousWindow(hidePanel)` | `paste_to_previous_window` | 交还焦点并发送 Ctrl+V |
| `validateTagPattern(pattern, ignoreCase)` | `validate_tag_pattern` | 保存前校验正则 |

## 后端命令分组

### 历史与入库

文件：`src-tauri/src/commands.rs`

- `ingest_clipboard`
- `load_history`
- `delete_item`
- `update_text_item`
- `set_tags`
- `toggle_pin`

**剪切板内容的分类**（`src/lib/clipboardPayload.ts`，纯函数带单测）——顺序是有意义的：
**位图 > 单个图片文件 > 文件列表 > 文本**。Windows 复制图片时会同时给出位图和它落地的路径，
以前文件列表排在前面，于是**每一张复制的图片都被存成了 `file`**（卡片显示路径而不是图片）。
现在的规则是：

| 剪切板里有 | 分类 |
| --- | --- |
| 位图（哪怕同时还带着路径） | `image` |
| 只有一个路径，且扩展名是 png/jpg/jpeg/gif/bmp/webp | `image`（读文件当图片） |
| 多个路径 | `file`（**不把图片摘出去**——摘掉就等于少存用户复制的一部分） |
| 只有文本 | `text` |

单个图片文件走图片分支时，尺寸由前端解码量出来（剪切板没报尺寸）；万一读不出像素
（格式没覆盖、文件被锁），**退回 file 存路径**，不会把这次复制丢掉。

入库流程：

1. 前端 watcher 读取系统剪切板
2. 调用 `api.ingest(...)`
3. 后端构造 `ClipboardItem`
4. 经过 `Pipeline::default()`
5. 计算 hash
6. hash 命中时更新旧 item 的 metadata / tags / use_count
7. 未命中时插入新 item
8. 后端发出 `clipboard-changed`
9. 前端 `useHistory` 收到事件后 reload

### 快捷键

文件：`src-tauri/src/shortcuts.rs`

主要动作：

- `TogglePanel`
- `QuickPaste`
- `QueueStep`
- `StackMode`
- `TranslateSelection`

快捷索引粘贴流程：

1. 后端收到 `Ctrl + Shift + 1~9/0`
2. 按当前排序加载对应 item
3. 通知前端 watcher 暂停自动入库
4. 将 item 写入系统剪切板
5. 等待快捷键修饰键释放
6. 模拟 `Ctrl + V`
7. 不调用 `mark_item_used`，因此不改变 item 顺序

### 划词翻译

文件：`src-tauri/src/commands.rs`

关键函数：

- `translate_selected_text_impl`
- `lookup_ecdict`
- `lookup_ecdict_sqlite`
- `create_translation_item`
- `update_translation_item`

流程：

1. 全局快捷键 `Alt + C`
2. 后端模拟 `Ctrl + C`
3. 读取剪切板文本并校验为单词或短语
4. 创建一个 pending text item
5. tags 包含 `Word`
6. metadata 包含 `translationStatus` 和 `wordQuery`
7. 弹出主窗口
8. 查询 ECDICT SQLite
9. 更新同一个 item 为翻译结果
10. 将翻译结果写回系统剪切板

### 隐私

文件：

- `src-tauri/src/privacy.rs`
- `src-tauri/src/commands.rs`

核心命令：

- `set_privacy_password`
- `protect_item`
- `unprotect_item`
- `get_privacy_status`

private item 会清空明文 `preview_text / storage_path / content_hash`，内容写入 `encrypted_content`。

### 拖拽与来源程序

文件：

- `src-tauri/src/drag_out.rs`
- `src-tauri/src/app_icon.rs`

命令：

- `start_drag_out(payload)`：`payload` 为 `{ text?, files? }`
- `get_active_window_info()`：返回 `{ title, appName, appPath }`
- `get_app_icon(appPath)`：返回 `{ width, height, rgba }` 或 `null`

#### 拖到应用外

Tauri 2 没有内容拖出 API（`start_dragging()` 只能拖窗口），所以拖拽直接走 OLE：
`drag_out.rs` 用 `#[implement]` 提供 `IDataObject` 与 `IDropSource`，再调用 `DoDragDrop`。

携带的剪贴板格式：

| item 类型 | 格式 |
| --- | --- |
| text | `CF_UNICODETEXT` |
| file | `CF_HDROP`（原始路径）+ `"Preferred DropEffect"` |
| image | `CF_HDROP`（指向预热的临时 PNG）+ `"Preferred DropEffect"` |

三条硬性约束，改动时必须保持：

1. **只提供 `DROPEFFECT_COPY`。** 剪贴板管理器永远不能把用户的原文件搬走。
   `"Preferred DropEffect"`（`RegisterClipboardFormatW` 动态注册，见 `Cargo.toml` 的
   `Win32_System_DataExchange` feature）用同样的语义告诉 Explorer / Chromium 该走复制。
2. **不能让拖拽循环在鼠标松开之后才开始。** 前端因此有两道保护：整卡手势走
   `useCardGesture` 的位移阈值（`dragGesture.ts`，≥5px 才算拖），图片卡在进入视口时
   就调用 `stage_image_for_drag` 预热临时文件（`dropStage.ts`），把发起前的 IPC 从 3 次
   压到 1 次。
3. **`IDataObject` 的返回值要守 OLE 约定。** `GetCanonicalFormatEtc` 命中支持格式时必须
   填出参并返回 `DATA_S_SAMEFORMATETC`（windows crate 里没有这个常量，在 `drag_out.rs`
   里自定义），否则 Chromium 这类先做 canonical 化再取数的宿主会认为「无内容可提供」；
   `EnumFormatEtc` 对非 `DATADIR_GET` 返回 `E_NOTIMPL` 而不是 `DV_E_FORMATETC`。

**拖拽预览图**用 OLE 的 `IDragSourceHelper`（`CLSID_DragDropHelper`）：前端把卡片画成一张
296×64 的「芯片」——品牌色竖条 + 图标磁贴 + 来源名 + 内容摘要 + 类型徽标——放进 canvas，
以**原始 RGBA + base64** 传给 Rust（`dragChip.ts`；项目里没有图片解码器，而 OLE 要的是
`HBITMAP`）。Rust 侧把它转成预乘 alpha 的 BGRA（`premultiplied_bgra`，不预乘圆角会有一圈
亮边）、建成 top-down 32bpp DIB，`crColorKey` 用 `CLR_NONE` 表示走 alpha 通道。
`DoDragDrop` 之前还要在同一个 STA 线程上完成这些，别把位图创建挪到别处。

**芯片在 hover 时才渲染**（`warmDragChip`，按 payload 签名缓存最多 24 张）。这一点是硬性的：
早期版本在卡片挂载时就画，于是每次切 tag、翻页、改筛选都要为五十张卡各跑一次 canvas +
`getImageData` + base64，直接造成上百毫秒的卡顿。拖动只能从已经停在卡片上的指针开始，所以
hover 预热总是赶得上；构建失败只让这一次拖动退回系统默认反馈，不影响拖拽本身。

面板浮在光标旁边，所以**理论上**它可能挡住想放的窗口——为这个加的
`setIgnoreCursorEvents(true)` 已经撤掉：它在拖拽循环刚开始、OLE 正在做自己的窗口判定时生效，
风险大于收益，而问题本身没有实测确认。要再试的话，必须先在真机上验证拖拽本身没问题。

拖拽结束后 `App.tsx` 会看结果：`none`（拖了但没有任何程序接收）会给出提示——以前这种情况
**完全没有反馈**，和「拖拽根本没启动」看起来一模一样。Rust 侧仍有那行
`[EasyCPTrans] Drag-out finished: kind=… effect=… outcome=…`。

`DoDragDrop` 会阻塞到拖放结束，因此在专用线程上跑（`OleInitialize` 需要单线程套间），
命令内用 `spawn_blocking` + `std::thread::spawn` 包装。结束时打一行
`[EasyCPTrans] Drag-out finished: … effect=… outcome=…`，拖拽「没反应」时先看这行。

前端触发点是**整张卡片**（`<article>` 上的 `useCardGesture`）。因为拖拽期间指针会离开窗口，
`App.tsx` 会先调 `markTransientWindowInteraction(20000)` 抑制失焦自动隐藏。

行为边界（哪些目标本质上收不了）：

| item 类型 | 文本框 | `<input type=file>` | 资源管理器 | 图片字段 |
| --- | --- | --- | --- | --- |
| text | ✅ | ❌ 语义上就不该成功 | ❌ | ❌ |
| file | ⚠️ 视宿主 | ✅ | ✅ | ❌ |
| image | ⚠️ 视宿主 | ✅ | ✅ | ❌ 需要 `CF_PNG`/`CF_DIB`，暂未提供 |

#### 应用内拖拽

匹配项拖到卡片区生成新卡片走的是 HTML5 拖拽。Tauri 默认把文件拖放交给原生层处理，
这会**屏蔽 WebView2 里所有 DOM 拖拽事件**，所以窗口必须关掉它：

- `tauri.conf.json` → `app.windows[0].dragDropEnabled = false`
- `lib.rs` 的 `create_main_window` 里同样设置一次（窗口是运行时构建的）

代价是应用不再接收系统文件拖入——本项目未使用该能力。

#### 来源程序图标

`get_active_window_info` 用 `GetForegroundWindow` + `GetWindowThreadProcessId` +
`QueryFullProcessImageNameW` 拿到可执行文件路径。`get_app_icon` 再用
`SHGetFileInfoW` 取 `HICON`，`DrawIconEx` 画进 32bpp DIB，`GetDIBits` 读回像素。

返回原始 RGBA 而不是 PNG，是为了不在 Rust 侧引入图像编码依赖——前端
`src/lib/appIcons.ts` 用 canvas 转成 data URL，并按 exe 路径做 LRU 缓存。
没有图标（或读取失败）时，卡片按进程名生成一个固定色相的渐变字母块。

### 图片放大查看

`src/components/ImageLightbox.tsx`：滚轮围绕光标缩放、拖拽平移、双击在 100% 与适应之间
切换。卡片上点击已加载的图片会打开它（私有图片和加载失败的仍维持点击粘贴）。

`wheel` 监听用原生 `addEventListener` 并显式 `{ passive: false }`，因为 React 的
`onWheel` 是被动监听，无法 `preventDefault`。

## 前端事件

| 事件 | 发送方 | 接收方 | 说明 |
| --- | --- | --- | --- |
| `clipboard-changed` | 后端 | `useHistory` | 历史数据变化后刷新 |
| `eacptrans://queue-updated` | 后端 | `App.tsx` | 队列出队后同步前端 |
| `eacptrans://stack-mode` | 后端 | `useClipboardWatcher` | 开启堆叠复制 |
| `eacptrans://stack-reset` | 后端 | `useClipboardWatcher` | 关闭堆叠复制 |
| `eacptrans://translation-state` | 后端 | `useClipboardWatcher` | 翻译期间抑制重复入库 |
| `eacptrans://clipboard-override` | 后端 | `useClipboardWatcher` | 程序主动写剪切板时抑制重复入库 |

## 配置模型

后端配置结构：`AppConfig`，位于 `src-tauri/src/commands.rs`。默认值只有一个出处：
`impl Default for AppConfig`（加字段时改那里，`read_app_config` 与 `sync::parse_config`
都直接用它，不要再手抄一份字面量——那正是以前「加了字段却只在两处有默认值」的来源）。

常用字段：

- `shortcut`
- `queueStepShortcut`
- `quickPastePrefix`
- `stackShortcutPrefix`
- `wordTranslateShortcut`
- `itemTagShortcut`
- `itemPrivateShortcut`
- `itemPinShortcut`
- `itemDeleteShortcut`
- `itemOcrShortcut`
- `itemZoomShortcut`
- `ecdictPath`
- `locale`
- `pageSize`
- `historyLimit`
- `managedTags`
- `webdavUrl`
- `webdavUsername`
- `webdavSyncEnabled`
- `deviceName`

### managedTags

`managedTags` 是 `ManagedTagConfig` 数组，字段见「正则规则标签」一节
（`id` / `name` / `common` / `color` / `system` / `pattern` / `ignoreCase` / `extract`）。

新增字段时要同步四处，否则配置会在往返中丢失：

1. `AppConfig`（`commands.rs`）
2. `ConfigResponse` 与 `get_config` 里的逐字段构造
3. `PartialAppConfig` 与 `set_config` 里的 `if let Some` 合并链
4. `normalize_managed_tags`（它逐字段重建结构体）

前端还有第五处：`App.tsx` 的 `sanitizeManagedTags` 同样逐字段重建，
每次改标签（颜色、常驻、重命名）都会经过它——漏字段就会被静默清空。

`normalize_managed_tags` 与 `normalize_tag_pattern` 会把「没有 pattern 却开了 extract」
这类组合归一化掉。

设置保存流程：

1. 用户在设置页修改配置
2. 再次点击 `Settings` Tab
3. 前端调用 `set_config`
4. 前端调用 `refresh_global_shortcuts`
5. 保存期间 Tab icon 显示 spinner
6. 成功后 Tab icon 变为 check

## i18n

文件：`src/lib/i18n.ts`

支持：

- `zh-CN`
- `zh-TW`
- `en`

注意：

- `Text / Image / File / Pinned` 固定显示英文
- 设置页、Tag Admin、主导航和主要状态提示使用 `tr(locale, key)`
- 新增 UI 文案应优先加入 `i18n.ts`，避免继续写死在组件中

## 扩展点

### 新增剪切板类型

1. 扩展 `ClipboardItem.content_type`
2. 在 `useClipboardWatcher` 中读取新类型
3. 在 `ingest_clipboard` 中写入 `preview_text` 或 `storage_path`
4. 在 `ClipboardCard` 中增加渲染分支
5. 在快捷粘贴写剪切板逻辑中增加输出方式

### 新增 pipeline 处理器

位置：`src-tauri/src/pipeline/`

实现 `Interceptor`：

```rust
impl Interceptor for MyInterceptor {
    fn name(&self) -> &'static str {
        "my-interceptor"
    }

    fn intercept(&self, item: &mut ClipboardItem) -> InterceptResult {
        InterceptResult::Continue
    }
}
```

然后在 `Pipeline::default()` 中加入（当前链是 `SecurityFilter` → `AutoTagger` → `RegexExtractor`）。
需要按配置决定是否启用时，参考 `Pipeline::with_tag_rules()`：它在默认链之后追加处理器，
这是目前唯一会读配置的 pipeline 入口。

### 调整外观

界面按 **Corporate Clean（企业简洁风）** 设计系统实现，样式直接写在 TSX 里，
使用 Tailwind 工具类（`index.css` 里有 `@tailwind` 三个指令，`tailwind.config.js`
扫描 `./src/**/*.{js,ts,jsx,tsx}`）。

`src/components/ui.ts` 是唯一的 token 出口——卡片、按钮、输入框、焦点环、模态框都从
这里取，不要在组件里重新拼一遍工具类字符串。改外观先改这里。

token 按窗口的结构分组，一个区域一个名字：

| 组 | token | 用途 |
| --- | --- | --- |
| Region | `navBar` / `tray` | 顶部导航栏；卡片陈列区（内嵌阴影的浅槽，卡片浮在上面） |
| Surface | `surface` / `surfaceInteractive` / `inset` / `row` / `rowInteractive` | 带边容器 / 其悬停 / 容器内的填充面 / 容器内的行 |
| Popup | `menuSurface` / `menuColumn` / `menuItem` / `menuItemDanger` / `menuSeparator` | 右键菜单的容器、列、条目、危险条目、分组线 |
| Control | `buttonPrimary` / `buttonSecondary` / `buttonDanger` / `buttonGhost` / `iconButton` / `iconButtonQuiet` / `iconButtonActive` | 按钮与图标控件 |
| Field | `input` / `inputMono` / `select` / `checkbox` | 输入控件 |
| Label | `pill` / `pillAccent` | 状态标签 |
| Overlay | `overlay` / `modalPanel` | 模态 |
| — | `transition` / `focusRing` / `focusFill` / `focusHalo` | 共用的时序与三种焦点形态 |

顶部导航栏的 **tab 用下划线，不用按钮边框**（蓝色下划线 + 蓝色文字）：在一栏本来就有底边框
的地方再给每个 tab 加边框，读起来就是双层边。下划线是**绝对定位的子元素**、用 `-bottom-2`
画在 tab 自己的盒子之外 8px 处，正好压在导航栏的底边框上——不要把整条 tab 撑高去对齐，
那会让标签比旁边的图标按钮低 4px。

`src/App.css` 现在只剩工具类表达不了的东西：滚动条样式（`.eacp-scroll` /
`.eacp-scroll-none`）、三个入场动画、以及 `prefers-reduced-motion` 兜底。

硬性规则（改动时必须保持）：

- 圆角只用 `rounded-lg` / `rounded-xl`，禁止 `rounded-none`
- 阴影最重到 `shadow-md`，禁止 `shadow-2xl`
- 禁止渐变背景（`bg-gradient-*`），主色用纯色 `bg-blue-600` / `hover:bg-blue-700`
- 所有动画不超过 `duration-200`
- **一个元素只有一条边。** 控件要么是描边要么是填充，不要同时加 `border` 和 `shadow-sm`；
  容器里不要再用一个带描边的容器（那就是双层边框）。容器内部一律用填充面
  （`inset` / `row` / `pill`）。
- **动画只报告状态，不搬运元素。** 不再有 `hover:-translate-y-*`：悬停靠底色、描边深浅和
  阴影的变化。副作用是没有任何元素会成为 `position: fixed` 后代的包含块。
- **焦点可见，但不当第二道边。** 独立控件用 `focusRing`
  （`focus-visible:ring-2 ring-blue-500`，**不带 offset**——紧贴自身描边的 offset ring 就是
  双层边框）；弹层与密集列表内的项用 `focusFill`（整块蓝底白字，和原生菜单一样）。
  两者都满足 WCAG 2.4.7 的对比度要求；`focus-visible` 让鼠标点击不出环。
- 按钮必须 `active:scale-[0.98] active:translate-y-0`，否则没有按压反馈

**滚动容器的 padding 必须容得下子元素的出血量。** `overflow` 的裁切边界是
padding box，不是 border box：容器的 padding 有多少，子元素才有多少外扩空间。
凡是子元素带 `border` + `shadow` / `ring` / `hover:-translate-y-0.5` 的滚动容器
（`overflow-x-auto`、`overflow-y-hidden` 都会裁切，且另一轴会跟随变成 `auto`），
padding 至少要给到 8px：

- 卡片带 `#card-scroll` 用 `p-2`。之前只有 `px-1 pb-2`，顶部为 0，卡片顶边正好
  贴在裁切线上，hover 抬起 2px 后顶边直接消失，选中卡的 `ring-2` 也被切掉
- 顶部标签行 `#filter-scroll` 用 `p-2 -m-2`：`-m-2` 抵消 padding，让 header 高度
  和 tab 宽度保持不变，只把裁切盒向外扩 8px
- 卡片底部信息行用 `pt-3 pb-1 -mb-1`，同理只扩裁切盒、不动排版

反例：header 里包搜索框的 `overflow-hidden` 折叠容器没有 padding，搜索框的焦点环
被整体裁掉（只剩 `focus:border-blue-500` 的 1px 蓝边）。修它需要给容器加
`p-1.5` 并同步把 `w-72` 调到 `w-[18.75rem]`、`ml-2` 调到 `ml-0.5`，才能既露出
焦点环又不改变搜索框的位置和宽度。

卡片与滚动条的联动有一个约定：卡片内部凡是可滚动或可横向滚动、需要从滚轮劫持里
豁免的元素，都要带上 `.eacp-scroll`（或 `.eacp-scroll-none`）。
`App.tsx` 的 `bindHorizontalWheel` 用 `closest(".eacp-scroll, .eacp-scroll-none")`
判断，新增内部滚动区时漏了这个类，滚轮就会被整条卡片带抢走。

卡片布局是**单行横向卡片带**（`flex h-full gap-5 overflow-x-auto overflow-y-hidden
rounded-lg p-2`），卡片 `w-[320px] shrink-0 h-full`——高度直接跟随窗口，没有多行
换行，也没有 JS 测量。卡片带没有 `pt` 时卡片顶边会被裁切，不要再退回 `px-1 pb-2`。

### 卡片交互约定

**卡片分三层，只有中间那层接手势**：

| 层 | 谁 | 行为 |
| --- | --- | --- |
| 标题通栏 | `<header>` | 只是标签：hover 用原生 tooltip 报出完整来源（进程名 + 窗口标题 + exe 路径） |
| **内容区** | 手势面 | 左键按下不动 → 粘贴；按住并移动 ≥5px → 原生拖出。hover 提示「按住此处拖到其他程序」 |
| metadata 行 | 底部那行 | 只是状态：类型、时间、字数、OCR 等，上面唯一可点的是 OCR 按钮 |

手势由 `src/hooks/useCardGesture.ts` 统一处理，两个结果都归它管，**不依赖 `click` 事件**：
按下时已经 `preventDefault` 掉了浏览器的原生拖拽与文本选择，自己接管抬起比赌引擎对
「被取消的 mousedown」怎么处理更可靠。它还会回报 `pressed` / `dragging` 两个阶段
（`CardGesturePhase`），卡片据此做按压与拖出动画：按下时轻微缩小 + 加深阴影，拖出期间
缩小到 0.97 + 半透明 + 蓝环，直到原生拖放结束（`onDragOutStart` 返回 Promise）才复位。

卡内的控件用 `isCardControlTarget` 排除（`cardInteraction.ts` 的 `CARD_CONTROL_SELECTOR`：
原生 `button/a/input/textarea/select` + `[role=button]` + `[role=menuitem*]` +
`[data-card-control]` 显式退出）。**不要靠各处 `stopPropagation`**，漏一处就会把按钮点击
变成粘贴。

「这次点击该做什么」写在 `src/lib/cardInteraction.ts` 的 `resolveCardClick` 里，是**纯函数**，
分支由 `cardInteraction.test.ts` 表驱动覆盖。目前它拦下四种情况：非三种已知类型、落在控件
上、正在做文本选择、以及双击的第二次（否则会写两次剪贴板、`use_count` 跳变）。

代价：内容区里的文本**不能拖选**（按下即被接管），要取出文字请用「拖到目标程序」或编辑页。

图片放大查看**不占用点击**，也**没有按钮**（图片上不叠任何浮层）：键盘入口是选中卡片后按
`itemZoomShortcut`（默认 `Z`，设置页可改，只对图片生效），鼠标入口是右键菜单里的
「放大 · Z」（`CardContextMenu` 会把当前配置的键显示在右侧）。所以图片卡和别的卡一样
单击内容区即粘贴。

**卡片只有一个 `actions` 对象**（`ClipboardCard` 导出的 `CardActions`）：卡片是 `memo` 组件，
把十几个回调当独立 prop 传进来，`App` 每渲染一次就会给每张卡一个新 prop，memo 等于没有——
五十张卡跟着每次按键重渲。`App` 里那个对象**只创建一次、成员就地刷新**，所以身份不变、
内容不旧。代价是卡片内**必须在调用时读取成员**（`actions.onPaste(...)`，不要
`const { onPaste } = actions`）：不重渲的卡片会一直用旧闭包。

**卡片头部是一条通栏色带，图标单独成层**：色带是来源程序主色，上面是白色两行文字
（进程名 = 稳定，第二行 = 窗口标题，没有窗口标题时退回类型标签）。图标放在**自己的白色圆角
托板**上，托板的下沿**探出色带**（`absolute bottom-0 translate-y-1/3`），所以色带和图标读起来
是两层，而不是一块平贴的图。托板负责分层——靠白底和阴影，**不加边框**，否则就是第三条边。
色带左边因此要留出 `pl-[84px]`（16 padding + 56 托板 + 12 间距）；下面的内容区用 `pt-8`
给探出的托板让位。

色带的颜色走 `headerBandColor`（`brandColor.ts`）：上面是白字，所以要先把品牌色按 HSL 逐步
压暗，直到白字达到 WCAG AA 的 4.5:1；只压明度，不动色相与饱和度，否则黄底图标会变成一片
看不清的白字。`parseColor` / `relativeLuminance` / `contrastRatioWithWhite` 都是纯函数，
单测覆盖了全部回退色相。

**快捷索引 `#N`** 在卡片底部的 metadata 行里（第一位），不在头部：它和类型、时间、字数一样
是这条记录的属性，而且底部那行本来就是放键位提示的地方。

**底部 metadata 行**：`#N` → 类型 → 时间 → 字数/尺寸/大小 → OCR → Pinned/Private → 标签。
它与正文之间用一条 `border-t` 分隔，那是卡片内的区域分隔线，不是某个控件的第二道边。

**粘贴链路**：只能走 `App.tsx` 的 `pasteIntoFocusedWindow` →
`api.pasteToPreviousWindow` → Rust 的 `focus.rs`。它的顺序是「写剪贴板 → 交还焦点 →
**确认面板已不是前台窗口** → 发 Ctrl+V」。不要再直接调用 `simulate_paste`（该命令已删除）：
没有焦点交接就发按键，等于把 Ctrl+V 打进面板自己。

置顶（always-on-top）时面板不隐藏，改为把焦点还给「面板显示前记录的那个前台窗口」。
**置顶状态只由 header 的图钉按钮和 `App.tsx` 的 `alwaysOnTop` 持有**，`SettingsModal`
不镜像、不回写它——设置页只在挂载时读一次配置，一旦它抄一份，用户在设置页开着时点图钉，
保存就会把旧值写回去。图钉按钮显示的是**窗口的真实状态**：`setAlwaysOnTop` 之后回读
`isAlwaysOnTop()`，不一致时以窗口为准（该权限在 `capabilities/default.json` 里，别删）。

**失焦隐藏**：判定集中在 `src/lib/windowFocus.ts` 的 `shouldHideOnBlur`（纯函数，有单测）。
置顶时、拖拽/移动窗口期间、以及瞬时交互抑制窗口内都不隐藏。窗口创建时
（`create_main_window`）会从 config.json 直接读 `alwaysOnTop` 应用一次，所以
`App.tsx` 里那个 `setAlwaysOnTop` 的 effect 必须等 `configReady` 之后再跑，否则会把刚恢复
的置顶状态按初始值 `false` 抹掉。

### 匹配堆叠

卡片上的堆叠（`RegexMatchStack.tsx`）只有一个来源：**用户正则标签的抽取结果**
（`tagMatch:<标签名>`，卡片上显示 `#标签名`）。内置的 `urls` / `emails` / `phones`
是给搜索用的 metadata，**不进堆叠**——规则是自己配的，堆叠就只显示自己配的。

堆叠整体是**一个有上限、自己滚动的区域**（`eacp-scroll max-h-[45%] shrink-0 overflow-y-auto`）：
组一多、或者展开的列表一长，以前会把卡片的正文挤出卡片、然后被卡片的 `overflow-hidden` 切掉。
组内列表因此**不再自己滚动**——两个嵌套的滚动区只会互相打架。`.eacp-scroll` 同时保证滚轮
停在这里，不会被卡片带抢走。

### 键盘归属

每个卡片快捷键都挂在 `window` 上，所以**上面盖着任何东西时都必须让位**——
`src/lib/interactionRules.ts` 把这条规则写成纯函数（`shouldHandleCardShortcut` /
`isEditingField` / `escapeTarget`，都有单测）：

- 全页视图（设置、Tag Admin）、任何浮层（灯箱 / 匹配面板 / OCR 面板 / 密码框 / 右键菜单）、
  以及正在输入的输入框（含 `[role=textbox]`），卡片快捷键一律不响应。
  没有这条规则时，灯箱开着按 `Delete` 会删掉**背后的卡片**，`Space`/`Tab` 会动队列表，
  `Enter` 会隐藏面板并粘贴一条没人看的内容。
- `Escape` 按「由内到外」关一层，顺序写在 `escapeTarget` 里：密码框 → OCR → 匹配面板 →
  右键菜单 → 搜索框。**灯箱不在这个列表里**——它自己处理 Escape，因为它是唯一同时拥有
  其他按键的浮层。
- `Space` 只在没有呼出控件时切换队列（焦点在按钮上时留给按钮，那才是键盘按钮的按法）；
  `Tab` 完全不拦，交回浏览器的焦点游走。

**快捷索引 `#N` 只在不可能撒谎时显示**（`quickSlotIndex`）：快捷键由后端按**未筛选**的
历史取第 N 条，而条带可能正显示筛选后的子集，所以只有「第一页 + 没有任何筛选」时两者顺序
才必然一致。有筛选时不显示角标，而不是显示一个指向别的条目的编号。

**匹配项没有双击**：那一行本身是拖拽源（HTML5 拖拽），而拖拽会吃掉第二次点击。要做成卡片
请用溢出面板里的「+ 卡片」按钮。另外 `matchDragging` 有兜底清理（`dragend`/`drop`/`blur`
+ 30s 超时）：拖拽在窗口外结束不会触发 `dragend`，否则条带会一直亮着。

### 正则规则编辑器

Tag Admin 里的规则编辑是 `src/components/TagRuleDrawer.tsx` 的抽屉，左边写规则、右边试跑。

- **试跑必须用 Rust 的 `regex` 编译**（`preview_tag_pattern`），不能在前端用 JS `RegExp`：
  这样「编辑器里能通过」和「入库时能编译」才是同一件事。
- 预览有两种范围：粘一段样例（本地、防抖 250ms、实时高亮）和「用最近 200 条历史试跑」
  （要读真实数据，所以是按钮而不是实时）。高亮**在 Rust 侧切成普通段/命中段**返回
  （`segments`）——字节偏移在 JS 里换算 UTF-16 下标是经典坑，直接在源头切好就没有这回事。
- 命中去重与截断复用 `tag_rules::collect_matches`，和入库时**同一份实现**，所以预览报的数量
  就是卡片上会显示的数量。
- **能被规则扫到的内容**（抽屉里也列着）：文本正文、文件路径列表（换行拼接）、
  图片的 OCR 文本。**扫不到的**：未识别的图片、私密内容的加密文本。
- 图片的处理：`tag_rules::scan_source` 对 image 读 `metadata.ocrText`，并且 OCR 落库后
  （`store_ocr_result`）会**重新跑一遍规则**——识别正是图片唯一获得文本的时刻。
- **系统标签与设备标签不给规则入口**：它们由程序维护/从历史派生，给 `Image` 配一条正则
  会让所有含该词的文本都被打上 `Image`。

### 右键菜单

卡片的操作菜单是 `src/components/CardContextMenu.tsx`，**没有下拉菜单，也没有 chevron**。

- **必须 portal 到 `document.body`**，不能渲染在卡片里：卡片有 `overflow-hidden`，而且 hover
  抬起的 `transform` 会让它成为 `position: fixed` 后代的包含块——用 `clientX/clientY` 定位的
  弹层放进卡片就同时被定位错和裁切。渲染成 App 根 div 的兄弟「今天能用」，但依赖「祖先没有
  transform」这条看不见的不变量，别退回去。
- **单一槽位**：`App.tsx` 只有一个 `cardMenu`，菜单是派生视图——它的 item 不在当前页时就自动
  关闭。旧实现把状态拆成「App 的 quickTagItemId + 每张卡的本地 state」并用 effect 同步，
  于是会多卡并存、B 卡关菜单清掉 A 卡状态、翻页后菜单自己弹回来。
- **关闭时机**：右键别处、点外部（document 捕获阶段 pointerdown，不用全屏 backdrop——那会吃掉
  滚轮事件）、Escape、滚轮/滚动、窗口失焦/尺寸变化、翻页/换视图/筛选、以及任何一个动作执行后。
- **键盘入口**：`T`（`itemTagShortcut`）与 `Shift+F10` / 菜单键都打开选中卡片的菜单，方向键
  循环、`Home`/`End` 跳首尾、`Enter`/`Space` 触发、`ArrowRight` 进标签列、`ArrowLeft` 返回、
  `Tab` 关闭并把焦点交出去。chevron 删掉后这是无鼠标用户的唯一入口，不要再删。
- 菜单打开时 App 的全局 keydown 让位：处理器开头有 `if (event.defaultPrevented) return;`，
  已经处理过该键的一方获胜。
- 标签面板是**同一个弹层里的第二列**，不做第二层定位（子菜单要再算一次翻转、再挂一次
  outside-click，是菜单 bug 的主要来源）。这是对 APG 子菜单模式的有意偏离，ARIA 属性仍是齐的。
- 就绪时机有个坑：弹层在量测完成前是 `visibility: hidden`，**隐藏元素无法获得焦点**，所以
  初始聚焦必须等 `placement` 就位，否则键盘进不去菜单、菜单自己的按键处理也永远不会跑。

### 新增文件类型图标

`src/lib/fileIcons.ts` 把扩展名映射到 `{ icon, from, to, label }`。加一个扩展名就往
`BY_EXTENSION` 里加一行，并在 `KindIcon` 里复用已有色组；图标取自 `lucide-react`，
注意该版本里没有 `FileVideo` / `FileAudio` / `FileJson` / `FileType2`，
要用 `FileVideoCamera` / `FileHeadphone` / `FileBraces` / `FileType`。

### 新增全局快捷键动作

1. 在 `ShortcutAction` 中增加枚举
2. 在 `build_shortcut_bindings` 中读取配置并注册
3. 在 `handle_plugin_shortcut` 中处理动作
4. 如需用户配置，扩展 `AppConfig`、`ConfigResponse`、`PartialAppConfig`、`api.ts`、`SettingsModal.tsx`

### 新增「选中项快捷键」

这类键是**窗口内**按键（`itemTagShortcut` / `itemPrivateShortcut` / `itemPinShortcut` /
`itemDeleteShortcut` / `itemOcrShortcut` / `itemZoomShortcut`），不走系统全局注册，
由 `App.tsx` 的全局 keydown 分支用 `eventToLocalShortcut` 比对。加一个要同步六处，
漏一处就是「设置里能改但不生效」：

1. `commands.rs` 的 `AppConfig` 字段 + `default_item_*_shortcut()`
2. 同文件的 `impl Default for AppConfig`（默认值的唯一出处）
3. 同文件的 `ConfigResponse`、`get_config`、`PartialAppConfig`、`set_config` 合并链
4. `api.ts` 两处 config 类型（`getConfig` 的返回类型与 `setConfig` 的参数类型）
5. `SettingsModal.tsx`：state、`normalizeShortcutValue`、`getConfig` 回填、两处保存载荷、
   「选中项快捷键」区里的一个 `ShortcutRecorder`
6. `App.tsx`：默认值常量、state、config 读取、写回判断与写回载荷、`keydownStateRef`、
   `handlersRef`、keydown 分支

录制器必须传 `allowBareKey`：默认的录制逻辑要求按键里带 `+`（那是给全局快捷键的），
不传的话这一整区**根本录不进单字母**，只能清空或点「默认」。

### 新增翻译来源

当前 ECDICT 查询封装在 `lookup_ecdict` 中，可扩展：

- 多词典 fallback
- 在线 API
- 词形还原
- 候选词列表
- 发音音频

建议保持同一个 item `pending -> done` 的更新模型，避免重复历史。

## 调试日志

后端已有若干 `[EasyCPTrans]` 日志：

- 快捷键注册与触发
- 快捷粘贴写剪切板耗时
- ingest pipeline、hash、insert / dedupe
- 翻译复制、查询、更新 item
- ECDICT 候选路径和查询耗时
- 图片 / 文件 metadata 处理

优先观察这些日志，可快速区分问题属于剪切板读取、入库、快捷键、数据库还是前端刷新。

## 测试

两套单测，都在 CI 里跑（`.github/workflows/build.yml`）：

```bash
pnpm test                                                    # vitest，纯前端逻辑
cargo test --manifest-path src-tauri/Cargo.toml --lib        # Rust
```

**前端**：vitest（配置在 `vite.config.ts` 的 `test` 段，`environment: "node"`，**不用
jsdom**）。测试文件与源码同目录，命名 `*.test.ts`；只有 `.ts`，组件测试需要单独决定。
覆盖的是纯逻辑：`filter.ts`（搜索语法、多 Tag AND、时间范围）、`cardInteraction.ts`、
`dragGesture.ts`、`dropStage.ts`、`windowFocus.ts`、`tagMatches.ts`、`fileIcons.ts`、
`imageCache.ts`、`time.ts`、`i18n.ts`、`api.ts`（mock `@tauri-apps/api/core` 断言命令名
与参数形状）。

`i18n.test.ts` 里有一条**反向引用扫描**：用 `import.meta.glob` 把所有源码当文本读进来，
断言每个字典 key 都在某处被引用过。`KNOWN_DEAD_KEYS` 现在**是空的**（最后三个死键 `ocrScan` / `ocrBadge` / `commandTag` 已随
「常用命令」一起清掉）。它保留成清单而不是删掉，是因为要让「例外」显式：另有一条测试保证
清单里的键不会过期，删掉字典里的键就必须同步清空清单。

**Rust**：`#[cfg(test)] mod tests` 就地放在被测文件末尾。`commands.rs` 里的
`normalize_managed_tags` / `normalize_tag_pattern` / `normalize_tag_color` /
`tag_rules_from_config` 都是私有函数，**只能在 `commands.rs` 内测**。
不需要 `[dev-dependencies]`（不碰临时文件）。注意 `privacy.rs` 的测试会跑 Argon2（单次约
几十毫秒），用例数要克制。

**写新交互时**：把「该做什么」抽成 `src/lib` 下的纯函数并在 `*.test.ts` 里表驱动覆盖，组件
只负责执行。需要真实窗口才能验的（拖放落到别的程序、焦点交接、右键菜单定位）放在
`Technology.md` 的手动验收清单里，不要硬塞进单测。

## 发布流程

版本位置：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

检查：

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

打包：

```bash
pnpm tauri build
```

Windows 产物默认输出：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```
