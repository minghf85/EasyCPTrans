const translations = {
  zh: {
    "nav.features": "功能",
    "nav.download": "下载",
    "hero.title": "智能剪贴板，触手可及",
    "hero.subtitle": "自动捕获、智能管理、快速取用。让剪贴板工作流更高效。",
    "hero.download": "免费下载",
    "hero.learnMore": "了解更多",
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
    "nav.features": "Features",
    "nav.download": "Download",
    "hero.title": "Smart Clipboard, At Your Fingertips",
    "hero.subtitle": "Auto-capture, intelligent management, quick access. Make your clipboard workflow more efficient.",
    "hero.download": "Free Download",
    "hero.learnMore": "Learn More",
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
}

function toggleLanguage() {
  applyLanguage(currentLang === "zh" ? "en" : "zh");
}

// Initialize
applyLanguage(currentLang);
