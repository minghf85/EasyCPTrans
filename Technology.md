# EasyCPTrans 技术文档

本文面向二次开发者，说明 EasyCPTrans 的项目结构、核心模块、前后端接口、事件流、数据模型和扩展点。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- 后端：Rust
- 数据库：SQLite，后端使用 `sqlx`
- 剪切板：`tauri-plugin-clipboard-x`
- 全局快捷键：`tauri-plugin-global-shortcut`
- 自动化按键：`enigo`
- 加密：`aes-gcm`、`argon2`

## 目录结构

```text
EasyCPTrans/
├─ src/
│  ├─ App.tsx                         # 前端主应用、快捷键、窗口内交互
│  ├─ App.css                         # 主样式
│  ├─ components/
│  │  ├─ ClipboardCard.tsx            # 历史 item 卡片
│  │  ├─ SettingsModal.tsx            # 设置页
│  │  ├─ TagManagementPage.tsx        # 标签管理
│  │  ├─ QuickTextEditorPage.tsx      # 文本快速编辑
│  │  └─ ...
│  ├─ hooks/
│  │  ├─ useClipboardWatcher.ts       # 剪切板监听、堆叠、抑制重复入库
│  │  └─ useHistory.ts                # 历史数据加载和刷新
│  ├─ lib/
│  │  ├─ api.ts                       # Tauri invoke API 封装
│  │  ├─ filter.ts                    # 搜索筛选解析和执行
│  │  └─ time.ts
│  └─ types.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands.rs                  # Tauri 命令、配置、历史、翻译、隐私
│  │  ├─ db.rs                        # SQLite 初始化、hash、迁移
│  │  ├─ lib.rs                       # Tauri app 初始化、窗口、托盘、模拟粘贴
│  │  ├─ shortcuts.rs                 # 全局快捷键注册和后端快捷粘贴
│  │  ├─ sync.rs                      # WebDAV 同步
│  │  ├─ privacy.rs                   # private item 加密配置
│  │  └─ pipeline/                    # 入库 pipeline
│  ├─ capabilities/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ README.md
├─ TransTech.md
└─ Technology.md
```

## 数据模型

核心表：`clipboard_items`，初始化位置在 `src-tauri/src/db.rs`。

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `content_type` | `text`、`image`、`file` |
| `content_hash` | 内容 hash，用于去重 |
| `preview_text` | 文本内容或文本预览 |
| `storage_path` | 图片 data URL、文件路径列表或非文本内容 |
| `metadata` | JSON 字符串，前端解析为 `Record<string, string[]>` |
| `tags` | JSON 字符串数组 |
| `use_count` | 使用次数 |
| `is_pinned` | 是否置顶 |
| `is_private` | 是否私密 |
| `encrypted_content` | private item 加密内容 |
| `created_at` / `last_used_at` | 创建和排序时间 |

排序规则：

```sql
ORDER BY is_pinned DESC, last_used_at DESC, id DESC
```

新 pin 的 item 会进入 pinned 分组最前面；取消 pin 后进入普通 item 的最新位置。

## 前端 API 封装

所有主要 Tauri 命令在 `src/lib/api.ts` 中封装。

常用接口：

| 方法 | 后端命令 | 说明 |
| --- | --- | --- |
| `loadHistory(limit)` | `load_history` | 加载历史 item |
| `ingest(...)` | `ingest_clipboard` | 将剪切板内容写入历史 |
| `getTextItem(id)` | `get_text_item` | 获取文本 item 完整内容 |
| `togglePin(id)` | `toggle_pin` | pin/unpin item |
| `deleteItem(id)` | `delete_item` | 删除 item |
| `setTags(id, tags)` | `set_tags` | 更新 item 标签 |
| `protectItem(id)` | `protect_item` | 设置 private |
| `unprotectItem(id, password)` | `unprotect_item` | 取消 private |
| `updateTextItem(id, content)` | `update_text_item` | 更新文本 item |
| `translateSelectedText()` | `translate_selected_text` | 触发划词翻译 |
| `getConfig()` | `get_config` | 读取配置 |
| `setConfig(config)` | `set_config` | 保存配置 |
| `refreshGlobalShortcuts()` | `refresh_global_shortcuts` | 重新注册全局快捷键 |
| `syncQueueState(ids)` | `sync_queue_state` | 同步前端队列状态到后端 |

## 后端命令分组

### 历史与入库

文件：`src-tauri/src/commands.rs`

- `ingest_clipboard`：前端 watcher 调用的统一入库入口。
- `load_history`：加载历史列表。
- `delete_item`：删除 item。
- `update_text_item`：更新文本 item。
- `set_tags`：设置标签。
- `toggle_pin`：切换 pin 状态。

入库流程：

1. 前端 watcher 读取系统剪切板。
2. 调用 `api.ingest(...)`。
3. 后端构造 `ClipboardItem`。
4. 经过 `Pipeline::default()`。
5. 计算 hash。
6. 命中旧 hash 时更新旧 item 的 metadata/tags/use_count。
7. 未命中时插入新 item。
8. 后端发出 `clipboard-changed` 事件。
9. 前端 `useHistory` 收到事件后 reload。

### 快捷键

文件：`src-tauri/src/shortcuts.rs`

全局快捷键统一在后端注册，主要动作：

- `TogglePanel`
- `QuickPaste`
- `QueueStep`
- `StackMode`
- `TranslateSelection`

快捷索引粘贴流程：

1. 后端收到 `Ctrl + Shift + 1~9/0`。
2. 按当前排序加载对应 item。
3. 发出 `eacptrans://clipboard-override`，通知前端 watcher 暂停自动入库。
4. 将 item 写入系统剪切板。
5. 等待快捷键修饰键释放。
6. 模拟 `Ctrl + V`。

该流程不会调用 `mark_item_used`，因此不会改变 item 顺序。

### 划词翻译

文件：`src-tauri/src/commands.rs`

关键函数：

- `translate_selected_text_impl`
- `lookup_ecdict`
- `lookup_ecdict_sqlite`
- `create_translation_item`
- `update_translation_item`

流程：

1. 全局快捷键 `Alt + C` 触发。
2. 后端模拟 `Ctrl + C`。
3. 读取剪切板文本并校验为单词或短语。
4. 创建一个 pending text item：
   - `tags = ["Word"]`
   - `metadata.translationStatus = pending`
   - `metadata.wordQuery = query`
5. 弹出主窗口。
6. 查询 ECDICT SQLite。
7. 更新同一个 item 为翻译结果。
8. 将翻译结果写回系统剪切板。

前端 `ClipboardCard` 根据 `metadata.translationStatus` 和 `Word` tag 使用翻译卡片样式渲染。

### private item

文件：

- `src-tauri/src/privacy.rs`
- `src-tauri/src/commands.rs`

核心命令：

- `set_privacy_password`
- `protect_item`
- `unprotect_item`
- `get_privacy_status`

private item 会清空明文 `preview_text/storage_path/content_hash`，内容写入 `encrypted_content`。取消 private 时需要密码解密并恢复明文。

## 前端事件流

### Tauri 事件

| 事件 | 发送方 | 接收方 | 说明 |
| --- | --- | --- | --- |
| `clipboard-changed` | 后端 | `useHistory` | 历史数据变化后刷新 |
| `eacptrans://queue-updated` | 后端 | `App.tsx` | 队列出队后同步前端 |
| `eacptrans://stack-mode` | 后端 | `useClipboardWatcher` | 开启堆叠复制 |
| `eacptrans://stack-reset` | 后端 | `useClipboardWatcher` | 关闭堆叠复制 |
| `eacptrans://translation-state` | 后端 | `useClipboardWatcher` | 翻译期间抑制重复入库 |
| `eacptrans://clipboard-override` | 后端 | `useClipboardWatcher` | 程序主动写剪切板时抑制重复入库 |

### 剪切板监听

文件：`src/hooks/useClipboardWatcher.ts`

职责：

- 启动剪切板监听。
- 识别文本、图片、文件。
- 对图片读取 data URL 和尺寸。
- 对文件补充大小 metadata。
- 管理堆叠复制状态。
- 在快捷粘贴、翻译写回等程序主动写剪切板场景下跳过自动入库。

## 配置模型

后端配置结构：`AppConfig`，位于 `src-tauri/src/commands.rs`。

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
- `ecdictPath`
- `autoPaste`
- `alwaysOnTop`
- `pageSize`
- `historyLimit`
- `managedTags`
- `webdavUrl`
- `webdavUsername`
- `webdavSyncEnabled`

设置页保存后会调用：

1. `set_config`
2. `refresh_global_shortcuts`
3. 前端本地状态同步

窗口内快捷键 `T/M/P/Delete` 不注册为全局快捷键，只在 EasyCPTrans 窗口获得焦点时由 `App.tsx` 处理。

## 扩展点

### 新增剪切板类型

1. 扩展 `ClipboardItem.content_type`。
2. 在 `useClipboardWatcher` 中读取新类型。
3. 在 `ingest_clipboard` 中写入 `preview_text` 或 `storage_path`。
4. 在 `ClipboardCard` 中增加渲染分支。
5. 在快捷粘贴 `write_item_to_clipboard` 中增加写回逻辑。

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

然后在 `Pipeline::default()` 中加入。

### 新增全局快捷键动作

1. 在 `ShortcutAction` 中加枚举。
2. 在 `build_shortcut_bindings` 中读取配置并注册。
3. 在 `handle_plugin_shortcut` 中处理动作。
4. 如果需要用户配置，扩展 `AppConfig`、`ConfigResponse`、`PartialAppConfig`、`api.ts` 和 `SettingsModal.tsx`。

### 新增翻译来源

当前 ECDICT 查询在 `lookup_ecdict` 中封装。可扩展为：

- 多词典 fallback。
- 在线 API。
- 词形还原。
- 候选词列表。
- 发音音频。

建议保持同一个 item pending -> done 的更新模型，避免产生重复历史。

## 调试日志

后端已有若干 `[EasyCPTrans]` 日志：

- 快捷键注册和触发。
- 快捷粘贴写剪切板耗时。
- ingest pipeline、hash、insert/dedupe。
- 翻译复制、查询、更新 item。
- ECDICT 候选路径和查询耗时。

调试时优先观察这些日志，能快速判断问题属于剪切板读取、入库、快捷键、数据库还是前端刷新。

## 发布流程

版本位置：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml --offline
pnpm build
```

打包：

```bash
pnpm tauri build
```

Windows 产物默认输出到：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## 注意事项

- `ECDICT/` 默认忽略，不应把大型词典数据提交到代码仓库。
- 快捷键可能被系统或其他应用占用，需要在设置页检查和调整。
- 当前主要面向 Windows，跨平台需要重新验证全局快捷键、剪切板图片/文件、窗口拖拽和模拟粘贴。
