<div align="center">

# EasyCPTrans

**Clipboard History & On-the-fly Translation — All in One**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-20232a.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-dea584.svg)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

[English](./README.md) · [简体中文](./README_ZH_CN.md) · 繁體中文

</div>

---

## ✨ 功能特性

- **📋 剪貼簿歷史** — 自動記錄文字、圖片、檔案的複製歷史，隨時回溯與再次貼上。
- **🌐 劃詞翻譯** — 選取英文單字或片語，一鍵查詢本地詞典，翻譯結果保存為可重複使用的卡片。
- **🏷️ 標籤管理** — 內建類型標籤與使用者自訂標籤，支援多標籤 AND 篩選。
- **📌 置頂與私密** — 重要內容可置頂，敏感內容可加密儲存。
- **🔗 佇列貼上** — 將多條記錄加入佇列，依序逐次貼上，適合批次填表。
- **📦 堆疊複製** — 多次複製的內容合併為一條記錄，保持上下文連貫。
- **🖥️ 多裝置同步** — 基於 WebDAV 同步資料，每條記錄自動標註來源裝置。
- **🔍 進階搜尋** — 支援關鍵字、片語、標籤、類型、時間、大小等多種條件組合篩選。
- **⚡ 全域快捷鍵** — 所有操作皆可透過快捷鍵完成，效率優先。

---

## 🚀 快速開始

### 系統需求

| 環境 | 版本 |
| --- | --- |
| 作業系統 | Windows 10 / 11 (x64) |
| 執行環境 | 無需額外執行環境（自帶） |

### 安裝

從 https://github.com/minghf85/EasyCPTrans/releases 下載最新版本的安裝包：

```
EasyCPTrans_x.x.x_x64-setup.exe
```

建議一般使用者使用 NSIS 安裝包。

### 首次啟動

1. 啟動 EasyCPTrans。
2. 複製任意文字。
3. 按下預設快捷鍵 `Ctrl + Shift + V` 開啟面板。
4. 點擊卡片主內容區域即可貼上。

---

## 📖 使用指南

### 核心操作

| 操作 | 說明 |
| --- | --- |
| 複製文字 / 圖片 / 檔案 | 自動產生對應類型的 Item |
| 點擊卡片主內容 | 將該 Item 寫入剪貼簿並貼上 |
| 點擊卡片右上角選單 | 管理置頂、私密、標籤、刪除 |
| 點擊頂部搜尋按鈕 | 展開搜尋框 |
| 點擊 `Tags` 分頁標籤 | 展開全部標籤進行多選篩選 |
| 點擊 `Settings` 分頁標籤 | 開啟設定頁；再次點擊儲存設定 |

### 全域快捷鍵

| 功能 | 預設快捷鍵 |
| --- | --- |
| 開啟 / 關閉面板 | `Ctrl + Shift + V` |
| 快速索引貼上 (#1 ~ #10) | `Ctrl + Shift + 1~9/0` |
| 佇列貼上 | `Ctrl + Alt + V` |
| 向上 / 向下堆疊 | `Ctrl + Alt + Up / Down` |
| 劃詞翻譯 | `Alt + C` |

### 視窗內快捷鍵

| 快捷鍵 | 功能 |
| --- | --- |
| `T` | 開啟 / 關閉目前 Item 的標籤選單 |
| `M` | 切換私密狀態 |
| `P` | 切換置頂狀態 |
| `Delete` | 刪除目前 Item |

---

## 🌐 劃詞翻譯

### 運作原理

1. 在任意應用程式中選取英文單字或片語。
2. 按下 `Alt + C`。
3. EasyCPTrans 自動複製選取內容並彈出主面板。
4. 建立一個 `Word` Item，初始狀態為「正在翻譯」。
5. 查詢本地 ECDICT 詞典後，同一 Item 更新為翻譯結果。
6. 翻譯結果寫回系統剪貼簿。

### 翻譯卡片內容

| 欄位 | 說明 |
| --- | --- |
| 單字 | 原文 |
| 音標 | 英式 / 美式音標 |
| 詞典標籤 | Collins / Oxford / 考試標籤 |
| 中文釋義 | 中文解釋 |
| English Definition | 英文釋義 |
| 詞性分佈 | 各詞性下的釋義 |
| 詞形變化 | 過去式、複數等 |
| 詞頻 | BNC / COCA / FRQ |

### 設定 ECDICT 詞典

1. 下載 https://github.com/minghf85/EasyCPTrans/releases/download/v0.1.1/ecdict.db。若 stardict.db 過大，可自行建構轉換。
2. 進入 `Settings → Translation → ECDICT path`。
3. 指定 `.db` 檔案路徑，例如：

```
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

3. 如果僅有 CSV 檔案，需先轉換為 SQLite：

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

轉換後的 SQLite 資料表名稱為 `stardict`，欄位與 CSV 表頭一致，並額外產生 `sw` 欄位用於模糊比對。

---

## 🏷️ 標籤管理

### 系統標籤

| 標籤 | 說明 |
| --- | --- |
| `Text` | 文字 Item |
| `Image` | 圖片 Item |
| `File` | 檔案 Item |
| `Pinned` | 置頂 Item |
| `Private` | 私密 Item |
| `Word` | 翻譯卡片 |
| 裝置名稱 | 例如 `Office-PC`，自動產生 |

### 標籤管理（Tag Admin）

入口：`Tag Admin` 分頁標籤

支援操作：
- 建立、重新命名、刪除自訂標籤
- 修改標籤顏色
- 設定標籤是否常駐頂部標籤列
- 重新命名裝置名稱標籤

限制：
- `Text / Image / File / Pinned` 不可刪除。
- 功能性系統標籤不可刪除。
- 一般 Item 的下拉選單只顯示可手動指派的使用者標籤。

### 多標籤篩選

點擊 `Tags` 分頁標籤展開全部標籤，支援多選 AND 篩選：

- 選擇 `Text` + `Pinned` → 僅顯示被置頂的文字 Item。
- 選擇 `Word` + `Office-PC` → 僅顯示來自 `Office-PC` 的翻譯卡片。
- 再次點擊已選標籤取消該條件。
- 再次點擊 `Tags` 分頁標籤關閉清單並清空篩選。

---

## 🔍 進階搜尋

點擊頂部搜尋按鈕展開搜尋框，支援以下語法：

| 語法 | 範例 | 說明 |
| --- | --- | --- |
| 一般關鍵字 | `hello` | 比對內容、標籤、來源應用等 |
| 精確片語 | `"hello world"` | 比對連續片語 |
| 排除詞 | `-draft` | 排除包含 draft 的 Item |
| 標籤篩選 | `tag:work` | 篩選指定標籤 |
| 類型篩選 | `type:text` | 篩選 Text / Image / File |
| 來源應用 | `app:chrome` | 依來源應用篩選 |
| 置頂篩選 | `is:pinned` | 只看置頂 Item |
| 私密篩選 | `is:private` | 只看私密 Item |
| 相對時間 | `after:7d` | 最近 7 天 |
| 指定日期 | `date:2026-07-25` | 篩選某一天 |
| 日期範圍 | `date:2026-07-01..2026-07-25` | 篩選日期範圍 |
| 具體時間範圍 | `time:"2026-07-25 09:00..2026-07-25 18:30"` | 精確到分鐘的時間段 |
| 檔案大小 | `size:<5mb` | 檔案或圖片大小篩選 |
| 文字長度 | `len:>120` | 文字長度篩選 |

### 組合範例

```
tag:work type:text "meeting notes"
type:image after:7d
date:2026-07-01..2026-07-25 tag:Word
size:<5mb is:public
app:chrome -draft
```

---

## 🔒 私密內容

私密 Item 會被加密儲存。

### 使用方式

1. 在 Item 選單中選擇 `Private`。
2. 首次使用需設定隱私密碼和安全問題。
3. 私密 Item 內容會隱藏顯示。
4. 查看時需輸入密碼解鎖。

### 注意事項

- 請牢記隱私密碼，遺忘後將無法直接恢復加密內容。
- 取消私密時需要解密恢復明文。

---

## ☁️ WebDAV 與多裝置同步

### 設定

進入 `Settings → WebDAV` 進行設定。

### 裝置標籤

每台裝置會自動產生裝置名稱標籤，例如：
- `#Office-PC`
- `#Laptop`

同步後可透過裝置標籤篩選特定裝置的 Item。

---

## ⚙️ 設定

| 設定項 | 位置 | 說明 |
| --- | --- | --- |
| 語言 | `Settings → General → Language` | 簡體中文 / 繁體中文 / English |
| 資料路徑 | `Settings → General → Data path` | 指定資料儲存目錄 |
| 快捷鍵 | `Settings → Shortcuts` | 自訂所有快捷鍵 |
| 詞典路徑 | `Settings → Translation → ECDICT path` | 指定 ECDICT 詞典檔案路徑 |
| WebDAV | `Settings → WebDAV` | 設定多裝置同步 |

---

## 🛠️ 技術架構

| 層級 | 技術 |
| --- | --- |
| 框架 | Tauri 2 |
| 前端 | TypeScript 5, Vue 3 |
| 後端 | Rust (stable) |
| 資料庫 | SQLite |
| 同步 | WebDAV |
| 打包 | MSI / NSIS |

---

## 💻 開發

### 環境需求

- Windows 10 / 11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2 CLI

### 本地開發

```bash
# 安裝依賴
pnpm install

# 啟動開發模式
pnpm tauri dev

# 前端建置
pnpm build

# 後端檢查
cargo check --manifest-path src-tauri/Cargo.toml

# 發佈打包
pnpm tauri build
```

---

## 🗺️ 路線圖

- [ ] 跨平台支援（macOS / Linux）
- [ ] OCR 圖片文字辨識
- [ ] AI 輔助翻譯

---

## 📄 授權條款

本專案採用 MIT 授權條款。詳見 LICENSE 檔案。

---

## 🙏 致謝

- https://github.com/skywind3000/ECDICT — 英漢詞典資料庫
- https://github.com/ayangweb/tauri-plugin-clipboard-x — tauri-plugin-clipboard-x
