# EasyCPTrans

EasyCPTrans 是一个把「历史剪切板」和「划词翻译」结合起来的 Windows 桌面应用。
它不是单纯记录复制历史，也不是一次性翻译弹窗，而是把复制、翻译、标签、筛选、置顶、私密和多设备来源统一到同一套卡片式历史剪切板中。

当前版本：`0.1.1`

## 适用场景

- 经常复制文本、图片、文件，需要快速找回和再次粘贴
- 需要在阅读英文材料时划词翻译，并希望翻译结果可沉淀、可复用
- 需要用 Tag 管理剪切板内容，例如 `work`、`prompt`、`paper`
- 需要在多设备同步后知道某条内容来自哪台设备
- 需要临时把多次复制内容合并成一个 item

## 核心概念

### Item

每次复制产生一条历史记录，称为 item。

item 可能是：

- `Text`
- `Image`
- `File`
- `Word` 翻译卡片

### Tag

Tag 用于分类和筛选。

内置功能标签：

- `Text`
- `Image`
- `File`
- `Pinned`
- `Private`
- `Word`
- 设备名，例如 `Office-PC`

用户也可以创建自己的 Tag。

### Card

每个 item 在主界面中以卡片显示。卡片上会显示：

- 内容预览
- 类型
- Tag
- 文件 / 图片大小
- 创建或使用时间
- 快捷索引 `#1 ~ #10`
- pinned / private 状态

## 快速开始

### 安装

Windows x64 构建产物通常在：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

推荐普通用户使用 NSIS 安装包：

```text
EasyCPTrans_0.1.1_x64-setup.exe
```

### 首次启动

1. 启动 EasyCPTrans
2. 复制任意文本
3. 按默认快捷键 `Ctrl + Shift + V` 打开面板
4. 点击卡片主内容区域即可粘贴

### 基础使用

| 操作 | 说明 |
| --- | --- |
| 复制文本 | 自动生成 Text item |
| 复制图片 | 自动生成 Image item |
| 复制文件 | 自动生成 File item |
| 点击卡片主内容 | 将该 item 写入剪切板并粘贴 |
| 点击卡片右上角菜单 | 管理 pin、private、tag、delete |
| 点击顶部搜索按钮 | 展开搜索框 |
| 点击 `Tags` Tab | 展开全部 Tag 多选筛选 |
| 点击 `Settings` Tab | 打开设置页 |
| 再次点击 `Settings` Tab | 保存设置 |

## 主界面说明

### 顶部工具栏

从左到右主要包含：

1. 拖拽按钮：拖动窗口位置
2. 置顶按钮：切换窗口 always-on-top
3. 搜索按钮：展开搜索框
4. Tab 列表：快速筛选内容

### Tab

默认 Tab：

- `All`：全部 item
- `Text`：文本 item
- `Image`：图片 item
- `File`：文件 item
- `Pinned`：置顶 item
- `Tags`：展开全部 Tag，用于多选筛选
- `Tag Admin`：管理 Tag
- `Settings`：设置

用户设置为常驻的 Tag 会显示在顶部 Tab 中。

## Tags Tab 多选筛选

点击 `Tags` Tab 会横向展开全部已有 Tag，包括系统 Tag 和自定义 Tag。

系统 Tag：

- `Text`
- `Image`
- `File`
- `Pinned`
- `Private`
- `Word`
- 设备名 Tag

筛选规则：

- 多选是 AND 逻辑
- 选择 `Text` + `Pinned` 表示只显示被置顶的文本 item
- 选择 `Word` + `Office-PC` 表示只显示来自 `Office-PC` 的翻译卡片
- 再次点击已选 Tag 会取消该条件
- 再次点击 `Tags` Tab 会关闭 Tag 列表并清空 Tag 筛选

## 搜索功能

点击顶部搜索按钮展开搜索框。

支持普通关键词和结构化语法。

| 语法 | 示例 | 说明 |
| --- | --- | --- |
| 普通关键词 | `hello` | 匹配内容、Tag、来源应用等 |
| 精确短语 | `"hello world"` | 匹配连续短语 |
| 排除词 | `-draft` | 排除包含 draft 的 item |
| Tag | `tag:work` | 筛选指定 Tag |
| 类型 | `type:text` | 筛选 Text / Image / File |
| 来源应用 | `app:chrome` | 按来源应用筛选 |
| 置顶 | `is:pinned` | 只看置顶 item |
| 私密 | `is:private` | 只看 private item |
| 时间 | `after:7d` | 最近 7 天 |
| 指定日期 | `date:2026-07-25` | 筛选某一天 |
| 日期范围 | `date:2026-07-01..2026-07-25` | 筛选开始日期到结束日期 |
| 具体时间范围 | `time:"2026-07-25 09:00..2026-07-25 18:30"` | 筛选精确到分钟的时间段 |
| 大小 | `size:<5mb` | 文件或图片大小筛选 |
| 文本长度 | `len:>120` | 文本长度筛选 |

示例：

```text
tag:work type:text "meeting notes"
type:image after:7d
date:2026-07-01..2026-07-25 tag:Word
time:"2026-07-25 09:00..2026-07-25 18:30" type:text
size:<5mb is:public
app:chrome -draft
```

时间范围说明：

- `date:YYYY-MM-DD` 匹配当天 00:00:00 到 23:59:59
- `date:start..end` 匹配两个日期之间的完整日期范围
- `time:start..end` 支持具体时间，推荐用引号包住带空格的范围
- 范围分隔符支持 `..` 或 `~`
- 开放范围可写成 `date:2026-07-01..` 或 `date:..2026-07-25`
- `after:` / `since:` 和 `before:` / `until:` 可继续单独使用

## 划词翻译

默认快捷键：`Alt + C`

使用步骤：

1. 在任意应用中选中英文单词或短语
2. 按 `Alt + C`
3. EasyCPTrans 自动复制选区
4. 弹出主面板
5. 创建一个 `Word` item，初始状态为“正在翻译”
6. 查询 ECDICT 完成后，同一个 item 更新为翻译结果
7. 翻译结果写回系统剪切板

翻译卡片会展示：

- 单词
- 音标
- Collins / Oxford / 考试标签
- 中文释义
- English Definition
- 词性分布
- 词形变化
- BNC / COCA / FRQ 词频

注意：

- 当前仅支持英文单词和短语
- 翻译依赖本地 ECDICT 数据
- 翻译不会生成“原词 item + 翻译 item”的重复卡片，而是同一个 item 从 pending 更新为 done

## ECDICT 词典配置

推荐使用 SQLite 数据库。

设置位置：

```text
Settings -> Translation -> ECDICT path
```

支持路径示例：

```text
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

### CSV 转 SQLite

如果只有 CSV，可先转换：

```text
ECDICT/ecdict.csv
ECDICT/stardict/stardict.csv
```

转换输出建议：

```text
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

二次开发时可以调用：

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

转换后的 SQLite 表名为 `stardict`，字段与 ECDICT CSV 表头一致，并额外生成 `sw` 字段用于 strip-word 匹配。

## 快捷键

默认快捷键：

| 功能 | 默认快捷键 |
| --- | --- |
| 打开 / 关闭面板 | `Ctrl + Shift + V` |
| 快捷索引粘贴 | `Ctrl + Shift + 1~9/0` |
| 队列粘贴 | `Ctrl + Alt + V` |
| 向上 / 向下堆叠 | `Ctrl + Alt + Up/Down` |
| 划词翻译 | `Alt + C` |
| 当前 item 添加 Tag | `T` |
| 当前 item private 切换 | `M` |
| 当前 item pin 切换 | `P` |
| 删除当前 item | `Delete` |

说明：

- 所有快捷键都可在设置页修改
- `T / M / P / Delete` 是窗口内快捷键，只在 EasyCPTrans 窗口获得焦点时生效
- 快捷索引粘贴不会改变 item 顺序
- 如果快捷键与系统或其他应用冲突，请在设置中调整

## 快捷索引粘贴

默认快捷键：`Ctrl + Shift + 1~9/0`

流程：

1. 当前页面可见 item 显示 `#1 ~ #10`
2. 按对应快捷键
3. 后端按当前排序找到对应 item
4. 写入系统剪切板
5. 模拟 `Ctrl + V`
6. 不更新 item 顺序
7. 不新增历史 item

适合快速粘贴固定位置的最近内容。

## 队列粘贴

默认快捷键：`Ctrl + Alt + V`

使用方式：

1. 在面板中把多个 item 加入队列
2. 按 `Ctrl + Alt + V`
3. 每按一次粘贴队列中的下一个 item
4. 队列状态会同步显示在界面中

适合批量填表、按固定顺序粘贴多段内容。

## 堆叠复制

默认 Prefix：`Ctrl + Alt`

使用方式：

- `Ctrl + Alt + Up`：向上堆叠
- `Ctrl + Alt + Down`：向下堆叠

行为：

1. 按下堆叠快捷键后进入堆叠模式
2. 后续复制的文本会合并到同一个 item 中
3. 每次堆叠后都会把当前堆叠结果写到系统剪切板
4. 粘贴后自动退出堆叠模式
5. 未粘贴时，再次按对应堆叠快捷键会取消堆叠

向上堆叠适合把新内容放到前面；向下堆叠适合按复制顺序追加。

## Tag Admin

入口：

```text
Tag Admin
```

支持操作：

- 创建自定义 Tag
- 重命名自定义 Tag
- 删除自定义 Tag
- 修改 Tag 颜色
- 设置是否常驻顶部 Tab
- 修改设备名 Tag

限制：

- `Text / Image / File / Pinned` 不可删除
- 功能性系统 Tag 不可删除
- 普通 item 的下拉菜单只显示可手动分配的用户 Tag
- 设备名 Tag 是系统 Tag，但允许重命名

设备名 Tag 重命名后：

1. 更新配置中的设备名
2. 更新历史 item 中旧设备名 Tag
3. 更新顶部 Tab
4. 更新 metadata 显示颜色

## 当前 item 快捷操作

当 EasyCPTrans 窗口获得焦点时：

| 快捷键 | 功能 |
| --- | --- |
| `T` | 打开 / 关闭当前 item 的 Tag 菜单 |
| `M` | 切换 private 状态 |
| `P` | pin / unpin |
| `Delete` | 删除当前 item |

说明：

- `P` pin 一个 item 时会固定到所有 pinned item 的最前面
- 对 pinned item 再按 `P` 会取消 pin，并放回非 pinned 区最新位置
- `M` 不会改变 item 顺序
- `T` 在 Tag 菜单打开时再次按下会关闭菜单

## 私密内容

private item 会被加密存储。

使用方式：

1. 在 item 菜单中选择 private
2. 首次使用需要设置隐私密码和安全问题
3. private item 内容会隐藏
4. 解锁时需要输入密码

注意：

- 请记住隐私密码
- private item 取消私密时需要解密恢复明文
- 如果忘记密码，无法直接恢复加密内容

## WebDAV 与设备标签

WebDAV 用于多设备同步。

设置位置：

```text
Settings -> WebDAV
```

每台设备会自动生成设备名 Tag，例如：

```text
#Office-PC
#Laptop
```

用途：

- 同步后知道 item 来源设备
- 可通过 `Tags` Tab 按设备筛选
- 可在 Tag Admin 中修改设备名

## 语言设置

设置位置：

```text
Settings -> General -> Language
```

支持：

- 简体中文
- 繁体中文
- English

注意：

- `Text / Image / File / Pinned` 固定显示英文
- 其他设置项、说明、Tag Admin 等会随语言切换
- 修改后再次点击 `Settings` Tab 保存

## 数据路径

设置位置：

```text
Settings -> General -> Data path
```

说明：

- EasyCPTrans 只读取当前 Data path 下的数据
- 删除 Data path 中的数据库后，再启动不会从其他路径恢复旧数据
- 修改 Data path 后建议重启应用，确保路径切换完全生效

## 开发运行

依赖：

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

## 排错

### 快捷键不生效

- 检查是否被系统或其他应用占用
- 在设置页重新录制快捷键
- 保存后确认 Settings Tab 出现 check 状态

### 划词翻译无结果

- 确认选中内容是英文单词或短语
- 确认 ECDICT path 指向 `.db`
- 如果只有 CSV，先转换为 SQLite
- 查看后端 `[EasyCPTrans]` 日志

### 图片或文件没有正确显示大小

- 确认复制来源应用确实提供文件路径或图片数据
- 重新复制一次
- 查看 ingest pipeline 日志

### 删除数据库后仍看到旧数据

- 确认删除的是当前 Settings 中的 Data path
- EasyCPTrans 只读取当前 Data path
- 修改 Data path 后建议重启

### Tag 颜色没有同步

- 在 Tag Admin 修改颜色后，返回列表应立即刷新
- 系统 metadata badge 也会使用 Tag Admin 中的颜色

## 版本说明

### 0.1.1

- 补齐三语言界面
- 优化 Tag Admin UI
- `Tags` Tab 展开全部已有 Tag
- 完善系统标签与多 Tag 筛选
- 补齐设置页多语言文案

## 更多文档

- `Technology.md`：项目结构、接口、事件、数据模型和扩展点
- `TransTech.md`：划词翻译实现与后续计划
