/**
 * Source-application icons for the demo.
 *
 * They are inlined SVGs so the page stays offline and the icon pipeline matches
 * the desktop app: `get_app_icon` returns raw RGBA, the card turns it into a
 * data URL, and the header band reads its dominant colour. Chrome keeps its
 * multicolour mark; QQ and WeChat use their Simple Icons paths in brand colours.
 */

const dataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const vscode = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#007ACC"/>
  <path d="M42 12 20 32l22 20 9-5V17l-9-5z" fill="#ffffff"/>
  <path d="M20 32 42 12v40L20 32z" fill="#dbeafe" opacity=".55"/>
  <path d="M12 21 24 32 12 43l-6-4V25l6-4z" fill="#0065A9"/>
</svg>`);

const chrome = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#EA4335"/>
  <path d="M32 32 58 17a30 30 0 0 1-8.6 40.2z" fill="#FBBC05"/>
  <path d="M32 32 6 47A30 30 0 0 1 6 17z" fill="#34A853"/>
  <circle cx="32" cy="32" r="15" fill="#ffffff"/>
  <circle cx="32" cy="32" r="11.5" fill="#4285F4"/>
</svg>`);

const qq = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#12B7F5" d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"/>
</svg>`);

const wechat = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#07C160" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
</svg>`);

const explorer = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M6 16a5 5 0 0 1 5-5h13l5 6h24a5 5 0 0 1 5 5v27a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill="#F8C94C"/>
  <path d="M6 25h52v24a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill="#FFD966"/>
  <path d="M17 34h30M17 42h22" stroke="#B7791F" stroke-width="3" stroke-linecap="round" opacity=".55"/>
</svg>`);

const notepad = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="10" y="5" width="44" height="54" rx="6" fill="#ffffff" stroke="#94A3B8" stroke-width="2"/>
  <rect x="10" y="5" width="44" height="12" rx="6" fill="#2563EB"/>
  <rect x="10" y="13" width="44" height="4" fill="#2563EB"/>
  <g fill="#93C5FD"><rect x="18" y="27" width="28" height="3" rx="1.5"/><rect x="18" y="35" width="22" height="3" rx="1.5"/><rect x="18" y="43" width="26" height="3" rx="1.5"/></g>
</svg>`);

const snipping = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="3" y="3" width="58" height="58" rx="15" fill="#7C3AED"/>
  <rect x="15" y="20" width="34" height="26" rx="5" fill="#ffffff" opacity=".92"/>
  <circle cx="32" cy="33" r="8" fill="#7C3AED"/>
  <rect x="24" y="13" width="16" height="7" rx="3" fill="#ffffff" opacity=".92"/>
</svg>`);

const photos = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="3" y="3" width="58" height="58" rx="15" fill="#0F6CBD"/>
  <circle cx="21" cy="22" r="6" fill="#FFD166"/>
  <path d="M9 48 25 28l9 10 7-7 14 17z" fill="#ffffff" opacity=".92"/>
</svg>`);

const linear = dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#5E6AD2" d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Z"/>
</svg>`);

/** Keyed by the lowercased executable name. */
export const APP_ICON_URLS: Record<string, string> = {
  "code.exe": vscode,
  "chrome.exe": chrome,
  "qq.exe": qq,
  "wechat.exe": wechat,
  "explorer.exe": explorer,
  "notepad.exe": notepad,
  "snippingtool.exe": snipping,
  "photos.exe": photos,
  "linear.exe": linear,
};
