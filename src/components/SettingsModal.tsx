import { useEffect, useState } from "react";
import { Cloud, Folder, RefreshCw, Shield } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";

interface Props {
  onSaved: (settings: {
    shortcut: string;
    autoPaste: boolean;
    keepWindowOpen: boolean;
    alwaysOnTop: boolean;
    pageSize: number;
    historyLimit: number;
    webdavUrl: string;
    webdavUsername: string;
    webdavSyncEnabled: boolean;
    deviceName: string;
  }) => void;
}

export function SettingsModal({ onSaved }: Props) {
  const [cachePath, setCachePath] = useState("");
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+E");
  const [effectiveDir, setEffectiveDir] = useState("");
  const [autoPaste, setAutoPaste] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(5000);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [webdavSyncEnabled, setWebdavSyncEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState("This Device");
  const [webdavBusy, setWebdavBusy] = useState(false);
  const [webdavMessage, setWebdavMessage] = useState("");

  const [privacyStatus, setPrivacyStatus] = useState({
    passwordSet: false,
    privateItems: 0,
    securityQuestionSet: false,
  });
  const [privacyCurrent, setPrivacyCurrent] = useState("");
  const [privacyNew, setPrivacyNew] = useState("");
  const [privacyConfirm, setPrivacyConfirm] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (!cfg) return;
        setCachePath(cfg.cachePath || "");
        setShortcut(cfg.shortcut || "CommandOrControl+Shift+E");
        setEffectiveDir(cfg.effectiveDir || "");
        setWebdavUrl(cfg.webdavUrl || "");
        setWebdavUsername(cfg.webdavUsername || "");
        setWebdavSyncEnabled(Boolean(cfg.webdavSyncEnabled));
        setDeviceName(cfg.deviceName || "This Device");
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
        if (typeof cfg.alwaysOnTop === "boolean") setAlwaysOnTop(cfg.alwaysOnTop);
        if (typeof cfg.pageSize === "number") setPageSize(cfg.pageSize);
        if (typeof cfg.historyLimit === "number") setHistoryLimit(cfg.historyLimit);
      })
      .catch(() => {});

    api
      .getPrivacyStatus()
      .then((status) => {
        setPrivacyStatus({
          passwordSet: status.passwordSet,
          privateItems: status.privateItems,
          securityQuestionSet: status.securityQuestionSet,
        });
        setSecurityQuestion(status.securityQuestion || "");
      })
      .catch((err) => {
        setPrivacyMessage("Failed to load privacy status: " + String(err));
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.setConfig({
        cachePath,
        shortcut,
        autoPaste,
        keepWindowOpen: false,
        alwaysOnTop,
        pageSize,
        historyLimit,
        webdavUrl,
        webdavUsername,
        webdavSyncEnabled,
        deviceName,
        ...(webdavPassword.trim() ? { webdavPassword: webdavPassword.trim() } : {}),
      });
      onSaved({
        shortcut,
        autoPaste,
        keepWindowOpen: false,
        alwaysOnTop,
        pageSize,
        historyLimit,
        webdavUrl,
        webdavUsername,
        webdavSyncEnabled,
        deviceName,
      });
      setWebdavPassword("");
      setMessage("Settings saved.");
    } catch (err) {
      setMessage("Save failed: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyWebdav = async () => {
    setWebdavBusy(true);
    setWebdavMessage("");
    try {
      await api.verifyWebdav(webdavUrl.trim(), webdavUsername.trim(), webdavPassword.trim() || undefined);
      setWebdavMessage("WebDAV connection verified.");
    } catch (err) {
      setWebdavMessage("Verification failed: " + String(err));
    } finally {
      setWebdavBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setWebdavBusy(true);
    setWebdavMessage("");
    try {
      await api.setConfig({
        webdavUrl,
        webdavUsername,
        webdavSyncEnabled,
        deviceName,
        ...(webdavPassword.trim() ? { webdavPassword: webdavPassword.trim() } : {}),
      });
      await api.triggerSync();
      setWebdavPassword("");
      setWebdavMessage("WebDAV sync completed.");
    } catch (err) {
      setWebdavMessage("Sync failed: " + String(err));
    } finally {
      setWebdavBusy(false);
    }
  };

  const handleSetPrivacyPassword = async () => {
    const next = privacyNew.trim();
    const question = securityQuestion.trim();
    const answer = securityAnswer.trim();

    if (next.length < 6) {
      setPrivacyMessage("Privacy password must be at least 6 characters.");
      return;
    }
    if (next !== privacyConfirm) {
      setPrivacyMessage("The two new passwords do not match.");
      return;
    }
    if (!question) {
      setPrivacyMessage("Security question is required.");
      return;
    }
    if (answer.length < 2) {
      setPrivacyMessage("Security answer must be at least 2 characters.");
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
      setPrivacyStatus((prev) => ({
        ...prev,
        passwordSet: true,
        securityQuestionSet: true,
      }));
      setPrivacyMessage("Privacy settings updated.");
    } catch (err) {
      setPrivacyMessage("Failed to update privacy settings: " + String(err));
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <div className="easycp-settings-page">
      <div className="easycp-settings-grid">
        <section className="easycp-settings-card">
          <div className="easycp-settings-head">
            <h2>General</h2>
            <p>Current-stage clipboard basics for Windows, offline and lightweight.</p>
          </div>

          <label className="easycp-field">
            <span>Data path</span>
            <div className="easycp-path-row">
              <input
                type="text"
                value={cachePath}
                onChange={(e) => setCachePath(e.target.value)}
                placeholder="Use the default app data directory"
              />
              <button
                type="button"
                className="easycp-icon-btn"
                onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected && typeof selected === "string") setCachePath(selected);
                }}
                title="Choose folder"
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>
            {effectiveDir && <small>Current path: {effectiveDir}</small>}
          </label>

          <label className="easycp-field">
            <span>Global shortcut</span>
            <input type="text" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
          </label>

          <label className="easycp-checkrow">
            <input type="checkbox" checked={autoPaste} onChange={(e) => setAutoPaste(e.target.checked)} />
            <span>Auto paste after selecting a clipboard item</span>
          </label>

          <label className="easycp-checkrow">
            <input type="checkbox" checked={alwaysOnTop} onChange={(e) => setAlwaysOnTop(e.target.checked)} />
            <span>Keep window always on top</span>
          </label>

          <div className="easycp-settings-cols">
            <label className="easycp-field">
              <span>Page size</span>
              <input
                type="number"
                min="10"
                max="500"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 50)}
              />
            </label>

            <label className="easycp-field">
              <span>History limit</span>
              <input
                type="number"
                min="100"
                max="20000"
                step="100"
                value={historyLimit}
                onChange={(e) => setHistoryLimit(parseInt(e.target.value, 10) || 5000)}
              />
            </label>
          </div>

          <div className="easycp-settings-actions">
            <button type="button" className="easycp-primary-btn" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </button>
            {message && <span className="easycp-settings-msg">{message}</span>}
          </div>
        </section>

        <section className="easycp-settings-card">
          <div className="easycp-settings-head">
            <h2>
              <Cloud className="h-4 w-4" />
              WebDAV
            </h2>
            <p>Preserve and migrate older synchronized clipboard history into the current local database.</p>
          </div>

          <label className="easycp-checkrow">
            <input
              type="checkbox"
              checked={webdavSyncEnabled}
              onChange={(e) => setWebdavSyncEnabled(e.target.checked)}
            />
            <span>Enable WebDAV sync and migration</span>
          </label>

          <label className="easycp-field">
            <span>WebDAV URL</span>
            <input
              type="text"
              value={webdavUrl}
              onChange={(e) => setWebdavUrl(e.target.value)}
              placeholder="https://example.com/remote.php/dav/files/user/easycptrans"
            />
          </label>

          <label className="easycp-field">
            <span>Username</span>
            <input type="text" value={webdavUsername} onChange={(e) => setWebdavUsername(e.target.value)} />
          </label>

          <label className="easycp-field">
            <span>Password</span>
            <input
              type="password"
              value={webdavPassword}
              onChange={(e) => setWebdavPassword(e.target.value)}
              placeholder="Leave blank to keep the existing password"
            />
          </label>

          <label className="easycp-field">
            <span>Device name</span>
            <input type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </label>

          <div className="easycp-settings-actions">
            <button
              type="button"
              className="easycp-secondary-btn"
              onClick={() => void handleVerifyWebdav()}
              disabled={webdavBusy || !webdavUrl.trim() || !webdavUsername.trim()}
            >
              {webdavBusy ? "Checking..." : "Verify WebDAV"}
            </button>
            <button
              type="button"
              className="easycp-primary-btn"
              onClick={() => void handleSyncNow()}
              disabled={webdavBusy || !webdavSyncEnabled || !webdavUrl.trim() || !webdavUsername.trim()}
            >
              {webdavBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
              {webdavBusy ? "Syncing..." : "Sync now"}
            </button>
          </div>
          {webdavMessage && <span className="easycp-settings-msg">{webdavMessage}</span>}
        </section>

        <section className="easycp-settings-card easycp-settings-card-wide">
          <div className="easycp-settings-head">
            <h2>
              <Shield className="h-4 w-4" />
              Privacy
            </h2>
            <p>
              Password: {privacyStatus.passwordSet ? "configured" : "not configured"} · Question:{" "}
              {privacyStatus.securityQuestionSet ? "configured" : "not configured"} · Private items:{" "}
              {privacyStatus.privateItems}
            </p>
          </div>

          {privacyStatus.passwordSet && (
            <label className="easycp-field">
              <span>Current password</span>
              <input type="password" value={privacyCurrent} onChange={(e) => setPrivacyCurrent(e.target.value)} />
            </label>
          )}

          <div className="easycp-settings-cols">
            <label className="easycp-field">
              <span>New password</span>
              <input type="password" value={privacyNew} onChange={(e) => setPrivacyNew(e.target.value)} />
            </label>

            <label className="easycp-field">
              <span>Confirm password</span>
              <input type="password" value={privacyConfirm} onChange={(e) => setPrivacyConfirm(e.target.value)} />
            </label>
          </div>

          <div className="easycp-settings-cols">
            <label className="easycp-field">
              <span>Security question</span>
              <input type="text" value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} />
            </label>

            <label className="easycp-field">
              <span>Security answer</span>
              <input type="password" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} />
            </label>
          </div>

          <div className="easycp-settings-actions">
            <button
              type="button"
              className="easycp-primary-btn"
              onClick={() => void handleSetPrivacyPassword()}
              disabled={privacyBusy}
            >
              {privacyBusy ? "Saving..." : "Save privacy settings"}
            </button>
            {privacyMessage && <span className="easycp-settings-msg">{privacyMessage}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
