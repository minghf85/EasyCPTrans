# 划词翻译技术方案

## 目标

在不破坏现有剪贴板历史工作流的前提下，实现轻量、低延迟的划词翻译能力。

MVP 只支持英文单词和短语：

- 用户在任意应用中选中单词或短语。
- 按下划词翻译快捷键，默认 `Alt + C`。
- 应用自动复制选中内容，并把它写入历史剪贴板，生成一个新的 text item。
- 该 item 自动带上 `Word` tag，便于筛选和复习。
- 后端使用 ECDICT sqlite 本地词典检索释义。
- 面板立即弹出，先展示“查询中”状态。
- 翻译完成后，将该 item 内容替换为词典释义，同时把系统剪贴板更新为翻译后的内容。

## 推荐交互流程

### 正常流程

1. 用户划选文本。
2. 用户按 `Alt + C`。
3. 后端收到全局快捷键事件。
4. 后端模拟 `Ctrl + C`，等待短暂延迟后读取系统剪贴板文本。
5. 后端校验文本：
   - 去除首尾空白。
   - 只接受单词或短语。
   - 限制长度，例如 1 到 80 个字符。
   - 拒绝多行、大段文本、图片和文件。
6. 后端创建新的 text item：
   - `content_type = text`
   - `preview_text = 原始划词内容`
   - `tags` 包含 `Word`
   - `metadata.translationStatus = pending`
   - `metadata.wordQuery = 原始查询词`
7. 后端通知前端刷新历史并弹出主面板。
8. 后端异步查询 ECDICT。
9. 查询完成后，后端更新同一个 item：
   - `preview_text = 格式化后的词典释义`
   - `metadata.translationStatus = done`
   - `metadata.wordQuery = 原始查询词`
   - `metadata.dictionary = ECDICT`
10. 后端把翻译后的内容写入系统剪贴板。
11. 前端收到历史变更后自动刷新，卡片展示翻译结果。

### 失败流程

如果复制失败、查询词为空、词典无结果或数据库异常，不应阻塞主应用：

- 复制失败：不创建 item，显示错误提示。
- 输入不合法：不创建 item，显示 “Only words or short phrases are supported.”
- 无词典结果：保留原 item，把内容替换为可读提示，例如 `No ECDICT result for: xxx`。
- 数据库异常：保留原 item，metadata 标记 `translationStatus = error`。
- 翻译失败时不要覆盖系统剪贴板，避免污染用户当前剪贴板。

## 为什么先创建 item 再替换内容

这个策略符合当前项目的卡片式历史剪贴板模型：

- 面板可以立刻弹出，用户能看到系统已捕获到划词内容。
- 查询是异步的，慢词典 IO 不影响快捷键响应。
- 翻译结果复用现有 item 展示、筛选、复制、粘贴、tag 和编辑能力。
- 同一个 item 从 pending 变为 done，不会产生“原词 item + 翻译 item”两条重复历史。

## 快捷键实现

新增后端全局快捷键动作：

- 默认：`Alt + C`
- 设置项：`wordTranslateShortcut`
- action：`TranslateSelection`

建议继续沿用现有 `src-tauri/src/shortcuts.rs` 后端统一注册机制：

- `build_shortcut_bindings` 读取 `AppConfig.word_translate_shortcut`。
- `ShortcutAction` 增加 `TranslateSelection`。
- handler 中只做轻量派发，实际复制和查询放入 async task。

注意事项：

- 不要在快捷键 handler 里做数据库查询或长时间 sleep。
- 复制选中文本需要模拟 `Ctrl + C`，这会短暂改变系统剪贴板。
- 可以先保存当前剪贴板文本快照；但 MVP 可接受“划词内容成为最新剪贴板”，因为这是该功能目标的一部分。
- 不要复用 `Ctrl + C` 作为全局快捷键，避免和系统复制冲突。

## ECDICT sqlite 集成

### 文件位置

建议约定本地词典文件路径：

```text
app_data/
└── dictionaries/
    └── ec_dict.sqlite
```

也可以支持用户在设置中选择词典路径：

- 配置项：`ecdictPath`
- 默认值：空字符串
- 为空时使用 app data 默认路径。

### 连接策略

推荐独立 sqlite pool，不要和剪贴板历史数据库混用：

- 剪贴板库：负责历史 item。
- ECDICT 库：只读词典库。

后端可新增：

```rust
pub struct DictionaryState {
    pub pool: Option<SqlitePool>,
}
```

如果词典不存在：

- app 正常启动。
- 设置页显示词典未配置。
- 划词翻译返回可读错误，不影响剪贴板功能。

### 查询策略

单词查询：

- 原始词：`hello`
- 归一化：小写、trim。
- 优先 exact match。

短语查询：

- 原始短语：`look up`
- 归一化：小写、压缩连续空白。
- 优先 exact phrase match。
- MVP 不做复杂分词和模糊匹配。

后续可扩展：

- 词形还原：`running -> run`
- 简单 fallback：无结果时尝试去复数 `s`、过去式 `ed`、现在分词 `ing`
- 前缀匹配用于候选词，但不要默认替换 item 内容。

## 翻译结果格式

item 内容建议使用纯文本，方便直接复制粘贴。

示例：

```text
hello

[phonetic]
UK /həˈləʊ/  US /həˈloʊ/

[translation]
int. 你好；喂
n. 招呼；问候

[definition]
an expression of greeting

[source]
ECDICT
```

metadata 建议保留结构化字段，便于后续专用卡片 UI：

- `translationStatus`: `pending | done | error | notFound`
- `wordQuery`: 原始查询文本
- `dictionary`: `ECDICT`
- `phoneticUk`
- `phoneticUs`
- `translation`
- `definition`

## 前端展示

MVP 不需要新增专用页面，复用现有 ClipboardCard：

- pending 时显示原始划词内容。
- done 后显示格式化释义。
- item 自带 `Word` tag。

后续可以增加专用视觉优化：

- `Word` tag 卡片使用词典样式。
- 释义区域按 section 渲染。
- 支持点击原词发音、复制原词、复制释义。
- 支持收藏到高频词库。

## 与现有剪贴板监听的关系

划词翻译会主动模拟复制，因此会触发现有剪贴板监听。

建议避免重复 item 的策略：

1. 翻译快捷键任务负责创建 `Word` item。
2. 创建前设置一个短期抑制签名，例如原始划词文本。
3. 剪贴板 watcher 看到相同签名时跳过普通 ingest。
4. 翻译任务更新同一个 item，不创建第二条。

如果不做抑制，可能出现：

- 普通复制 item：`hello`
- 翻译 item：`hello` 或翻译结果

这会让历史列表变乱，因此抑制机制是 MVP 必做项。

## 后端命令建议

新增命令：

```text
translate_selection()
lookup_word(query: string)
set_dictionary_path(path: string)
get_dictionary_status()
```

其中 `translate_selection()` 是快捷键主入口，内部流程：

```text
simulate Ctrl+C
read clipboard text
validate query
create pending Word item
show panel
spawn dictionary lookup
update item with result
write result to clipboard
emit history changed
```

## 状态与事件

推荐新增事件：

- `easycp://translation-started`
- `easycp://translation-updated`
- `easycp://translation-failed`

前端可以先只依赖现有历史刷新事件；专用事件用于后续优化 loading 状态和错误提示。

## 后续计划

### 阶段 1：MVP

- 配置 `Alt + C` 全局快捷键。
- 模拟复制并读取划词文本。
- 校验单词和短语。
- 创建 pending `Word` item。
- 查询 ECDICT sqlite。
- 更新同一个 item 为翻译结果。
- 将翻译结果写回剪贴板。
- 避免 watcher 重复 ingest。

### 阶段 2：体验优化

- 设置页增加词典路径配置和状态检测。
- 无词典时提供明确引导。
- 卡片增加词典结果专用样式。
- 支持复制原词、复制释义、重新查询。
- 支持查询耗时和错误状态展示。

### 阶段 3：检索增强

- 支持词形还原。
- 支持短语 exact match。
- 支持简单候选词。
- 支持中英反查。
- 支持本地查询缓存。

### 阶段 4：学习工作流

- `Word` tag 下增加复习视图。
- 支持收藏、熟词隐藏、导出单词本。
- 支持按来源应用记录单词上下文。
- 支持 WebDAV 同步词库学习状态。

## 风险点

- 模拟 `Ctrl + C` 会临时覆盖系统剪贴板，需要明确这是功能预期。
- 全局快捷键不能使用过于常见组合，`Alt + C` 也可能与部分软件冲突，必须可配置。
- ECDICT 数据库体积较大，不应打包进主二进制；建议作为外部资源或用户配置。
- 查询不能阻塞快捷键 handler，否则会造成全局快捷键卡顿。
- 必须避免普通剪贴板 watcher 重复创建 item。
