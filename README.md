# EasyCP

EasyCP 是一个基于 `Tauri v2 + React + TypeScript + SQLite` 的桌面剪贴板管理工具。  
它聚焦于三件事：稳定采集、快速检索、隐私可控。

## 功能特性

- 支持文本、图片、文件三类剪贴板内容采集。
- 自动记录来源应用（可用时），并写入元数据。
- 历史列表支持搜索、标签筛选、范围筛选、分页浏览。
- 支持置顶、删除、标签编辑、使用次数统计。
- 支持快速编辑文本条目（路由：`#/quick-edit?id=xxx`）。
- 支持“隐私模式”：加隐私无需输入密码，解密必须输入密码。
- 支持 WebDAV 连通性验证与手动同步。
- 支持全局快捷键唤起窗口，支持自动粘贴流程。

## 核心逻辑

### 1. 采集流程

前端 `useClipboardWatcher` 每 `500ms` 轮询一次剪贴板，处理顺序是：

1. 文件剪贴板（`read_clipboard_files`）
2. 文本剪贴板（`readText`）
3. 图片剪贴板（`readImage`）

为降低高频轮询成本：

- 图片先用尺寸生成签名做快速判重，尺寸变化时才读取 RGBA。
- 图片会压缩为 JPEG Data URL 后入库。
- 文本和文件会携带长度、大小、数量等 metadata。

### 2. 入库与管道

`ingest_clipboard` 在入库前会走 `Pipeline`：

- `SecurityFilter`：拦截来自密码管理器等敏感应用的内容。
- `RegexExtractor`：提取 URL、Email、Phone 到 metadata。
- `AutoTagger`：自动打 `Code/JSON/URL/Email/Phone/Image/Color` 等标签。

入库策略：

- 通过 `content_hash` 对非隐私数据去重。
- 命中去重时更新 `use_count` 与 `last_used_at`。
- 未命中去重时新增记录。

### 3. 历史读取与界面状态

`load_history` 按 `is_pinned DESC, last_used_at DESC, created_at DESC` 排序。  
当后端变更数据后会广播 `clipboard-changed` 事件，前端 `useHistory` 自动 reload。

筛选维度包括：

- 作用域：全部、固定、文本、图片、文件、URL、邮箱。
- 标签：多标签叠加筛选。
- 高级范围：时间、文本长度、文件大小。

### 4. 隐私安全逻辑

隐私配置存储在 `app_data_dir/privacy.json`：

- `password_hash`（Argon2）
- `key_salt_b64`
- `security_question`
- `security_answer_hash`（Argon2）

行为规则：

- 未配置“隐私密码 + 安全问题”时，不能启用隐私。
- 启用隐私（`protect_item`）不要求当场输入密码。
- 解除隐私（`unprotect_item`）必须输入正确隐私密码。
- 应用每次启动后，首次解密输入成功会在当前会话内复用密码；重启应用后需要重新输入。
- 私密条目在列表中以脱敏内容展示，metadata 不直接暴露。
- 普通标签编辑不能直接增删“隐私”标签，必须通过隐私按钮变更。
- 已移除“忘记密码后删除全部私密内容”的高风险操作。

说明：

- 通过设置页“正常修改密码”成功后，系统会自动将已有私密条目重加密到新密码体系，后续可直接使用新密码解密。

### 5. WebDAV 同步逻辑

- `verify_webdav`：用 `PROPFIND` 验证地址和认证是否可用。
- `trigger_sync`：手动触发上传。
- 同步为“本地 -> WebDAV”单向上传，每条记录按 `content_hash.json` 写入远端。
- 仅同步 `content_hash` 非空的数据（即常规非隐私内容）。

## 数据存储

### SQLite 表：`clipboard_items`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 自增主键 |
| `content_type` | TEXT | `text` / `image` / `file` |
| `content_hash` | TEXT | 去重哈希（私密内容会置空） |
| `preview_text` | TEXT | 文本预览 |
| `storage_path` | TEXT | 图片 Data URL 或文件路径串 |
| `encrypted_content` | TEXT | 私密密文 |
| `is_private` | BOOLEAN | 是否私密 |
| `is_pinned` | BOOLEAN | 是否置顶 |
| `tags` | TEXT | JSON 数组 |
| `metadata` | TEXT | JSON 对象 |
| `use_count` | INTEGER | 使用次数 |
| `created_at` | DATETIME | 创建时间 |
| `last_used_at` | DATETIME | 最近使用时间 |

### 配置文件

- `config.json`：快捷键、缓存路径、分页参数、WebDAV 配置等。
- `privacy.json`：隐私密码哈希、密钥盐、安全问题与答案哈希。

默认存储目录为 Tauri `app_data_dir`，可在设置中自定义 `cachePath`。  
启动时会尝试从旧标识 `com.easycut.app` 迁移历史数据库。

## 后端命令总览

| 命令 | 作用 |
| --- | --- |
| `ingest_clipboard` | 采集内容入库（含管道处理） |
| `load_history` | 读取历史列表 |
| `get_text_item` | 获取可编辑文本详情 |
| `update_text_item` | 更新文本条目 |
| `toggle_pin` | 置顶/取消置顶 |
| `delete_item` | 删除条目 |
| `set_tags` | 设置标签（含隐私标签保护） |
| `mark_used` | 增加使用次数并更新时间 |
| `get_privacy_status` | 读取隐私状态 |
| `set_privacy_password` | 设置/更新隐私密码与安全问题 |
| `protect_item` | 启用隐私（加密） |
| `unprotect_item` | 解除隐私（解密） |
| `simulate_paste` | 模拟系统粘贴 |
| `read_clipboard_files` | 读取文件剪贴板（Windows） |
| `get_active_window` | 获取当前活动窗口标题（Windows） |
| `get_config` | 读取应用配置 |
| `set_config` | 写入应用配置 |
| `verify_webdav` | 校验 WebDAV 可用性 |
| `trigger_sync` | 触发手动同步 |

## 项目结构

```text
EasyCP/
├── src/                      # React 前端
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── types.ts
└── src-tauri/                # Rust/Tauri 后端
    ├── src/
    │   ├── lib.rs
    │   ├── commands.rs
    │   ├── db.rs
    │   ├── privacy.rs
    │   ├── sync.rs
    │   └── pipeline/
    ├── tauri.conf.json
    └── capabilities/
```

## 开发与运行

### 环境要求

- Node.js 18+
- pnpm
- Rust stable（含 cargo）
- Tauri v2 构建环境

### 常用命令

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

类型与编译检查：

```bash
pnpm exec tsc --noEmit
cd src-tauri && cargo check
```

## 当前行为边界

- WebDAV 目前是手动触发、单向上传，不做远端回拉合并。
- `read_clipboard_files` 与 `get_active_window` 依赖平台能力，Windows 支持最完整。
- 隐私功能已经移除“一键重置并删除全部私密内容”的破坏性入口。
