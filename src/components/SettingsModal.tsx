import { useEffect, useState } from "react";
import { Folder, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";

interface Props {
  onClose: () => void;
  onSaved: (settings: {
    shortcut: string;
    autoPaste: boolean;
    keepWindowOpen: boolean;
    pageSize: number;
  }) => void;
}

export function SettingsModal({ onClose, onSaved }: Props) {
  const [cachePath, setCachePath] = useState("");
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+E");
  const [defaultDir, setDefaultDir] = useState("");
  const [effectiveDir, setEffectiveDir] = useState("");
  const [autoPaste, setAutoPaste] = useState(true);
  const [keepWindowOpen, setKeepWindowOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);

  const [webdavSyncEnabled, setWebdavSyncEnabled] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const [privacyStatus, setPrivacyStatus] = useState({
    passwordSet: false,
    privateItems: 0,
    securityQuestionSet: false,
    securityQuestion: "" as string | null,
  });
  const [privacyCurrent, setPrivacyCurrent] = useState("");
  const [privacyNew, setPrivacyNew] = useState("");
  const [privacyConfirm, setPrivacyConfirm] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");

  const refreshPrivacyStatus = async () => {
    try {
      const status = await api.getPrivacyStatus();
      setPrivacyStatus(status);
      if (status.securityQuestion) {
        setSecurityQuestion(status.securityQuestion);
      }
    } catch (e) {
      setPrivacyMessage("读取隐私状态失败: " + String(e));
    }
  };

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (!cfg) return;
        setCachePath(cfg.cachePath || "");
        setShortcut(cfg.shortcut || "CommandOrControl+Shift+E");
        setDefaultDir(cfg.defaultDir || "");
        setEffectiveDir(cfg.effectiveDir || "");
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
        if (typeof cfg.keepWindowOpen === "boolean") setKeepWindowOpen(cfg.keepWindowOpen);
        if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        if (typeof cfg.webdavSyncEnabled === "boolean") setWebdavSyncEnabled(cfg.webdavSyncEnabled);
        setWebdavUrl(cfg.webdavUrl || "");
        setWebdavUsername(cfg.webdavUsername || "");
        setWebdavPassword(cfg.webdavPassword || "");
      })
      .catch((e) => console.error(e));

    refreshPrivacyStatus();
  }, []);

  const handleSave = async () => {
    try {
      await api.setConfig({
        cachePath,
        shortcut,
        autoPaste,
        keepWindowOpen,
        pageSize,
        webdavSyncEnabled,
        webdavUrl,
        webdavUsername,
        webdavPassword,
      });
      onSaved({
        shortcut,
        autoPaste,
        keepWindowOpen,
        pageSize,
      });
      onClose();
    } catch (e) {
      alert("保存设置失败: " + String(e));
    }
  };

  const handleVerify = async () => {
    if (!webdavUrl || !webdavUsername) {
      setVerifyMessage("URL 和用户名不能为空");
      return;
    }
    setVerifying(true);
    setVerifyMessage("验证中...");
    try {
      await api.verifyWebdav(webdavUrl, webdavUsername, webdavPassword);
      setVerifyMessage("验证成功");
    } catch (e: unknown) {
      setVerifyMessage("验证失败: " + String(e));
    } finally {
      setVerifying(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("同步中...");
    try {
      await api.triggerSync();
      setSyncMessage("同步已触发");
    } catch (e: unknown) {
      setSyncMessage("同步失败: " + String(e));
    } finally {
      setTimeout(() => setSyncMessage(""), 3000);
      setSyncing(false);
    }
  };

  const handleSetPrivacyPassword = async () => {
    const next = privacyNew.trim();
    const question = securityQuestion.trim();
    const answer = securityAnswer.trim();
    if (next.length < 6) {
      setPrivacyMessage("隐私密码至少 6 位");
      return;
    }
    if (privacyNew !== privacyConfirm) {
      setPrivacyMessage("两次输入的新密码不一致");
      return;
    }
    if (!question) {
      setPrivacyMessage("安全问题不能为空");
      return;
    }
    if (answer.length < 2) {
      setPrivacyMessage("安全问题答案至少 2 位");
      return;
    }

    setPrivacyBusy(true);
    setPrivacyMessage("");
    try {
      await api.setPrivacyPassword(
        next,
        question,
        answer,
        privacyStatus.passwordSet ? privacyCurrent : undefined,
      );
      setPrivacyCurrent("");
      setPrivacyNew("");
      setPrivacyConfirm("");
      setSecurityAnswer("");
      await refreshPrivacyStatus();
      setPrivacyMessage("隐私密码与安全问题已更新");
    } catch (e) {
      setPrivacyMessage("设置失败: " + String(e));
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[90vw] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">设置</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100 text-slate-500" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-sm">
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-medium">缓存与数据路径</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cachePath}
                onChange={(e) => setCachePath(e.target.value)}
                placeholder="默认使用系统应用数据目录"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                className="px-3 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-md hover:bg-slate-200"
                onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected && typeof selected === "string") setCachePath(selected);
                }}
              >
                <Folder className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">此路径用于存储 clipboard.db 与缓存文件。</p>
            {effectiveDir && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700 break-all">
                <span className="font-semibold block mb-1">当前生效路径：</span>
                {effectiveDir}
              </div>
            )}
            {defaultDir && !cachePath && (
              <div className="text-xs text-slate-400 mt-1 break-all">默认路径：{defaultDir}</div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-700 font-medium">全局快捷键</label>
            <input
              type="text"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-slate-700 font-medium border-b border-slate-100 pb-1">交互行为</label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoPaste}
                onChange={(e) => setAutoPaste(e.target.checked)}
                className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="block text-slate-700 group-hover:text-blue-600 transition-colors">选择历史记录后自动粘贴</span>
                <span className="block text-xs text-slate-400">模拟 Ctrl+V / Cmd+V 粘贴到上一个窗口</span>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={keepWindowOpen}
                onChange={(e) => setKeepWindowOpen(e.target.checked)}
                className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="block text-slate-700 group-hover:text-blue-600 transition-colors">选择后保持主窗口打开</span>
                <span className="block text-xs text-slate-400">开启后点击条目不会自动隐藏窗口</span>
              </div>
            </label>
            <div className="space-y-1.5 pt-2">
              <label className="block text-slate-700 font-medium">每页显示数量</label>
              <input
                type="number"
                min="10"
                max="500"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 50)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-slate-700 font-medium border-b border-slate-100 pb-1">隐私安全</label>
            <div className="text-xs text-slate-500">
              当前状态：{privacyStatus.passwordSet ? "已设置隐私密码" : "未设置隐私密码"}，
              安全问题：{privacyStatus.securityQuestionSet ? "已设置" : "未设置"}，
              私密条目数：{privacyStatus.privateItems}
            </div>
            {(!privacyStatus.passwordSet || !privacyStatus.securityQuestionSet) && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                提示：隐私功能依赖“隐私密码 + 安全问题”。请先在此处完成设置后再使用隐私标签。
              </div>
            )}
            {privacyStatus.passwordSet && (
              <input
                type="password"
                value={privacyCurrent}
                onChange={(e) => setPrivacyCurrent(e.target.value)}
                placeholder="当前隐私密码"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
            <input
              type="password"
              value={privacyNew}
              onChange={(e) => setPrivacyNew(e.target.value)}
              placeholder={privacyStatus.passwordSet ? "新隐私密码（至少 6 位）" : "设置隐私密码（至少 6 位）"}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="password"
              value={privacyConfirm}
              onChange={(e) => setPrivacyConfirm(e.target.value)}
              placeholder="确认新隐私密码"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="text"
              value={securityQuestion}
              onChange={(e) => setSecurityQuestion(e.target.value)}
              placeholder="安全问题（例如：我第一只宠物的名字）"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="password"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              placeholder="安全问题答案"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSetPrivacyPassword}
                disabled={privacyBusy}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
              >
                {privacyBusy ? "处理中..." : privacyStatus.passwordSet ? "更新密码与安全问题" : "设置密码与安全问题"}
              </button>
            </div>
            {privacyMessage && <div className="text-xs text-slate-600">{privacyMessage}</div>}
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-slate-700 font-medium border-b border-slate-100 pb-1">WebDAV 同步</label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={webdavSyncEnabled}
                onChange={(e) => setWebdavSyncEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="block text-slate-700 group-hover:text-blue-600 transition-colors">启用 WebDAV 同步</span>
                <span className="block text-xs text-slate-400">手动同步会将本地数据上传到配置目录</span>
              </div>
            </label>

            {webdavSyncEnabled && (
              <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                <div className="space-y-1.5">
                  <label className="block text-slate-700 text-xs font-medium">URL</label>
                  <input
                    type="url"
                    value={webdavUrl}
                    onChange={(e) => setWebdavUrl(e.target.value)}
                    placeholder="例如: https://pan.ustc.edu.cn/seafdav/EasyCP"
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-700 text-xs font-medium">Username</label>
                  <input
                    type="text"
                    value={webdavUsername}
                    onChange={(e) => setWebdavUsername(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-700 text-xs font-medium">Password</label>
                  <input
                    type="password"
                    value={webdavPassword}
                    onChange={(e) => setWebdavPassword(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {verifying ? "验证中..." : "验证配置"}
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={syncing || !webdavSyncEnabled}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    {syncing ? "同步中..." : "手动同步"}
                  </button>
                  {(verifyMessage || syncMessage) && (
                    <span className="text-xs ml-2 text-slate-500">{verifyMessage} {syncMessage}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors bg-slate-100"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm"
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
