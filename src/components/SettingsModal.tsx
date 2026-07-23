import { useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Folder, RefreshCw, Shield } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";

interface Props {
  onSaved: (settings: {
    shortcut: string;
    queueStepShortcut: string;
    quickPastePrefix: string;
    stackShortcutPrefix: string;
    wordTranslateShortcut: string;
    itemTagShortcut: string;
    itemPrivateShortcut: string;
    itemPinShortcut: string;
    itemDeleteShortcut: string;
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

function normalizeShortcutValue(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}

function migrateQuickPastePrefix(value: string) {
  return canonicalizeShortcut(value) === "Super+Shift"
    ? "CommandOrControl+Shift"
    : value;
}

function normalizeKeyboardKey(key: string) {
  if (key === " ") return "Space";
  if (key === "Escape") return "Esc";
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function canonicalizeShortcut(value: string) {
  const normalized = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ctrl", "control", "commandorcontrol", "cmdorctrl", "cmdorcontrol"].includes(lower)) {
        return "CommandOrControl";
      }
      if (["alt", "option"].includes(lower)) {
        return "Alt";
      }
      if (["shift"].includes(lower)) {
        return "Shift";
      }
      if (["super", "meta", "win", "windows", "command", "cmd"].includes(lower)) {
        return "Super";
      }
      if (lower === "escape") return "Esc";
      if (lower === "arrowup") return "Up";
      if (lower === "arrowdown") return "Down";
      if (lower === "arrowleft") return "Left";
      if (lower === "arrowright") return "Right";
      if (lower === " ") return "Space";
      if (part.length === 1) return part.toUpperCase();
      return part;
    });

  const modifierOrder = ["CommandOrControl", "Super", "Alt", "Shift"];
  const modifiers = normalized
    .filter((part) => modifierOrder.includes(part))
    .sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
  const keys = normalized.filter((part) => !modifierOrder.includes(part));
  return [...modifiers, ...keys].join("+");
}

function formatShortcutFromEvent(event: KeyboardEvent) {
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Super");
  if (event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const key = normalizeKeyboardKey(event.key);
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return canonicalizeShortcut(modifiers.join("+"));
  }
  return canonicalizeShortcut([...modifiers, key].filter(Boolean).join("+"));
}

function isModifierKey(key: string) {
  return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
}

function ShortcutRecorder({
  label,
  value,
  defaultValue,
  onChange,
  checkAvailability,
  help,
  allowModifierOnly = false,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  checkAvailability?: (value: string) => Promise<boolean>;
  help: string;
  allowModifierOnly?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [draftValue, setDraftValue] = useState("");
  const displayValue = value.trim() || "Disabled";

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setDraftValue("");
        setStatus("Recording cancelled.");
        setRecording(false);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        setDraftValue("");
        onChange("");
        setRecording(false);
        return;
      }

      const nextValue = formatShortcutFromEvent(event);
      if (!nextValue) return;
      if (allowModifierOnly) {
        if (isModifierKey(event.key)) {
          setDraftValue(canonicalizeShortcut(nextValue));
          setStatus("Press Enter to confirm this modifier prefix.");
          return;
        }
        if (event.key === "Enter") {
          if (!draftValue.trim()) {
            setStatus("Press one or more modifier keys first.");
            return;
          }
          onChange(canonicalizeShortcut(draftValue));
          setDraftValue("");
          setStatus("Recorded. Save settings to apply.");
          setRecording(false);
          return;
        }
        setStatus("Quick paste prefix only accepts modifier keys. Press Enter to confirm.");
        return;
      }

      if (isModifierKey(event.key)) {
        setStatus("Press a non-modifier key to finish the shortcut.");
        return;
      }
      if (!nextValue.includes("+")) {
        setStatus("Use at least one modifier key.");
        return;
      }

      const canonical = canonicalizeShortcut(nextValue);
      if (checkAvailability && canonical !== canonicalizeShortcut(value)) {
        const available = await checkAvailability(canonical).catch(() => false);
        if (!available) {
          setStatus("Shortcut is already registered. Try another combination.");
          return;
        }
      }

      onChange(canonical);
      setDraftValue("");
      setStatus("Recorded. Save settings to apply.");
      setRecording(false);
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setDraftValue("");
      setStatus("Recording cancelled.");
      setRecording(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [recording, allowModifierOnly, onChange, checkAvailability, draftValue, value]);

  return (
    <div className="easycp-field" ref={rootRef}>
      <span>{label}</span>
      <div className="easycp-shortcut-recorder">
        <div className={`easycp-shortcut-display ${recording ? "recording" : ""}`}>
          {recording
            ? allowModifierOnly
              ? draftValue || "Press modifier keys, then Enter..."
              : "Press keys..."
            : displayValue}
        </div>
        <button
          type="button"
          className="easycp-secondary-btn"
          onClick={() => {
            setDraftValue("");
            setStatus("");
            setRecording((prev) => !prev);
          }}
        >
          {recording ? "Cancel" : "Record"}
        </button>
        <button
          type="button"
          className="easycp-secondary-btn"
          onClick={() => onChange("")}
        >
          Clear
        </button>
        <button
          type="button"
          className="easycp-secondary-btn"
          onClick={() => onChange(defaultValue)}
        >
          Default
        </button>
      </div>
      <small>{help}</small>
      {status && <small>{status}</small>}
    </div>
  );
}

export function SettingsModal({ onSaved }: Props) {
  const [cachePath, setCachePath] = useState("");
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+V");
  const [queueStepShortcut, setQueueStepShortcut] = useState("CommandOrControl+Alt+V");
  const [quickPastePrefix, setQuickPastePrefix] = useState("CommandOrControl+Shift");
  const [stackShortcutPrefix, setStackShortcutPrefix] = useState("CommandOrControl+Alt");
  const [wordTranslateShortcut, setWordTranslateShortcut] = useState("Alt+C");
  const [itemTagShortcut, setItemTagShortcut] = useState("T");
  const [itemPrivateShortcut, setItemPrivateShortcut] = useState("M");
  const [itemPinShortcut, setItemPinShortcut] = useState("P");
  const [itemDeleteShortcut, setItemDeleteShortcut] = useState("Delete");
  const [ecdictPath, setEcdictPath] = useState("");
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
  const quickPastePrefixWarning =
    /^super$/i.test(quickPastePrefix.trim())
      ? "Using Win alone as the quick paste modifier is likely to conflict with system shortcuts."
      : "";
  const normalizedShortcut = useMemo(
    () => normalizeShortcutValue(shortcut, "CommandOrControl+Shift+V"),
    [shortcut],
  );
  const normalizedQueueStepShortcut = useMemo(
    () => normalizeShortcutValue(queueStepShortcut, "CommandOrControl+Alt+V"),
    [queueStepShortcut],
  );
  const normalizedQuickPastePrefix = useMemo(
    () => normalizeShortcutValue(quickPastePrefix, "CommandOrControl+Shift"),
    [quickPastePrefix],
  );
  const normalizedStackShortcutPrefix = useMemo(
    () => normalizeShortcutValue(stackShortcutPrefix, "CommandOrControl+Alt"),
    [stackShortcutPrefix],
  );
  const normalizedWordTranslateShortcut = useMemo(
    () => normalizeShortcutValue(wordTranslateShortcut, "Alt+C"),
    [wordTranslateShortcut],
  );
  const normalizedItemTagShortcut = useMemo(
    () => normalizeShortcutValue(itemTagShortcut, "T"),
    [itemTagShortcut],
  );
  const normalizedItemPrivateShortcut = useMemo(
    () => normalizeShortcutValue(itemPrivateShortcut, "M"),
    [itemPrivateShortcut],
  );
  const normalizedItemPinShortcut = useMemo(
    () => normalizeShortcutValue(itemPinShortcut, "P"),
    [itemPinShortcut],
  );
  const normalizedItemDeleteShortcut = useMemo(
    () => normalizeShortcutValue(itemDeleteShortcut, "Delete"),
    [itemDeleteShortcut],
  );

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (!cfg) return;
        setCachePath(cfg.cachePath || "");
        const nextShortcutRaw = normalizeShortcutValue(cfg.shortcut, "CommandOrControl+Shift+V");
        const nextShortcut =
          canonicalizeShortcut(nextShortcutRaw) === "Super+Shift+V"
            ? "CommandOrControl+Shift+V"
            : nextShortcutRaw;
        const nextQueueStepShortcut = normalizeShortcutValue(cfg.queueStepShortcut, "CommandOrControl+Alt+V");
        const nextQuickPastePrefix = migrateQuickPastePrefix(
          normalizeShortcutValue(cfg.quickPastePrefix, "CommandOrControl+Shift"),
        );
        const nextStackShortcutPrefix = normalizeShortcutValue(cfg.stackShortcutPrefix, "CommandOrControl+Alt");
        const nextWordTranslateShortcut = normalizeShortcutValue(cfg.wordTranslateShortcut, "Alt+C");
        const nextItemTagShortcut = normalizeShortcutValue(cfg.itemTagShortcut, "T");
        const nextItemPrivateShortcut = normalizeShortcutValue(cfg.itemPrivateShortcut, "M");
        const nextItemPinShortcut = normalizeShortcutValue(cfg.itemPinShortcut, "P");
        const nextItemDeleteShortcut = normalizeShortcutValue(cfg.itemDeleteShortcut, "Delete");
        setShortcut(canonicalizeShortcut(nextShortcut));
        setQueueStepShortcut(canonicalizeShortcut(nextQueueStepShortcut));
        setQuickPastePrefix(canonicalizeShortcut(nextQuickPastePrefix));
        setStackShortcutPrefix(canonicalizeShortcut(nextStackShortcutPrefix));
        setWordTranslateShortcut(canonicalizeShortcut(nextWordTranslateShortcut));
        setItemTagShortcut(canonicalizeShortcut(nextItemTagShortcut));
        setItemPrivateShortcut(canonicalizeShortcut(nextItemPrivateShortcut));
        setItemPinShortcut(canonicalizeShortcut(nextItemPinShortcut));
        setItemDeleteShortcut(canonicalizeShortcut(nextItemDeleteShortcut));
        setEcdictPath(cfg.ecdictPath || "");
        if (
          nextShortcut !== (cfg.shortcut ?? "") ||
          nextQueueStepShortcut !== (cfg.queueStepShortcut ?? "") ||
          nextQuickPastePrefix !== (cfg.quickPastePrefix ?? "") ||
          nextStackShortcutPrefix !== (cfg.stackShortcutPrefix ?? "") ||
          nextWordTranslateShortcut !== (cfg.wordTranslateShortcut ?? "") ||
          nextItemTagShortcut !== (cfg.itemTagShortcut ?? "") ||
          nextItemPrivateShortcut !== (cfg.itemPrivateShortcut ?? "") ||
          nextItemPinShortcut !== (cfg.itemPinShortcut ?? "") ||
          nextItemDeleteShortcut !== (cfg.itemDeleteShortcut ?? "")
        ) {
          void api.setConfig({
            shortcut: canonicalizeShortcut(nextShortcut),
            queueStepShortcut: canonicalizeShortcut(nextQueueStepShortcut),
            quickPastePrefix: canonicalizeShortcut(nextQuickPastePrefix),
            stackShortcutPrefix: canonicalizeShortcut(nextStackShortcutPrefix),
            wordTranslateShortcut: canonicalizeShortcut(nextWordTranslateShortcut),
            itemTagShortcut: canonicalizeShortcut(nextItemTagShortcut),
            itemPrivateShortcut: canonicalizeShortcut(nextItemPrivateShortcut),
            itemPinShortcut: canonicalizeShortcut(nextItemPinShortcut),
            itemDeleteShortcut: canonicalizeShortcut(nextItemDeleteShortcut),
          }).catch(console.error);
        }
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
        shortcut: normalizedShortcut,
        queueStepShortcut: normalizedQueueStepShortcut,
        quickPastePrefix: normalizedQuickPastePrefix,
        stackShortcutPrefix: normalizedStackShortcutPrefix,
        wordTranslateShortcut: normalizedWordTranslateShortcut,
        itemTagShortcut: normalizedItemTagShortcut,
        itemPrivateShortcut: normalizedItemPrivateShortcut,
        itemPinShortcut: normalizedItemPinShortcut,
        itemDeleteShortcut: normalizedItemDeleteShortcut,
        ecdictPath,
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
      const shortcutReport = await api.refreshGlobalShortcuts();
      onSaved({
        shortcut: normalizedShortcut,
        queueStepShortcut: normalizedQueueStepShortcut,
        quickPastePrefix: normalizedQuickPastePrefix,
        stackShortcutPrefix: normalizedStackShortcutPrefix,
        wordTranslateShortcut: normalizedWordTranslateShortcut,
        itemTagShortcut: normalizedItemTagShortcut,
        itemPrivateShortcut: normalizedItemPrivateShortcut,
        itemPinShortcut: normalizedItemPinShortcut,
        itemDeleteShortcut: normalizedItemDeleteShortcut,
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
      if (shortcutReport.failed.length > 0) {
        setMessage(
          `Settings saved, but some shortcuts failed: ${shortcutReport.failed
            .map((item) => `${item.shortcut} (${item.reason})`)
            .join(" | ")}`,
        );
      } else {
        setMessage("Settings saved.");
      }
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

          <ShortcutRecorder
            label="Global shortcut"
            value={shortcut}
            defaultValue="CommandOrControl+Shift+V"
            onChange={setShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help="Click Record, then press the full combination. Backspace/Delete clears it."
          />

          <ShortcutRecorder
            label="Queue step shortcut"
            value={queueStepShortcut}
            defaultValue="CommandOrControl+Alt+V"
            onChange={setQueueStepShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help="Used to paste queued items one by one."
          />

          <ShortcutRecorder
            label="Quick paste prefix"
            value={quickPastePrefix}
            defaultValue="CommandOrControl+Shift"
            onChange={setQuickPastePrefix}
            help="This modifier prefix combines with 1-9 and 0 for quick paste slots 1-10."
            allowModifierOnly
          />

          <ShortcutRecorder
            label="Stack shortcut prefix"
            value={stackShortcutPrefix}
            defaultValue="CommandOrControl+Alt"
            onChange={setStackShortcutPrefix}
            help="This modifier prefix combines with Up/Down to start or cancel stacking."
            allowModifierOnly
          />

          <ShortcutRecorder
            label="Word translate shortcut"
            value={wordTranslateShortcut}
            defaultValue="Alt+C"
            onChange={setWordTranslateShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help="Copy the selected word or short phrase, then look it up through ECDICT."
          />

          <ShortcutRecorder
            label="Selected item tag"
            value={itemTagShortcut}
            defaultValue="T"
            onChange={setItemTagShortcut}
            help="When the window is pinned on top, open the quick tag picker for the selected item."
          />

          <ShortcutRecorder
            label="Selected item private"
            value={itemPrivateShortcut}
            defaultValue="M"
            onChange={setItemPrivateShortcut}
            help="When the window is pinned on top, mark the selected item as private."
          />

          <ShortcutRecorder
            label="Selected item pin"
            value={itemPinShortcut}
            defaultValue="P"
            onChange={setItemPinShortcut}
            help="When the window is pinned on top, pin or unpin the selected item."
          />

          <ShortcutRecorder
            label="Selected item delete"
            value={itemDeleteShortcut}
            defaultValue="Delete"
            onChange={setItemDeleteShortcut}
            help="When the window is pinned on top, delete the selected item."
          />

          <label className="easycp-field">
            <span>ECDICT path</span>
            <div className="easycp-path-row">
              <input
                type="text"
                value={ecdictPath}
                onChange={(e) => setEcdictPath(e.target.value)}
                placeholder="Use app data dictionaries or ./ECDICT/ecdict.csv"
              />
              <button
                type="button"
                className="easycp-icon-btn"
                onClick={async () => {
                  const selected = await open({ directory: false, multiple: false });
                  if (selected && typeof selected === "string") setEcdictPath(selected);
                }}
                title="Choose ECDICT file"
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>
            <small>Supports ECDICT sqlite files first, with CSV fallback for local development.</small>
          </label>
          {quickPastePrefixWarning && <div className="easycp-settings-msg">{quickPastePrefixWarning}</div>}

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
