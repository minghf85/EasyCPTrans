# EasyCPTrans

EasyCPTrans 是一个把「历史剪切板」和「划词翻译」结合起来的 Windows 桌面应用。
它不是单纯的剪切板列表，也不是一次性翻译弹窗，而是把翻译结果、标签、置顶、私密、多设备同步统一到同一套历史卡片里。

当前版本：`0.1.1`

## 核心能力

- 历史剪切板：文本、图片、文件统一卡片化展示
- 划词翻译：`Alt + C` 触发，生成 `Word` 卡片并更新为翻译内容
- 标签系统：支持多 Tag 筛选、Tag Admin 管理、快捷打标
- 快捷索引粘贴：`Ctrl + Shift + 1~9/0`
- 队列粘贴 / 堆叠复制：支持顺序粘贴与上下堆叠
- 多设备识别：自动添加设备名标签，便于 WebDAV 同步后追踪来源
- 隐私保护：支持 private item 加密
- 本地词典：ECDICT SQLite 翻译

## 主要流程

### 划词翻译

1. 在任意应用中选中英文单词或短语
2. 按 `Alt + C`
3. 程序自动复制选区并创建一个 `Word` item
4. 面板弹出后显示“正在翻译 xxx”
5. 翻译完成后，同一个 item 更新为富文本释义卡片
6. 翻译结果会写回当前剪切板，继续可直接粘贴

### 快捷索引粘贴

1. 面板中每个可见 item 对应 `#1 ~ #10`
2. 按 `Ctrl + Shift + 1~9/0`
3. 对应 item 先写入系统剪切板，再模拟粘贴
4. 不改变当前索引顺序，不创建新 item

### Tag Tab

点击 `Tags` Tab 会展开全部已有 Tag，包括：

- `Text`
- `Image`
- `File`
- `Pinned`
- 自定义 Tag

支持多选组合筛选，例如同时筛 `tag:work` 和 `Pinned`。

## 标签与元数据

- `Text / Image / File / Pinned` 是系统级标签，不参与普通 Tag 管理
- `Private`、`Word`、设备名标签属于功能性标签
- 设备名标签直接使用设备名本身，例如 `#Office-PC`
- 元数据中的 `type / pinned / private` 会与 Tag Admin 设置同步

## 设置

设置页支持：

- 简体中文 / 繁体中文 / English
- 全局快捷键
- 当前 item 快捷键
- ECDICT 路径
- WebDAV 同步
- 隐私设置

保存方式：再次点击 `Settings` Tab 即保存。

## ECDICT

翻译功能默认读取 ECDICT SQLite 数据库。

支持的词典路径示例：

- `ECDICT/ecdict.db`
- `ECDICT/stardict/stardict.db`

如果你手头只有 CSV，也可以先转换为 SQLite 再使用。

### CSV 转 SQLite

推荐将以下 CSV 转为 `.db`：

- `ECDICT/ecdict.csv`
- `ECDICT/stardict/stardict.csv`

转换完成后，在设置中选择生成的 `.db` 文件即可。

## 版本发布

`0.1.1` 重点更新：

- 补齐三语言界面
- 优化 Tag Admin UI
- `Tags` Tab 展开全部已有 Tag
- 完善系统标签与多 Tag 筛选
- 补齐设置页多语言文案

## 安装与开发

### 依赖

- Windows 10/11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2

### 开发运行

```bash
pnpm install
pnpm tauri dev
```

### 构建检查

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

### 发布打包

```bash
pnpm tauri build
```

## 文档

- `Technology.md`：项目结构、接口、事件、数据模型
- `TransTech.md`：划词翻译专用技术说明

