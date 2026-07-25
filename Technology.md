# EasyCPTrans Technology

面向版本：`0.1.1`

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
│  ├─ App.css                         # 主样式
│  ├─ components/
│  │  ├─ ClipboardCard.tsx             # 历史 item 卡片
│  │  ├─ SettingsModal.tsx             # 设置页
│  │  ├─ TagManagementPage.tsx         # Tag Admin
│  │  ├─ QuickTextEditorPage.tsx       # 文本快速编辑
│  │  └─ ...
│  ├─ hooks/
│  │  ├─ useClipboardWatcher.ts        # 剪切板监听、堆叠、去重抑制
│  │  └─ useHistory.ts                 # 历史加载与事件刷新
│  ├─ lib/
│  │  ├─ api.ts                        # Tauri invoke API 封装
│  │  ├─ filter.ts                     # 搜索与多 Tag 筛选
│  │  ├─ i18n.ts                       # zh-CN / zh-TW / en 文案
│  │  └─ time.ts                       # 模糊时间格式化
│  └─ types.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands.rs                   # Tauri 命令、配置、历史、翻译、隐私
│  │  ├─ db.rs                         # SQLite 初始化、hash、迁移
│  │  ├─ lib.rs                        # Tauri 初始化、窗口、托盘、invoke handler
│  │  ├─ shortcuts.rs                  # 全局快捷键与后端快捷粘贴
│  │  ├─ sync.rs                       # WebDAV 同步
│  │  ├─ privacy.rs                    # private item 加密
│  │  └─ pipeline/                     # 入库 pipeline
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

### 多 Tag 筛选

`Tags` Tab 使用 `src/lib/filter.ts`：

- 点击 `Tags` 展开全部已有 Tag
- 多选 Tag 使用 AND 逻辑，即 item 必须同时满足所有选中 Tag
- `Text / Image / File` 按 `contentType` 匹配
- `Pinned` 按 `is_pinned` 匹配
- `Private` 按 `is_private` 匹配
- 普通 Tag 按 `item.tags` 匹配

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

## 后端命令分组

### 历史与入库

文件：`src-tauri/src/commands.rs`

- `ingest_clipboard`
- `load_history`
- `delete_item`
- `update_text_item`
- `set_tags`
- `toggle_pin`

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
- `locale`
- `pageSize`
- `historyLimit`
- `managedTags`
- `webdavUrl`
- `webdavUsername`
- `webdavSyncEnabled`
- `deviceName`

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

然后在 `Pipeline::default()` 中加入。

### 新增全局快捷键动作

1. 在 `ShortcutAction` 中增加枚举
2. 在 `build_shortcut_bindings` 中读取配置并注册
3. 在 `handle_plugin_shortcut` 中处理动作
4. 如需用户配置，扩展 `AppConfig`、`ConfigResponse`、`PartialAppConfig`、`api.ts`、`SettingsModal.tsx`

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

