# EasyCPTrans

EasyCPTrans 是一个面向 Windows 的轻量级剪贴板历史与划词翻译工具，重点是低延迟、离线可用、快捷键驱动和卡片式内容管理。

当前发布版本：`0.1.0`

## 主要功能

- 剪贴板历史：支持文本、图片、文件历史记录。
- 快捷粘贴：默认 `Ctrl + Shift + 1~9/0` 对应当前索引 `#1~#10`，不会改变 item 顺序。
- 队列粘贴：默认 `Ctrl + Alt + V`，按入队顺序逐个粘贴。
- 堆叠复制：默认 `Ctrl + Alt + Up/Down` 开启向上/向下堆叠，再次按下取消。
- 划词翻译：默认 `Alt + C`，使用本地 ECDICT SQLite 词典，生成带 `Word` tag 的翻译卡片。
- 搜索筛选：支持标签、类型、时间、大小和文本条件筛选。
- 窗口控制：支持置顶、拖拽、窗口位置和大小持久化。
- 隐私保护：支持私密 item 加密和解锁查看。
- WebDAV 同步：提供基础配置和同步入口。

## 默认快捷键

| 功能 | 默认快捷键 |
| --- | --- |
| 打开/关闭面板 | `Ctrl + Shift + V` |
| 快捷索引粘贴 | `Ctrl + Shift + 1~9/0` |
| 队列粘贴 | `Ctrl + Alt + V` |
| 向上/向下堆叠 | `Ctrl + Alt + Up/Down` |
| 划词翻译 | `Alt + C` |

快捷键可在设置页中修改。快捷索引粘贴只会把对应 item 写入当前剪贴板并模拟粘贴，不会新增历史 item，也不会改变当前索引顺序。

## 划词翻译词典

划词翻译使用 ECDICT 本地词典：

- 支持 SQLite 数据库路径配置。
- 默认会尝试读取 `ECDICT/ecdict.db`、`ECDICT/stardict/stardict.db` 等本地路径。
- CSV 可通过内置命令转换为 SQLite；发布包默认不内置大型词典数据。

建议使用 SQLite 词典以获得更低延迟。

## 开发环境

推荐环境：

- Windows 10/11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2 toolchain

安装依赖：

```bash
pnpm install
```

开发运行：

```bash
pnpm tauri dev
```

前端构建：

```bash
pnpm build
```

后端检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

发布打包：

```bash
pnpm tauri build
```

## 发布说明

### 0.1.0

- 完成基础剪贴板历史、卡片列表、搜索筛选、标签管理。
- 完成文本、图片、文件的读取、展示和粘贴。
- 完成快捷索引粘贴、队列粘贴、堆叠复制。
- 完成划词翻译 MVP，支持 ECDICT SQLite 本地词典和翻译卡片富文本展示。
- 完成窗口拖拽、置顶、位置大小持久化。
- 完成基础隐私保护、WebDAV 配置和同步入口。
- 修复数据路径读取、图片/文件大小、快捷粘贴稳定性、堆叠状态转换等问题。

## 项目结构

```text
EasyCPTrans/
├─ src/              # React 前端
├─ src-tauri/        # Tauri/Rust 后端
├─ TransTech.md      # 划词翻译技术文档
├─ README.md
└─ package.json
```

## 注意事项

- `ECDICT/` 目录包含大型词典源数据和数据库文件，默认被 `.gitignore` 忽略，不建议直接提交到仓库。
- 快捷键可能与系统或其他应用冲突，保存设置后可查看设置页提示。
- 图片快捷粘贴会复用缓存临时文件，以减少 data URL 重解码带来的延迟。
