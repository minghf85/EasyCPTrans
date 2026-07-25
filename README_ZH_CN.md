<div align="center">

# EasyCPTrans

**Clipboard History & On-the-fly Translation — All in One**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-20232a.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-dea584.svg)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

[English](./README.md) · 简体中文 · [繁體中文](./README_ZH_TW.md)

</div>

---

## ✨ 特性

- **📋 历史剪切板** — 自动记录文本、图片、文件的复制历史，随时回溯与再次粘贴。
- **🌐 划词翻译** — 选中英文单词或短语，一键查询本地词典，翻译结果沉淀为可复用的卡片。
- **🏷️ 标签管理** — 内置类型标签与用户自定义标签，支持多标签 AND 筛选。
- **📌 置顶与私密** — 重要内容可置顶，敏感内容可加密存储。
- **🔗 队列粘贴** — 将多条记录加入队列，按顺序逐次粘贴，适合批量填表。
- **📦 堆叠复制** — 多次复制的内容合并为一条记录，保持上下文连贯。
- **🖥️ 多设备同步** — 基于 WebDAV 同步数据，每条记录自动标注来源设备。
- **🔍 高级搜索** — 支持关键词、短语、标签、类型、时间、大小等多种条件组合筛选。
- **⚡ 全局快捷键** — 所有操作均可通过快捷键完成，效率优先。

---

## 🚀 快速开始

### 系统要求

| 环境 | 版本 |
| --- | --- |
| 操作系统 | Windows 10 / 11 (x64) |
| 运行时 | 无需额外运行时（自带） |

### 安装

从 https://github.com/minghf85/EasyCPTrans/releases 下载最新版本的安装包：

```
EasyCPTrans_x.x.x_x64-setup.exe
```

推荐普通用户使用 NSIS 安装包。

### 首次启动

1. 启动 EasyCPTrans。
2. 复制任意文本。
3. 按默认快捷键 `Ctrl + Shift + V` 打开面板。
4. 点击卡片主内容区域即可粘贴。

---

## 📖 使用指南

### 核心操作

| 操作 | 说明 |
| --- | --- |
| 复制文本 / 图片 / 文件 | 自动生成对应类型的 Item |
| 点击卡片主内容 | 将该 Item 写入剪贴板并粘贴 |
| 点击卡片右上角菜单 | 管理置顶、私密、标签、删除 |
| 点击顶部搜索按钮 | 展开搜索框 |
| 点击 `Tags` 标签页 | 展开全部标签进行多选筛选 |
| 点击 `Settings` 标签页 | 打开设置页；再次点击保存设置 |

### 全局快捷键

| 功能 | 默认快捷键 |
| --- | --- |
| 打开 / 关闭面板 | `Ctrl + Shift + V` |
| 快捷索引粘贴 (#1 ~ #10) | `Ctrl + Shift + 1~9/0` |
| 队列粘贴 | `Ctrl + Alt + V` |
| 向上 / 向下堆叠 | `Ctrl + Alt + Up / Down` |
| 划词翻译 | `Alt + C` |

### 窗口内快捷键

| 快捷键 | 功能 |
| --- | --- |
| `T` | 打开 / 关闭当前 Item 的标签菜单 |
| `M` | 切换私密状态 |
| `P` | 切换置顶状态 |
| `Delete` | 删除当前 Item |

---

## 🌐 划词翻译

### 工作原理

1. 在任意应用中选中英文单词或短语。
2. 按 `Alt + C`。
3. EasyCPTrans 自动复制选区并弹出主面板。
4. 创建一个 `Word` Item，初始状态为“正在翻译”。
5. 查询本地 ECDICT 词典后，同一 Item 更新为翻译结果。
6. 翻译结果写回系统剪贴板。

### 翻译卡片内容

| 字段 | 说明 |
| --- | --- |
| 单词 | 原文 |
| 音标 | 英式 / 美式音标 |
| 词典标签 | Collins / Oxford / 考试标签 |
| 中文释义 | 中文解释 |
| English Definition | 英文释义 |
| 词性分布 | 各词性下的释义 |
| 词形变化 | 过去式、复数等 |
| 词频 | BNC / COCA / FRQ |

### 配置 ECDICT 词典

1. 下载[ecdict.db](https://github.com/minghf85/EasyCPTrans/releases/download/v0.1.1/ecdict.db)，stardict.db过大可自行构建转换。
2. 进入 `Settings → Translation → ECDICT path`。
3. 指定 `.db` 文件路径，例如：

```
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

3. 如果仅有 CSV 文件，需先转换为 SQLite：

```typescript
await api.convertEcdictCsvToSqlite(
  "D:/Project/EasyCPTrans/ECDICT/ecdict.csv",
  "D:/Project/EasyCPTrans/ECDICT/ecdict.db",
);

await api.convertEcdictCsvToSqlite(
  "D:/Project/EasyCPTrans/ECDICT/stardict/stardict.csv",
  "D:/Project/EasyCPTrans/ECDICT/stardict/stardict.db",
);
```

转换后的 SQLite 表名为 `stardict`，字段与 CSV 表头一致，并额外生成 `sw` 字段用于模糊匹配。

---

## 🏷️ 标签管理

### 系统标签

| 标签 | 说明 |
| --- | --- |
| `Text` | 文本 Item |
| `Image` | 图片 Item |
| `File` | 文件 Item |
| `Pinned` | 置顶 Item |
| `Private` | 私密 Item |
| `Word` | 翻译卡片 |
| 设备名 | 例如 `Office-PC`，自动生成 |

### 标签管理（Tag Admin）

入口：`Tag Admin` 标签页

支持操作：
- 创建、重命名、删除自定义标签
- 修改标签颜色
- 设置标签是否常驻顶部标签栏
- 重命名设备名标签

限制：
- `Text / Image / File / Pinned` 不可删除。
- 功能性系统标签不可删除。
- 普通 Item 的下拉菜单只显示可手动分配的用户标签。

### 多标签筛选

点击 `Tags` 标签页展开全部标签，支持多选 AND 筛选：

- 选择 `Text` + `Pinned` → 仅显示被置顶的文本 Item。
- 选择 `Word` + `Office-PC` → 仅显示来自 `Office-PC` 的翻译卡片。
- 再次点击已选标签取消该条件。
- 再次点击 `Tags` 标签页关闭列表并清空筛选。

---

## 🔍 高级搜索

点击顶部搜索按钮展开搜索框，支持以下语法：

| 语法 | 示例 | 说明 |
| --- | --- | --- |
| 普通关键词 | `hello` | 匹配内容、标签、来源应用等 |
| 精确短语 | `"hello world"` | 匹配连续短语 |
| 排除词 | `-draft` | 排除包含 draft 的 Item |
| 标签筛选 | `tag:work` | 筛选指定标签 |
| 类型筛选 | `type:text` | 筛选 Text / Image / File |
| 来源应用 | `app:chrome` | 按来源应用筛选 |
| 置顶筛选 | `is:pinned` | 只看置顶 Item |
| 私密筛选 | `is:private` | 只看私密 Item |
| 相对时间 | `after:7d` | 最近 7 天 |
| 指定日期 | `date:2026-07-25` | 筛选某一天 |
| 日期范围 | `date:2026-07-01..2026-07-25` | 筛选日期范围 |
| 具体时间范围 | `time:"2026-07-25 09:00..2026-07-25 18:30"` | 精确到分钟的时间段 |
| 文件大小 | `size:<5mb` | 文件或图片大小筛选 |
| 文本长度 | `len:>120` | 文本长度筛选 |

### 组合示例

```
tag:work type:text "meeting notes"
type:image after:7d
date:2026-07-01..2026-07-25 tag:Word
size:<5mb is:public
app:chrome -draft
```

---

## 🔒 私密内容

私密 Item 会被加密存储。

### 使用方式

1. 在 Item 菜单中选择 `Private`。
2. 首次使用需设置隐私密码和安全问题。
3. 私密 Item 内容会隐藏显示。
4. 查看时需输入密码解锁。

### 注意事项

- 请牢记隐私密码，遗忘后将无法直接恢复加密内容。
- 取消私密时需要解密恢复明文。

---

## ☁️ WebDAV 与多设备同步

### 配置

进入 `Settings → WebDAV` 进行配置。

### 设备标签

每台设备会自动生成设备名标签，例如：
- `#Office-PC`
- `#Laptop`

同步后可通过设备标签筛选特定设备的 Item。

---

## ⚙️ 设置

| 设置项 | 位置 | 说明 |
| --- | --- | --- |
| 语言 | `Settings → General → Language` | 简体中文 / 繁体中文 / English |
| 数据路径 | `Settings → General → Data path` | 指定数据存储目录 |
| 快捷键 | `Settings → Shortcuts` | 自定义所有快捷键 |
| 词典路径 | `Settings → Translation → ECDICT path` | 指定 ECDICT 词典文件路径 |
| WebDAV | `Settings → WebDAV` | 配置多设备同步 |

---

## 🛠️ 技术栈

| 层级 | 技术 |
| --- | --- |
| 框架 | Tauri 2 |
| 前端 | TypeScript 5, Vue 3 |
| 后端 | Rust (stable) |
| 数据库 | SQLite |
| 同步 | WebDAV |
| 打包 | MSI / NSIS |

---

## 💻 开发

### 环境要求

- Windows 10 / 11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2 CLI

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm tauri dev

# 前端构建
pnpm build

# 后端检查
cargo check --manifest-path src-tauri/Cargo.toml

# 发布打包
pnpm tauri build
```

---

## 🗺️ 路线图

- [ ] 跨平台支持（macOS / Linux）
- [ ] OCR 图片文字识别
- [ ] AI辅助翻译

---

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

---

## 🙏 致谢

- https://github.com/skywind3000/ECDICT — 英汉词典数据库
- https://github.com/ayangweb/tauri-plugin-clipboard-x — tauri-plugin-clipboard-x

