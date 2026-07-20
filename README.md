# EasyCPTrans

EasyCPTrans 是一个面向 Windows 的轻量化、离线、方便快捷、好看好用的桌面效率工具。

长期目标：

- 剪贴板历史
- 各种快捷复制粘贴操作
- 划词翻译
- OCR 翻译
- 剪贴板与翻译功能联动

当前阶段目标：

- 只实现 Windows 本地离线剪贴板基础功能
- 不做多端同步
- 不兼容旧产品格式和旧路线
- 主界面视觉对标 macOS `Paste / Deck`

## 当前产品定位

截至 `2026-07-20`，EasyCPTrans 当前是一个：

- `Windows only`
- `offline first`
- `local clipboard history manager`
- `Paste / Deck style floating panel`

的桌面工具。

它现在聚焦在剪贴板基础能力，后续再扩展到翻译和 OCR。

## 当前已实现内容

### 1. 基础剪贴板历史

- 采集文本、图片、文件三类剪贴板内容
- 本地 SQLite 持久化保存历史
- 非私密内容按 `content_hash` 去重
- 支持条目使用次数和最近使用时间记录

### 2. 剪贴板监听路线

- 已切换到 `tauri-plugin-clipboard-next` 方案
- 面向多类型剪贴板数据监听和通信
- 当前前端使用 `tauri-plugin-clipboard-next-api`
- 后端使用 `tauri-plugin-clipboard-next`

插件链接：

`https://github.com/zhoushi1/tauri-plugin-clipboard-next`

### 3. 当前支持的交互

- 全局快捷键唤起窗口
- 搜索历史
- 按类型筛选
- 标签筛选
- 时间 / 文本长度 / 文件大小筛选
- 键盘上下选择
- 回车复制
- 复制后自动粘贴
- `Esc` 收起窗口
- 置顶窗口
- 固定 / 删除 / 标签编辑
- 文本快速编辑

### 4. 隐私能力

- 私密条目加密存储
- 隐私密码和安全问题
- 私密条目解密恢复
- 私密条目列表脱敏显示

### 5. 当前视觉方向

- 主界面改为浮层式面板
- 卡片式历史项布局
- 胶囊筛选条
- 大圆角、轻玻璃、轻阴影
- 整体方向参考 `EasyCPTrans.html`
- 视觉风格对标 macOS `Paste / Deck`

## 当前没有实现的内容

下面这些属于后续阶段，不是当前版本的交付范围。

### 1. 翻译相关

- 划词翻译
- OCR 翻译
- 图片文字提取
- 翻译结果回写剪贴板
- 剪贴板与翻译联动工作流

### 2. 更完整的 Paste 级能力

- Collections / Snippets
- 更成熟的收藏和分类体系
- 更细的动画和交互 polish
- 更完整的快捷数字选择与顺序粘贴
- 纯文本粘贴 / 多模式粘贴

### 3. 平台与同步

- macOS 支持
- 多端同步
- WebDAV / 云同步
- 远程合并与冲突处理

## 当前技术栈

### 前端

- React
- TypeScript
- Tailwind CSS
- Tauri API
- `tauri-plugin-clipboard-next-api`

### 后端

- Tauri v2
- Rust
- SQLite
- `tauri-plugin-clipboard-next`

## 项目结构

```text
EasyCPTrans/
├─ src/
│  ├─ components/
│  ├─ hooks/
│  ├─ lib/
│  ├─ App.tsx
│  └─ types.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands.rs
│  │  ├─ db.rs
│  │  ├─ lib.rs
│  │  ├─ privacy.rs
│  │  └─ pipeline/
│  ├─ capabilities/
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ EasyCPTrans.html
└─ README.md
```

## 运行与构建

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

检查命令：

```bash
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vite\bin\vite.js build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## 接下来建议的开发顺序

建议按下面顺序继续推进：

1. 稳定当前 Windows 剪贴板基础链路
2. 继续把界面细节拉齐到 `Paste / Deck`
3. 做更完整的快捷复制粘贴工作流
4. 引入划词翻译
5. 引入 OCR 翻译
6. 最后再考虑剪贴板与翻译联动、以及多端同步