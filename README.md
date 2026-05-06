# EasyCP - 智能剪贴板管理工具

EasyCP 是一款基于 Tauri v2 + React 开源的跨平台剪贴板历史管理工具。它能自动监控系统剪贴板（支持文本和图片），持久化存储到本地 SQLite 数据库，并支持一键搜索、标签分类和跨应用自动粘贴。

## 🎯 核心特性

- **多模态全栖支持**：除纯文本与图像外，现已全面支持基于文件（视频、音频、文档等）的剪贴板捕获，并自动解析文件尺寸与多媒体信息。
- **正则模式与子信息提取**：后端处理管道支持通过正则表达式从海量文本中智能提取 URL、Email、手机号、IP 等关键实体信息，并在 UI 侧以智能气泡呈现，方便一键快捷交互。
- **来源应用追踪**：在 Windows 等环境下调用原生 API 追踪“谁复制了这条记录”，支持通过拷贝来源的软件名称进行全局检索。
- **高阶范围过滤机制 (Advanced Filters)**：支持在 UI 侧使用精密的分体式交互气泡，针对“时间（精确到秒）”、“文本长度（字级）”、“文件大小（MB级）”等维度进行连续区间筛选。
- **全局快捷键唤醒**：随时通过 `Ctrl+Shift+E` (或 `Cmd+Shift+E`) 快捷键唤出主界面。
- **自动粘贴（Auto Paste）**：点击任意历史记录后，窗口自动隐藏并向之前的应用程序模拟发送原生的 `Ctrl+V` (或 `Cmd+V`) 粘贴事件。
- **本地持久化存储**：基于 `@tauri-apps/plugin-sql` 的 SQLite 高效存储，支持 `last_used_at` 排序、固定（Pin）以及使用频率统计。

---

## 📂 项目结构说明

项目采用典型的前后端分离架构，前端完全使用 React + TypeScript 渲染，通过 Tauri 暴露的 Rust Commands 桥接系统级 API。

```text
EasyCP/
├── package.json             # 前端依赖配置
├── vite.config.ts           # Vite 构建配置
├── src/                     # ========== 前端代码 (React) ==========
│   ├── App.tsx              # 应用主页面与核心视图逻辑
│   ├── index.css            # Tailwind CSS 样式基底
│   ├── components/          # 复用组合组件（如 ClipboardCard 等）
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useClipboardWatcher.ts # 剪贴板轮询器 (高频检测与图像流压缩)
│   │   ├── useGlobalShortcut.ts   # Tauri 全局快捷键注册与注销管理
│   │   └── useHistory.ts          # 历史数据加载与状态同步
│   ├── lib/
│   │   ├── api.ts           # 前端到 Rust 的 invoke 接口封装
│   │   └── filter.ts        # 搜索及分类逻辑工具封装
│   └── types/               # 全局 TypeScript 接口定义
└── src-tauri/               # ========== 后端代码 (Rust/Tauri) ==========
    ├── Cargo.toml           # Rust 依赖声明
    ├── tauri.conf.json      # Tauri 全局行为、窗口配置
    ├── capabilities/        # Tauri v2 安全权限划分
    │   └── default.json     # Clipboard/Shortcut/SQL 等白名单配置文件
    └── src/
        ├── main.rs          # 桌面程序总入口
        ├── lib.rs           # 插件系统初始化及 Command 路由注册表
        ├── commands.rs      # 暴露给前端的 API 实现层
        ├── db.rs            # SQLite 连接池创建与表结构维系
        └── pipeline/        # 剪贴板数据落库前的数据管道 (含正则提取、自动标签等)
```

---

## 🛠️ 后端 API 功能说明 (Commands)

前端通过 Tauri API `invoke("command_name")` 调用下列由 Rust 构建的本地系统指令：

### 1. `ingest_clipboard`
- **功能**：将轮询嗅探到的最新剪贴板内容推送给后端管道与数据库进行落盘。
- **参数**：`payload: { contentType: "text" | "image", content: string }`
- **处理管道**：内容在落盘前会途经 `Pipeline`（数据清洗安全审查、链接识别提取、自动打标构建等）。

### 2. `load_history`
- **功能**：从 SQLite 读取用户的历史剪贴板记录。
- **返回数据**：返回经过组合的记录列表，按 `置顶状态`、`最后使用时间` 降序排列。
- **特性**：避免了在前端存储过多的巨量数据字符串，控制分页与加载极限。

### 3. `simulate_paste`
- **功能**：硬件级系统剪贴板输出。
- **详细行为**：利用 Rust `enigo` 库在底层向操作系统发出模拟按键（`Ctrl+V` 或 `Cmd+V`）。
- **流程结合**：前端主动写入新剪贴板 -> 隐藏程序主窗口将系统焦点还给上个App -> 调用此 API 自动粘贴应用。

### 4. `mark_used`
- **功能**：记录或更新某一剪切项的热度。
- **参数**：`id: number`
- **详细行为**：让数据库对应主键的 `use_count` 值 `+1`，同时刷新 `last_used_at` 字段为当前时间，以便提升列表排序权重。

### 5. `toggle_pin` / `delete_item`
- **功能**：基础 CRUD。通过对应的 SQLite 更新指令来修改数据的布尔值状态或执行记录抹除。

### 6. `set_tags`
- **功能**：更新或覆盖对应条目的所有标签分类。
- **参数**：`id: number`, `tags: string[]`（存储为序列化的 JSON String）。

---

## 🗄️ 数据库设计字典 (SQLite)

核心表 `clipboard_items` 字段规范：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER | 自动递增主键 |
| `content_type` | TEXT | 数据类型，如 `text`, `image`, `file`, `video`, `audio` |
| `content_hash` | TEXT | (可选) 哈希值，用于快速比对去重 |
| `storage_path`| TEXT | 本地文件或高压缩图片数据缓存路径/DataUrl |
| `preview_text`| TEXT | 文本形式的内容实体存放处，或多媒体文件短描述 |
| `source_app`  | TEXT | 提取自当前焦点的宿主应用名称 (如 `Code.exe` 或 `Chrome`) |
| `file_info`   | TEXT | (JSON) 保存文件大小 `file_size`、分辨率、时长等元信息 |
| `extracted`   | TEXT | (JSON) 通过 Pipeline 正则挖掘提取出的 `urls` / `emails` 数组集合 |
| `tags` | TEXT | JSON 序列化的分类标签数组 (如 `["code", "image"]`) |
| `use_count` | INTEGER | 该记录被应用/重复拷贝的统计次数 (默认为 0) |
| `is_pinned` | BOOLEAN | 是否置顶锁定不被清理 |
| `created_at` | DATETIME| 首次截获的时间记录 |
| `last_used_at`| DATETIME| 最近一次被搜索、查看或点击粘贴的时间 |

---

## 🚀 最佳开发与启动姿势

```bash
# 1. 安装前端依赖
pnpm install

# 2. 启动含热更新 (HMR) 的全栈开发模式
pnpm tauri dev

# 3. 构建发布应用至生产版本
pnpm tauri build
```

