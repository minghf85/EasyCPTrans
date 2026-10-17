// ===== Translations =====
const translations = {
  zh: {
    "nav.demo": "演示",
    "nav.features": "功能",
    "nav.download": "下载",
    "hero.title": "智能剪贴板，触手可及",
    "hero.subtitle": "自动捕获、智能管理、快速取用。让剪贴板工作流更高效。",
    "hero.tryDemo": "在线体验",
    "hero.download": "免费下载",
    "demo.title": "在线体验",
    "demo.subtitle": "直接在浏览器中体验核心功能",
    "demo.tab.all": "全部",
    "demo.tab.text": "文本",
    "demo.tab.image": "图片",
    "demo.tab.file": "文件",
    "demo.search": "搜索...",
    "demo.tag.all": "全部",
    "demo.tag.text": "文本",
    "demo.tag.image": "图片",
    "demo.tag.link": "链接",
    "demo.tag.email": "邮件",
    "demo.menu.copy": "复制",
    "demo.menu.paste": "粘贴",
    "demo.menu.pin": "置顶",
    "demo.menu.unpin": "取消置顶",
    "demo.menu.tag": "添加标签",
    "demo.menu.ocr": "OCR 识别",
    "demo.menu.translate": "翻译",
    "demo.menu.delete": "删除",
    "demo.addText": "添加文本",
    "demo.addImage": "添加图片",
    "demo.clear": "清空",
    "features.title": "强大功能，简约设计",
    "features.clipboard.title": "智能剪贴板管理",
    "features.clipboard.desc": "自动捕获复制的文本、图片和文件，按时间顺序整理，随时取用。",
    "features.preview.title": "可视化内容预览",
    "features.preview.desc": "文本、图片、文件一目了然，支持快速搜索和标签筛选。",
    "features.ocr.title": "OCR 文字识别",
    "features.ocr.desc": "图片中的文字也能提取，支持多语言识别，识别结果可编辑和翻译。",
    "features.translate.title": "智能翻译",
    "features.translate.desc": "集成 LLM 翻译，支持 8 种常用语言，也可自定义目标语言。",
    "features.tags.title": "标签系统",
    "features.tags.desc": "自定义标签分类管理，快速规则自动识别，内容组织更有序。",
    "features.quick.title": "快速粘贴",
    "features.quick.desc": "点击卡片或按 Enter 键即可粘贴，支持快捷键快速操作。",
    "cta.title": "开始使用 EasyCPTrans",
    "cta.desc": "免费下载，立即提升你的剪贴板工作效率。",
    "cta.download": "下载 Windows 版本",
    "footer.rights": "保留所有权利。",
    "footer.github": "GitHub",
    "footer.releases": "发布版本"
  },
  en: {
    "nav.demo": "Demo",
    "nav.features": "Features",
    "nav.download": "Download",
    "hero.title": "Smart Clipboard, At Your Fingertips",
    "hero.subtitle": "Auto-capture, intelligent management, quick access. Make your clipboard workflow more efficient.",
    "hero.tryDemo": "Try Demo",
    "hero.download": "Free Download",
    "demo.title": "Interactive Demo",
    "demo.subtitle": "Experience core features right in your browser",
    "demo.tab.all": "All",
    "demo.tab.text": "Text",
    "demo.tab.image": "Image",
    "demo.tab.file": "File",
    "demo.search": "Search...",
    "demo.tag.all": "All",
    "demo.tag.text": "Text",
    "demo.tag.image": "Image",
    "demo.tag.link": "Link",
    "demo.tag.email": "Email",
    "demo.menu.copy": "Copy",
    "demo.menu.paste": "Paste",
    "demo.menu.pin": "Pin",
    "demo.menu.unpin": "Unpin",
    "demo.menu.tag": "Add Tag",
    "demo.menu.ocr": "OCR Recognize",
    "demo.menu.translate": "Translate",
    "demo.menu.delete": "Delete",
    "demo.addText": "Add Text",
    "demo.addImage": "Add Image",
    "demo.clear": "Clear",
    "features.title": "Powerful Features, Simple Design",
    "features.clipboard.title": "Smart Clipboard Management",
    "features.clipboard.desc": "Automatically captures text, images, and files you copy, organized chronologically for easy access.",
    "features.preview.title": "Visual Content Preview",
    "features.preview.desc": "See text, images, and files at a glance, with quick search and tag filtering.",
    "features.ocr.title": "OCR Text Recognition",
    "features.ocr.desc": "Extract text from images with multi-language support. Edit and translate recognized text.",
    "features.translate.title": "Smart Translation",
    "features.translate.desc": "Integrated LLM translation with 8 popular languages, or customize your target language.",
    "features.tags.title": "Tag System",
    "features.tags.desc": "Custom tags for classification, quick rules for auto-recognition, better content organization.",
    "features.quick.title": "Quick Paste",
    "features.quick.desc": "Click a card or press Enter to paste. Keyboard shortcuts for fast operations.",
    "cta.title": "Get Started with EasyCPTrans",
    "cta.desc": "Free download, boost your clipboard productivity now.",
    "cta.download": "Download for Windows",
    "footer.rights": "All rights reserved.",
    "footer.github": "GitHub",
    "footer.releases": "Releases"
  }
};

let currentLang = localStorage.getItem("eacp-lang") || "zh";

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("eacp-lang", lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.getElementById("langLabel").textContent = lang === "zh" ? "EN" : "中文";
  
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
  
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[lang][key]) {
      el.placeholder = translations[lang][key];
    }
  });
  
  renderCards();
}

function toggleLanguage() {
  applyLanguage(currentLang === "zh" ? "en" : "zh");
}

// ===== Interactive Demo =====
let demoItems = [
  {
    id: 1,
    type: "text",
    content: "https://github.com/minghf85/EasyCPTrans",
    tags: ["Text", "Link"],
    pinned: false,
    time: Date.now() - 60000
  },
  {
    id: 2,
    type: "text",
    content: "EasyCPTrans 是一款智能剪贴板管理工具，支持文本、图片、文件的自动捕获和管理。",
    tags: ["Text"],
    pinned: true,
    time: Date.now() - 120000
  },
  {
    id: 3,
    type: "image",
    content: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120' viewBox='0 0 200 120'%3E%3Crect width='200' height='120' fill='%23dbeafe'/%3E%3Ctext x='100' y='65' text-anchor='middle' fill='%232563eb' font-size='16' font-family='sans-serif'%3E示例图片%3C/text%3E%3C/svg%3E",
    tags: ["Image"],
    pinned: false,
    time: Date.now() - 180000,
    ocrText: "示例图片中的文字"
  },
  {
    id: 4,
    type: "text",
    content: "contact@example.com",
    tags: ["Text", "Email"],
    pinned: false,
    time: Date.now() - 240000
  },
  {
    id: 5,
    type: "file",
    content: "document.pdf",
    tags: ["File"],
    pinned: false,
    time: Date.now() - 300000
  },
  {
    id: 6,
    type: "text",
    content: "console.log('Hello, EasyCPTrans!');",
    tags: ["Text"],
    pinned: false,
    time: Date.now() - 360000
  }
];

let nextId = 7;
let activeTypeFilter = "all";
let activeTagFilter = "all";
let searchQuery = "";
let contextMenuItemId = null;

function getTypeLabel(type) {
  const labels = {
    zh: { text: "文本", image: "图片", file: "文件" },
    en: { text: "Text", image: "Image", file: "File" }
  };
  return labels[currentLang][type] || type;
}

function getTagLabel(tag) {
  const labels = {
    Text: { zh: "文本", en: "Text" },
    Image: { zh: "图片", en: "Image" },
    File: { zh: "文件", en: "File" },
    Link: { zh: "链接", en: "Link" },
    Email: { zh: "邮件", en: "Email" }
  };
  return labels[tag]?.[currentLang] || tag;
}

function getFilteredItems() {
  return demoItems.filter(item => {
    if (activeTypeFilter !== "all" && item.type !== activeTypeFilter) return false;
    if (activeTagFilter !== "all" && !item.tags.includes(activeTagFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.content.toLowerCase().includes(q) && 
          !item.tags.some(t => t.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.time - a.time;
  });
}

function renderCards() {
  const container = document.getElementById("demoCards");
  if (!container) return;
  
  const items = getFilteredItems();
  
  if (items.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-light); font-size: 14px;">${currentLang === "zh" ? "没有匹配的内容" : "No matching items"}</div>`;
    return;
  }
  
  container.innerHTML = items.map(item => {
    const isImage = item.type === "image";
    const contentHtml = isImage 
      ? `<img src="${item.content}" alt="">`
      : escapeHtml(item.content);
    
    return `
      <div class="demo-card ${item.pinned ? 'pinned' : ''}" 
           data-id="${item.id}"
           oncontextmenu="showContextMenu(event, ${item.id})"
           onclick="handleCardClick(${item.id})">
        ${item.pinned ? '<span class="demo-card-pin">📌</span>' : ''}
        <span class="demo-card-type ${item.type}">${getTypeLabel(item.type)}</span>
        <div class="demo-card-content">${contentHtml}</div>
        <div class="demo-card-tags">
          ${item.tags.map(t => `<span class="demo-card-tag">#${getTagLabel(t)}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showContextMenu(event, itemId) {
  event.preventDefault();
  event.stopPropagation();
  contextMenuItemId = itemId;
  
  const menu = document.getElementById("demoContextMenu");
  const item = demoItems.find(i => i.id === itemId);
  
  // Update pin label
  const pinItem = menu.querySelector('[data-action="pin"]');
  if (pinItem && item) {
    pinItem.textContent = item.pinned 
      ? translations[currentLang]["demo.menu.unpin"]
      : translations[currentLang]["demo.menu.pin"];
  }
  
  menu.style.display = "block";
  menu.style.left = event.clientX + "px";
  menu.style.top = event.clientY + "px";
  
  // Adjust if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 8) + "px";
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 8) + "px";
  }
}

function hideContextMenu() {
  const menu = document.getElementById("demoContextMenu");
  menu.style.display = "none";
  contextMenuItemId = null;
}

function handleCardClick(itemId) {
  // Simulate paste on click
  const item = demoItems.find(i => i.id === itemId);
  if (item && item.type === "text") {
    // Visual feedback
    const card = document.querySelector(`.demo-card[data-id="${itemId}"]`);
    if (card) {
      card.style.borderColor = "#16a34a";
      card.style.background = "#f0fdf4";
      setTimeout(() => {
        card.style.borderColor = "";
        card.style.background = "";
      }, 500);
    }
  }
}

function handleMenuAction(action) {
  if (contextMenuItemId === null) return;
  const item = demoItems.find(i => i.id === contextMenuItemId);
  if (!item) return;
  
  switch (action) {
    case "copy":
      if (item.type === "text") {
        navigator.clipboard?.writeText(item.content).catch(() => {});
      }
      break;
    case "paste":
      // Visual feedback only
      break;
    case "pin":
      item.pinned = !item.pinned;
      break;
    case "tag":
      const newTag = prompt(currentLang === "zh" ? "输入标签名：" : "Enter tag name:");
      if (newTag && newTag.trim()) {
        const tag = newTag.trim();
        if (!item.tags.includes(tag)) {
          item.tags.push(tag);
        }
      }
      break;
    case "ocr":
      if (item.type === "image") {
        alert(currentLang === "zh" 
          ? `OCR 识别结果：\n\n${item.ocrText || "（模拟）图片中未识别到文字"}`
          : `OCR Result:\n\n${item.ocrText || "(Simulated) No text recognized"}`);
      }
      break;
    case "translate":
      if (item.type === "text") {
        const translated = currentLang === "zh" 
          ? `[翻译结果] ${item.content}`
          : `[Translated] ${item.content}`;
        alert(currentLang === "zh"
          ? `翻译为 English：\n\n${translated}`
          : `Translate to 中文：\n\n${translated}`);
      }
      break;
    case "delete":
      demoItems = demoItems.filter(i => i.id !== contextMenuItemId);
      break;
  }
  
  hideContextMenu();
  renderCards();
}

function addDemoText() {
  const samples = currentLang === "zh"
    ? [
        "这是一段示例文本，可以复制粘贴使用。",
        "https://example.com/demo",
        "npm install easycptrans",
        "user@example.com",
        "const app = new EasyCPTrans();"
      ]
    : [
        "This is a sample text you can copy and paste.",
        "https://example.com/demo",
        "npm install easycptrans",
        "user@example.com",
        "const app = new EasyCPTrans();"
      ];
  
  const content = samples[Math.floor(Math.random() * samples.length)];
  const tags = ["Text"];
  
  if (content.includes("http")) tags.push("Link");
  if (content.includes("@")) tags.push("Email");
  
  demoItems.unshift({
    id: nextId++,
    type: "text",
    content,
    tags,
    pinned: false,
    time: Date.now()
  });
  
  renderCards();
}

function addDemoImage() {
  const colors = ["dbeafe", "fef3c7", "dcfce7", "fce7f3", "e0e7ff"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const text = currentLang === "zh" ? "示例图片" : "Sample Image";
  
  demoItems.unshift({
    id: nextId++,
    type: "image",
    content: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120' viewBox='0 0 200 120'%3E%3Crect width='200' height='120' fill='%23${color}'/%3E%3Ctext x='100' y='65' text-anchor='middle' fill='%23374151' font-size='16' font-family='sans-serif'%3E${text}%3C/text%3E%3C/svg%3E`,
    tags: ["Image"],
    pinned: false,
    time: Date.now(),
    ocrText: currentLang === "zh" ? "识别到的文字内容" : "Recognized text content"
  });
  
  renderCards();
}

function clearDemo() {
  demoItems = [];
  renderCards();
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  applyLanguage(currentLang);
  
  // Tab filters
  document.querySelectorAll(".demo-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".demo-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeTypeFilter = tab.dataset.filter;
      renderCards();
    });
  });
  
  // Tag filters
  document.querySelectorAll(".demo-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      document.querySelectorAll(".demo-tag").forEach(t => t.classList.remove("active"));
      tag.classList.add("active");
      activeTagFilter = tag.dataset.tag;
      renderCards();
    });
  });
  
  // Search
  const searchInput = document.getElementById("demoSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderCards();
    });
  }
  
  // Context menu actions
  document.querySelectorAll(".demo-menu-item").forEach(item => {
    item.addEventListener("click", () => {
      handleMenuAction(item.dataset.action);
    });
  });
  
  // Hide context menu on click outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".demo-context-menu")) {
      hideContextMenu();
    }
  });
  
  // Action buttons
  const addTextBtn = document.getElementById("demoAddText");
  const addImageBtn = document.getElementById("demoAddImage");
  const clearBtn = document.getElementById("demoClear");
  
  if (addTextBtn) addTextBtn.addEventListener("click", addDemoText);
  if (addImageBtn) addImageBtn.addEventListener("click", addDemoImage);
  if (clearBtn) clearBtn.addEventListener("click", clearDemo);
  
  // Initial render
  renderCards();
});
