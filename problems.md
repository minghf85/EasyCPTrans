在 Tauri（主要指 **v2 版本**）中实现快捷键的防冲突、录制与监听，核心依赖 **`tauri-plugin-global-shortcut`** 插件。以下是完整的操作逻辑与前置流程拆解：

## 必备前置流程
在使用任何快捷键 API 前，必须完成以下三步配置，否则功能会被安全策略拦截：
1. **安装插件**
   - 命令行执行：`npm run tauri add global-shortcut`（或 `cargo add tauri-plugin-global-shortcut`）。
2. **初始化插件（Rust 侧）**
   - 在 `src-tauri/src/lib.rs` 的 `tauri::Builder` 中通过 `.plugin(tauri_plugin_global_shortcut::Builder::new().build())` 初始化。
3. **配置 Capabilities 权限**
   - 在 `src-tauri/capabilities/default.json` 中添加权限，否则前端/后端调用会失败：
     ```json
     "permissions": [
       "global-shortcut:allow-register",
       "global-shortcut:allow-unregister",
       "global-shortcut:allow-is-registered"
     ]
     ```
   

## 读取与防止冲突（isRegistered）
Tauri **无法直接读取系统全局其他应用已注册的快捷键**，其 `isRegistered` 只能检测**当前应用自身**是否已注册该组合。防止冲突的策略通常是“预检 + 降级”：
- **预检判断**：注册前调用 `isRegistered(shortcut)`，若返回 `true` 说明本应用已占用，需提示用户或跳过。
- **捕获注册失败**：若快捷键被系统/其他软件占用，`register` 在 Rust 侧会返回 `Err`，JS 侧则静默失败或不触发回调。因此建议在 Rust 侧用 `match` 处理 `Err` 并 fallback 到备用快捷键（如 `Ctrl+Alt+...`）。
- **最佳实践**：提供用户自定义设置面板，避免硬编码热门快捷键（如 `Ctrl+C`、`Alt+Tab`）。

## 录制快捷键（Key Down 捕获）
Tauri 没有内置的“录制 UI”，需在前端（渲染层）自行实现监听逻辑：
- **前端监听**：在应用**聚焦**时，给窗口添加 `keydown` 事件监听（**注意**：`window.addEventListener` 仅窗口聚焦有效，不能做全局后台录制）。
- **拼接字符串**：在回调中读取 `event.ctrlKey`、`event.shiftKey`、`event.altKey` 及 `event.key`，按 Tauri 格式拼接成 `CommandOrControl+Shift+K` 这类字符串。
- **校验与存储**：拼接好后调用 `isRegistered` 检查，合法则存入 `tauri-plugin-store` 或配置文件，再通过 Rust/JS 重新 `register`。

## 监听与注册快捷键
分为 **全局（后台生效）** 与 **窗口内（仅聚焦）** 两种：
- **全局监听（核心插件）**
  - **JS 侧**：`import { register } from '@tauri-apps/plugin-global-shortcut';` 然后 `await register('Ctrl+Shift+A', (event) => { if(event.state === 'Pressed') {...} });`。
  - **Rust 侧**：在 `Builder::new().with_handler(...)` 里匹配 `ShortcutState::Pressed` 执行逻辑，性能更好且不易因前端刷新失效。
- **窗口内监听**
  - 直接用前端 DOM 的 `keydown` 事件，适合非全局的操作（如输入框内的 `Ctrl+A`）。
- **注销**：窗口关闭或切换配置时必须 `unregister` 或 `unregisterAll`，否则快捷键会僵死占用系统资源。

## 特别注意事项（Windows 侧）
- **刷新失效**：若在 JS 侧注册，前端页面 `refresh` 会导致快捷键丢失，需在页面加载生命周期中重新注册。
- **管理员权限**：部分系统级快捷键（如 `Win+...`）在 Windows 上即使 Tauri 也无权注册，需引导用户避开或申请更高权限。

默认按键逻辑如下
唤出与界面逻辑（Paste 基因）
全局快捷键唤出：默认 Win+Shift+V 在光标附近弹出悬浮面板，不抢占焦点，失焦自动收起。
键盘流与导航逻辑（Deck 基因）
纯键盘操作：面板唤出后方向键导航，Enter 粘贴，Esc 关闭。
数字快捷粘贴：每条显示序号，Win+Shift+F1-F10 直接粘贴对应最近条目，无需先唤出面板。
队列顺序粘贴（Stack）：通过在面板界面使用Space标记，选中多条加入队列，触发队列模式后按设定热键逐条按顺序粘贴，适合填表与搬运。