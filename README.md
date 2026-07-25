<div align="center">

# EasyCPTrans

**Clipboard History & On-the-fly Translation — All in One**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-20232a.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-dea584.svg)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

English · [简体中文](./README_ZH_CN.md) · [繁體中文](./README_ZH_TW.md)

</div>

---

## ✨ Features

- **📋 Clipboard History** — Automatically records copied text, images, and files, allowing you to browse and paste anytime.
- **🌐 On-the-fly Translation** — Select an English word or phrase, query the local dictionary with one hotkey, and save the result as a reusable card.
- **🏷️ Tag Management** — Built-in type tags and user-defined tags, supporting multi-tag AND filtering.
- **📌 Pin & Private** — Pin important items to the top; encrypt sensitive content for secure storage.
- **🔗 Queue Paste** — Add multiple items to a queue and paste them one by one in order — perfect for bulk form filling.
- **📦 Stack Copy** — Merge multiple copied snippets into a single item to preserve context.
- **🖥️ Multi-Device Sync** — Sync data via WebDAV, with each item automatically tagged by source device.
- **🔍 Advanced Search** — Combine keywords, phrases, tags, types, time ranges, and sizes for precise filtering.
- **⚡ Global Hotkeys** — Every action is accessible via keyboard shortcuts — efficiency first.

---

## 🚀 Quick Start

### System Requirements

| Environment | Version |
| --- | --- |
| OS | Windows 10 / 11 (x64) |
| Runtime | No extra runtime required (self-contained) |

### Installation

Download the latest installer from https://github.com/minghf85/EasyCPTrans/releases:

```
EasyCPTrans_x.x.x_x64-setup.exe
```

NSIS installer is recommended for regular users.

### First Launch

1. Launch EasyCPTrans.
2. Copy any text.
3. Press the default hotkey `Ctrl + Shift + V` to open the panel.
4. Click the card's main content area to paste.

---

## 📖 User Guide

### Core Operations

| Action | Description |
| --- | --- |
| Copy text / image / file | Automatically creates a corresponding Item |
| Click card main content | Writes the Item to clipboard and pastes |
| Click card top-right menu | Manage pin, private, tags, delete |
| Click top search button | Expand the search box |
| Click `Tags` tab | Expand all tags for multi-select filtering |
| Click `Settings` tab | Open settings page; click again to save |

### Global Hotkeys

| Function | Default Hotkey |
| --- | --- |
| Open / Close panel | `Ctrl + Shift + V` |
| Quick index paste (#1 ~ #10) | `Ctrl + Shift + 1~9/0` |
| Queue paste | `Ctrl + Alt + V` |
| Stack up / down | `Ctrl + Alt + Up / Down` |
| On-the-fly translate | `Alt + C` |

### In-Window Hotkeys

| Hotkey | Function |
| --- | --- |
| `T` | Open / close the current Item's tag menu |
| `M` | Toggle private state |
| `P` | Toggle pinned state |
| `Delete` | Delete current Item |

---

## 🌐 On-the-fly Translation

### How It Works

1. Select an English word or phrase in any application.
2. Press `Alt + C`.
3. EasyCPTrans automatically copies the selection and pops up the main panel.
4. A `Word` Item is created with an initial "Translating" status.
5. After querying the local ECDICT dictionary, the same Item is updated with the translation result.
6. The translation result is written back to the system clipboard.

### Translation Card Fields

| Field | Description |
| --- | --- |
| Word | Original text |
| Phonetic | UK / US phonetic symbols |
| Dictionary Tags | Collins / Oxford / exam labels |
| Chinese Definition | Chinese explanation |
| English Definition | English explanation |
| Part of Speech | Definitions grouped by POS |
| Word Forms | Past tense, plural, etc. |
| Word Frequency | BNC / COCA / FRQ |

### Configuring ECDICT Dictionary

1. Download https://github.com/minghf85/EasyCPTrans/releases/download/v0.1.1/ecdict.db. If stardict.db is too large, you can build and convert it yourself.
2. Go to `Settings → Translation → ECDICT path`.
3. Specify the `.db` file path, for example:

```
ECDICT/ecdict.db
ECDICT/stardict/stardict.db
```

1. If you only have a CSV file, convert it to SQLite first:

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

The converted SQLite table is named `stardict`, with fields matching the CSV header, plus an extra `sw` field for fuzzy matching.

---

## 🏷️ Tag Management

### System Tags

| Tag | Description |
| --- | --- |
| `Text` | Text Item |
| `Image` | Image Item |
| `File` | File Item |
| `Pinned` | Pinned Item |
| `Private` | Private Item |
| `Word` | Translation card |
| Device name | e.g. `Office-PC`, auto-generated |

### Tag Admin

Entry point: `Tag Admin` tab

Supported operations:
- Create, rename, delete custom tags
- Modify tag color
- Set whether a tag is pinned to the top bar
- Rename device name tags

Restrictions:
- `Text / Image / File / Pinned` cannot be deleted.
- Functional system tags cannot be deleted.
- The dropdown menu of a regular Item only shows manually assignable user tags.

### Multi-Tag Filtering

Click the `Tags` tab to expand all tags, supporting multi-select AND filtering:

- Select `Text` + `Pinned` → Only show pinned text Items.
- Select `Word` + `Office-PC` → Only show translation cards from `Office-PC`.
- Click an already-selected tag again to remove that filter.
- Click the `Tags` tab again to close the list and clear all filters.

---

## 🔍 Advanced Search

Click the top search button to expand the search box. The following syntax is supported:

| Syntax | Example | Description |
| --- | --- | --- |
| Plain keyword | `hello` | Matches content, tags, source app, etc. |
| Exact phrase | `"hello world"` | Matches a continuous phrase |
| Exclude word | `-draft` | Excludes Items containing draft |
| Tag filter | `tag:work` | Filter by specified tag |
| Type filter | `type:text` | Filter by Text / Image / File |
| Source app | `app:chrome` | Filter by source application |
| Pinned filter | `is:pinned` | Show only pinned Items |
| Private filter | `is:private` | Show only private Items |
| Relative time | `after:7d` | Past 7 days |
| Specific date | `date:2026-07-25` | Filter by a single day |
| Date range | `date:2026-07-01..2026-07-25` | Filter by date range |
| Precise time range | `time:"2026-07-25 09:00..2026-07-25 18:30"` | Minute-precision time window |
| File size | `size:<5mb` | Filter by file or image size |
| Text length | `len:>120` | Filter by text length |

### Combination Examples

```
tag:work type:text "meeting notes"
type:image after:7d
date:2026-07-01..2026-07-25 tag:Word
size:<5mb is:public
app:chrome -draft
```

---

## 🔒 Private Content

Private Items are stored with encryption.

### How to Use

1. Select `Private` from the Item menu.
2. On first use, set a privacy password and security question.
3. Private Item content is hidden from display.
4. Enter the password to unlock and view.

### Important Notes

- Please remember your privacy password — encrypted content cannot be recovered if forgotten.
- Disabling privacy requires decryption to restore plaintext.

---

## ☁️ WebDAV & Multi-Device Sync

### Configuration

Navigate to `Settings → WebDAV` to configure.

### Device Tags

Each device automatically generates a device name tag, for example:
- `#Office-PC`
- `#Laptop`

After sync, you can filter Items by device tag.

---

## ⚙️ Settings

| Setting | Location | Description |
| --- | --- | --- |
| Language | `Settings → General → Language` | Simplified Chinese / Traditional Chinese / English |
| Data Path | `Settings → General → Data path` | Specify the data storage directory |
| Hotkeys | `Settings → Shortcuts` | Customize all hotkeys |
| Dictionary Path | `Settings → Translation → ECDICT path` | Specify the ECDICT dictionary file path |
| WebDAV | `Settings → WebDAV` | Configure multi-device sync |

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Tauri 2 |
| Frontend | TypeScript 5, Vue 3 |
| Backend | Rust (stable) |
| Database | SQLite |
| Sync | WebDAV |
| Packaging | MSI / NSIS |

---

## 💻 Development

### Environment Requirements

- Windows 10 / 11
- Node.js 20+
- pnpm
- Rust stable
- Tauri 2 CLI

### Local Development

```bash
# Install dependencies
pnpm install

# Start dev mode
pnpm tauri dev

# Frontend build
pnpm build

# Backend check
cargo check --manifest-path src-tauri/Cargo.toml

# Release build
pnpm tauri build
```

---

## 🗺️ Roadmap

- [ ] Cross-platform support (macOS / Linux)
- [ ] OCR image text recognition
- [ ] AI-assisted translation

---

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## 🙏 Acknowledgements

- https://github.com/skywind3000/ECDICT — English-Chinese dictionary database
- https://github.com/ayangweb/tauri-plugin-clipboard-x — tauri-plugin-clipboard-x
