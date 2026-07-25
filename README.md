# EasyCPTrans

EasyCPTrans 是一个把「历史剪切板」和「划词翻译」良性结合的 Windows 桌面应用。

传统剪切板工具解决的是“复制过什么、如何快速再粘贴”；传统划词翻译解决的是“选中一个词后马上查意思”。EasyCPTrans 把这两件事合到同一个工作流里：划词翻译的结果会自然沉淀为历史剪切板 item，以卡片形式保存、筛选、复用、粘贴和整理。

当前版本：`0.1.0`

## 核心理念

- 翻译不是一次性弹窗，而是一条可复用的历史记录。
- 剪切板历史不是纯文本列表，而是可管理、可筛选、可快捷粘贴的卡片集合。
- 划词翻译使用本地 ECDICT SQLite 词典，优先保证离线、低延迟和隐私。
- 快捷键逻辑尽量后端化，减少前端焦点、渲染和事件延迟带来的不稳定。

## 典型流程

### 划词翻译

1. 在任意应用中选中英文单词或短语。
2. 按 `Alt + C`。
3. EasyCPTrans 自动复制选中内容，弹出主面板。
4. 面板中出现一个 `正在翻译 "xxx"` 的 `Word` 卡片。
5. 查询完成后，同一个卡片被替换为结构化词典释义。
6. 翻译结果同时写入当前系统剪切板，可继续粘贴到其他应用。

这个流程不会产生“原词 item + 翻译 item”的重复历史，而是一个 item 从 pending 状态更新为 done 状态。

### 快捷索引粘贴

1. 面板内每个可见 item 显示 `#1 ~ #10` 快捷索引。
2. 按 `Ctrl + Shift + 1~9/0`。
3. 对应 item 被写入系统剪切板并立即粘贴。
4. 不新增历史 item，不改变索引顺序。

### 队列与堆叠

- 队列粘贴适合按固定顺序粘贴多条内容。
- 堆叠复制适合把后续复制内容合并为一个 item，直到粘贴或取消堆叠。

## 功能概览

- 历史剪切板：文本、图片、文件。
- 卡片式展示：类型、标签、索引、队列序号、pin/private 状态。
- 快捷索引粘贴：低延迟快速粘贴当前 `#1~#10`。
- 队列粘贴：按入队顺序逐个粘贴。
- 堆叠复制：向上/向下追加复制内容。
- 划词翻译：本地 ECDICT SQLite 查询，翻译结果以富文本卡片展示。
- 标签系统：创建、筛选、快捷添加 tag。
- 搜索筛选：支持文本、类型、标签、应用、日期、大小等条件。
- 窗口控制：拖拽、置顶、位置和大小持久化。
- 隐私保护：private item 加密存储，支持解锁查看。
- WebDAV：保留同步配置和基础同步入口。

## 搜索与筛选

点击顶部搜索按钮后可以进行全文搜索，也可以使用结构化语法缩小范围。

常用语法：

| 语法 | 示例 | 说明 |
| --- | --- | --- |
| 普通关键词 | `hello` | 匹配 item 内容、标签和来源应用 |
| 精确短语 | `"hello world"` | 匹配连续短语 |
| 标签 | `tag:work` | 只看包含指定 tag 的 item |
| 来源应用 | `app:chrome` | 按复制来源窗口/应用筛选 |
| 类型 | `type:text`、`type:image`、`type:file` | 按 item 类型筛选 |
| 时间 | `date:today`、`date:7d` | 按最近时间范围筛选 |
| 大小 | `size:<5mb`、`size:>100kb` | 按文本/文件/图片大小筛选 |
| 隐私 | `is:private`、`is:public` | 按 private 状态筛选 |

可以组合使用，例如：

```text
tag:word type:text app:chrome "specific"
type:image date:7d
size:<5mb is:public
```

## 默认快捷键

| 功能 | 默认快捷键 |
| --- | --- |
| 打开/关闭面板 | `Ctrl + Shift + V` |
| 快捷索引粘贴 | `Ctrl + Shift + 1~9/0` |
| 队列粘贴 | `Ctrl + Alt + V` |
| 向上/向下堆叠 | `Ctrl + Alt + Up/Down` |
| 划词翻译 | `Alt + C` |
| 当前 item 添加 tag | `T` |
| 当前 item private 切换 | `M` |
| 当前 item pin 切换 | `P` |
| 删除当前 item | `Delete` |

所有快捷键可在设置页中修改。`T/M/P/Delete` 是窗口内快捷键，只在 EasyCPTrans 窗口获得焦点时生效。

## ECDICT 词典

划词翻译使用 ECDICT 本地词典，推荐使用 SQLite：

- 可在设置页配置词典路径。
- 默认会尝试读取 `ECDICT/ecdict.db`、`ECDICT/stardict/stardict.db` 等本地路径。
- 发布包不内置大型词典数据库；本地开发可从 CSV 转换为 SQLite。
- 词典字段包括 `word`、`phonetic`、`definition`、`translation`、`pos`、`collins`、`oxford`、`tag`、`bnc`、`frq`、`exchange` 等。

翻译卡片会把音标、中文释义、英文释义、词性分布、词形变化、词频和考试标签分区展示。

### CSV 转 SQLite

如果你本地只有 ECDICT CSV 数据，可以先转换为 SQLite 数据库，再在设置页中选择 `.db` 文件。

默认支持的 CSV 文件：

```text
ECDICT/ecdict.csv
ECDICT/stardict/stardict.csv
```

建议转换后的输出路径：

```text
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

应用后端已经提供转换命令，二次开发或调试时可通过前端 API 调用：

```ts
await api.convertEcdictCsvToSqlite(
  "D:/Project/EasyCPTrans/ECDICT/ecdict.csv",
  "D:/Project/EasyCPTrans/ECDICT/ecdict.db",
);

await api.convertEcdictCsvToSqlite(
  "D:/Project/EasyCPTrans/ECDICT/stardict/stardict.csv",
  "D:/Project/EasyCPTrans/ECDICT/stardict/stardict.db",
);
```

转换后的 SQLite 表名为 `stardict`，字段与 ECDICT CSV 表头一致，并额外生成 `sw` 字段用于 strip-word 匹配。转换完成后可以在设置页的 `ECDICT path` 中选择任意一个 `.db` 文件；如果不手动配置，应用会按默认候选路径自动查找。

## 安装包

`0.1.0` Windows x64 发布产物：

- MSI：`src-tauri/target/release/bundle/msi/EasyCPTrans_0.1.0_x64_en-US.msi`
- NSIS：`src-tauri/target/release/bundle/nsis/EasyCPTrans_0.1.0_x64-setup.exe`

## 开发环境

推荐环境：

- Windows 10/11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2

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

## 文档

- `Technology.md`：项目结构、接口、事件、数据模型和二次开发说明。
- `TransTech.md`：划词翻译功能的技术方案和后续规划。

## 0.1.0 发布说明

- 完成历史剪切板基础链路。
- 完成文本、图片、文件读取、展示和粘贴。
- 完成快捷索引粘贴、队列粘贴和堆叠复制。
- 完成划词翻译 MVP，支持 ECDICT SQLite 和翻译卡片富文本展示。
- 完成窗口拖拽、置顶、位置大小持久化。
- 完成 private item 加密和解锁。
- 修复数据路径读取、图片/文件大小、快捷粘贴稳定性、堆叠状态转换、快捷索引不改序等问题。

## 注意事项

- `ECDICT/` 包含大型词典数据和生成数据库，默认被 `.gitignore` 忽略。
- 快捷键可能与系统或其他应用冲突，可在设置页修改。
- 当前主要面向 Windows；其他平台需要额外适配剪切板、快捷键和窗口行为。

## 致谢

- [tauri-plugin-clipboard-x](https://github.com/ayangweb/tauri-plugin-clipboard-x)
- [ECDICT](https://github.com/skywind3000/ECDICT)

## Device Source Tags

- Every newly created clipboard item automatically receives a device source tag using the device name directly, formatted as `#<device name>`.
- Device tags are system-level metadata, same as `#Text`, `#Image`, and `#File`: they are shown on cards and can be used for filtering, but they are not manually edited in the normal tag picker.
- The device name is configured in Settings under WebDAV. When it is renamed, matching local history records are migrated from the old `#Device...` tag to the new one.
- This is designed for WebDAV sync: after multiple devices sync into one history database, each card still shows which device produced it.
