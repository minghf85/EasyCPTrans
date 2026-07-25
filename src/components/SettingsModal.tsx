import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Cloud, Folder, RefreshCw, Shield } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { LOCALE_OPTIONS, normalizeLocale, tr, type Locale } from "../lib/i18n";

interface Props {
  locale: Locale;
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
    locale: Locale;
  }) => void;
}

export interface SettingsModalHandle {
  save: () => Promise<void>;
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
  locale,
  allowModifierOnly = false,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  checkAvailability?: (value: string) => Promise<boolean>;
  help: string;
  locale: Locale;
  allowModifierOnly?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [draftValue, setDraftValue] = useState("");
  const displayValue = value.trim() || tr(locale, "shortcutDisabled");

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setDraftValue("");
        setStatus(tr(locale, "shortcutRecordingCancelled"));
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
          setStatus(tr(locale, "shortcutConfirmModifier"));
          return;
        }
        if (event.key === "Enter") {
          if (!draftValue.trim()) {
            setStatus(tr(locale, "shortcutNeedModifierFirst"));
            return;
          }
          onChange(canonicalizeShortcut(draftValue));
          setDraftValue("");
          setStatus(tr(locale, "shortcutRecordedSaveHint"));
          setRecording(false);
          return;
        }
        setStatus(tr(locale, "shortcutPrefixOnlyModifiers"));
        return;
      }

      if (isModifierKey(event.key)) {
        setStatus(tr(locale, "shortcutNeedNonModifier"));
        return;
      }
      if (!nextValue.includes("+")) {
        setStatus(tr(locale, "shortcutNeedModifier"));
        return;
      }

      const canonical = canonicalizeShortcut(nextValue);
      if (checkAvailability && canonical !== canonicalizeShortcut(value)) {
        const available = await checkAvailability(canonical).catch(() => false);
        if (!available) {
          setStatus(tr(locale, "shortcutAlreadyRegistered"));
          return;
        }
      }

      onChange(canonical);
      setDraftValue("");
      setStatus(tr(locale, "shortcutRecordedSaveHint"));
      setRecording(false);
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setDraftValue("");
      setStatus(tr(locale, "shortcutRecordingCancelled"));
      setRecording(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [recording, allowModifierOnly, onChange, checkAvailability, draftValue, value, locale]);

  return (
    <div className="eacptrans-field" ref={rootRef}>
      <span>{label}</span>
      <div className="eacptrans-shortcut-recorder">
        <div className={`eacptrans-shortcut-display ${recording ? "recording" : ""}`}>
          {recording
            ? allowModifierOnly
              ? draftValue || tr(locale, "shortcutPressModifierEnter")
              : tr(locale, "shortcutPressKeys")
            : displayValue}
        </div>
        <button
          type="button"
          className="eacptrans-secondary-btn"
          onClick={() => {
            setDraftValue("");
            setStatus("");
            setRecording((prev) => !prev);
          }}
        >
          {recording ? tr(locale, "shortcutCancel") : tr(locale, "shortcutRecord")}
        </button>
        <button
          type="button"
          className="eacptrans-secondary-btn"
          onClick={() => onChange("")}
        >
          {tr(locale, "shortcutClear")}
        </button>
        <button
          type="button"
          className="eacptrans-secondary-btn"
          onClick={() => onChange(defaultValue)}
        >
          {tr(locale, "shortcutDefault")}
        </button>
      </div>
      <small>{help}</small>
      {status && <small>{status}</small>}
    </div>
  );
}

export const SettingsModal = forwardRef<SettingsModalHandle, Props>(function SettingsModal({ locale, onSaved }, ref) {
  const [cachePath, setCachePath] = useState("");
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
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
  const [privacyMessage, setPrivacyMessage] = useState("");
  const quickPastePrefixWarning =
    /^super$/i.test(quickPastePrefix.trim())
      ? tr(selectedLocale, "quickPasteWinWarning")
      : "";

  useEffect(() => {
    setSelectedLocale(locale);
  }, [locale]);
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
        setSelectedLocale(normalizeLocale(cfg.locale));
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
        setPrivacyMessage(tr(selectedLocale, "privacyLoadFailed") + String(err));
      });
  }, []);

  const handleSave = async () => {
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
        locale: selectedLocale,
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
      const shouldSavePrivacy =
        Boolean(privacyCurrent.trim()) ||
        Boolean(privacyNew.trim()) ||
        Boolean(privacyConfirm.trim()) ||
        Boolean(securityAnswer.trim());
      if (shouldSavePrivacy) {
        const privacySaved = await handleSetPrivacyPassword();
        if (!privacySaved) {
          throw new Error(tr(selectedLocale, "privacyNotSaved"));
        }
      }
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
        locale: selectedLocale,
      });
      setWebdavPassword("");
      if (shortcutReport.failed.length > 0) {
        throw new Error(
          `Some shortcuts failed: ${shortcutReport.failed
            .map((item) => `${item.shortcut} (${item.reason})`)
            .join(" | ")}`,
        );
      }
    } catch (err) {
      throw err;
    }
  };

  const handleVerifyWebdav = async () => {
    setWebdavBusy(true);
    setWebdavMessage("");
    try {
      await api.verifyWebdav(webdavUrl.trim(), webdavUsername.trim(), webdavPassword.trim() || undefined);
      setWebdavMessage(tr(selectedLocale, "webdavVerified"));
    } catch (err) {
      setWebdavMessage(tr(selectedLocale, "webdavVerifyFailed") + String(err));
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
      setWebdavMessage(tr(selectedLocale, "webdavSynced"));
    } catch (err) {
      setWebdavMessage(tr(selectedLocale, "webdavSyncFailed") + String(err));
    } finally {
      setWebdavBusy(false);
    }
  };

  const handleSetPrivacyPassword = async (): Promise<boolean> => {
    const next = privacyNew.trim();
    const question = securityQuestion.trim();
    const answer = securityAnswer.trim();

    if (next.length < 6) {
      setPrivacyMessage(tr(selectedLocale, "privacyPasswordTooShort"));
      return false;
    }
    if (next !== privacyConfirm) {
      setPrivacyMessage(tr(selectedLocale, "privacyPasswordMismatch"));
      return false;
    }
    if (!question) {
      setPrivacyMessage(tr(selectedLocale, "privacyQuestionRequired"));
      return false;
    }
    if (answer.length < 2) {
      setPrivacyMessage(tr(selectedLocale, "privacyAnswerTooShort"));
      return false;
    }

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
      setPrivacyMessage(tr(selectedLocale, "privacyUpdated"));
      return true;
    } catch (err) {
      setPrivacyMessage(tr(selectedLocale, "privacyUpdateFailed") + String(err));
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave }));

  return (
    <div className="eacptrans-settings-page">
      <div className="eacptrans-settings-grid">
        <section className="eacptrans-settings-card">
          <div className="eacptrans-settings-head">
            <h2>{tr(selectedLocale, "settingsGeneral")}</h2>
            <p>{tr(selectedLocale, "settingsGeneralDesc")}</p>
          </div>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "language")}</span>
            <select
              value={selectedLocale}
              onChange={(event) => setSelectedLocale(normalizeLocale(event.target.value))}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "dataPath")}</span>
            <div className="eacptrans-path-row">
              <input
                type="text"
                value={cachePath}
                onChange={(e) => setCachePath(e.target.value)}
                placeholder={tr(selectedLocale, "dataPathPlaceholder")}
              />
              <button
                type="button"
                className="eacptrans-icon-btn"
                onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected && typeof selected === "string") setCachePath(selected);
                }}
                title={tr(selectedLocale, "chooseFolder")}
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>
            {effectiveDir && <small>{tr(selectedLocale, "currentPath")}: {effectiveDir}</small>}
          </label>

          <div className="eacptrans-settings-cols">
            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "pageSize")}</span>
              <input
                type="number"
                min="10"
                max="500"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10) || 50)}
              />
            </label>

            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "historyLimit")}</span>
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

        </section>

        <section className="eacptrans-settings-card">
          <div className="eacptrans-settings-head">
            <h2>{tr(selectedLocale, "globalShortcuts")}</h2>
            <p>{tr(selectedLocale, "globalShortcutsDesc")}</p>
          </div>

          <ShortcutRecorder
            label={tr(selectedLocale, "globalShortcut")}
            value={shortcut}
            defaultValue="CommandOrControl+Shift+V"
            onChange={setShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help={tr(selectedLocale, "globalShortcutHelp")}
            locale={selectedLocale}
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "queueStepShortcut")}
            value={queueStepShortcut}
            defaultValue="CommandOrControl+Alt+V"
            onChange={setQueueStepShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help={tr(selectedLocale, "queueStepShortcutHelp")}
            locale={selectedLocale}
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "quickPastePrefix")}
            value={quickPastePrefix}
            defaultValue="CommandOrControl+Shift"
            onChange={setQuickPastePrefix}
            help={tr(selectedLocale, "quickPastePrefixHelp")}
            locale={selectedLocale}
            allowModifierOnly
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "stackShortcutPrefix")}
            value={stackShortcutPrefix}
            defaultValue="CommandOrControl+Alt"
            onChange={setStackShortcutPrefix}
            help={tr(selectedLocale, "stackShortcutPrefixHelp")}
            locale={selectedLocale}
            allowModifierOnly
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "wordTranslateShortcut")}
            value={wordTranslateShortcut}
            defaultValue="Alt+C"
            onChange={setWordTranslateShortcut}
            checkAvailability={api.probeShortcutAvailable}
            help={tr(selectedLocale, "wordTranslateShortcutHelp")}
            locale={selectedLocale}
          />

          {quickPastePrefixWarning && <div className="eacptrans-settings-msg">{quickPastePrefixWarning}</div>}
        </section>

        <section className="eacptrans-settings-card">
          <div className="eacptrans-settings-head">
            <h2>{tr(selectedLocale, "selectedItemKeys")}</h2>
            <p>{tr(selectedLocale, "selectedItemKeysDesc")}</p>
          </div>

          <ShortcutRecorder
            label={tr(selectedLocale, "selectedItemTag")}
            value={itemTagShortcut}
            defaultValue="T"
            onChange={setItemTagShortcut}
            help={tr(selectedLocale, "selectedItemTagHelp")}
            locale={selectedLocale}
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "selectedItemPrivate")}
            value={itemPrivateShortcut}
            defaultValue="M"
            onChange={setItemPrivateShortcut}
            help={tr(selectedLocale, "selectedItemPrivateHelp")}
            locale={selectedLocale}
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "selectedItemPin")}
            value={itemPinShortcut}
            defaultValue="P"
            onChange={setItemPinShortcut}
            help={tr(selectedLocale, "selectedItemPinHelp")}
            locale={selectedLocale}
          />

          <ShortcutRecorder
            label={tr(selectedLocale, "selectedItemDelete")}
            value={itemDeleteShortcut}
            defaultValue="Delete"
            onChange={setItemDeleteShortcut}
            help={tr(selectedLocale, "selectedItemDeleteHelp")}
            locale={selectedLocale}
          />
        </section>

        <section className="eacptrans-settings-card">
          <div className="eacptrans-settings-head">
            <h2>{tr(selectedLocale, "translation")}</h2>
            <p>{tr(selectedLocale, "translationDesc")}</p>
          </div>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "ecdictPath")}</span>
            <div className="eacptrans-path-row">
              <input
                type="text"
                value={ecdictPath}
                onChange={(e) => setEcdictPath(e.target.value)}
                placeholder={tr(selectedLocale, "ecdictPathPlaceholder")}
              />
              <button
                type="button"
                className="eacptrans-icon-btn"
                onClick={async () => {
                  const selected = await open({ directory: false, multiple: false });
                  if (selected && typeof selected === "string") setEcdictPath(selected);
                }}
                title={tr(selectedLocale, "chooseEcdictFile")}
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>
            <small>{tr(selectedLocale, "ecdictPathHelp")}</small>
          </label>
        </section>

        <section className="eacptrans-settings-card">
          <div className="eacptrans-settings-head">
            <h2>
              <Cloud className="h-4 w-4" />
              WebDAV
            </h2>
            <p>{tr(selectedLocale, "webdavDesc")}</p>
          </div>

          <label className="eacptrans-checkrow">
            <input
              type="checkbox"
              checked={webdavSyncEnabled}
              onChange={(e) => setWebdavSyncEnabled(e.target.checked)}
            />
            <span>{tr(selectedLocale, "enableWebdav")}</span>
          </label>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "webdavUrl")}</span>
            <input
              type="text"
              value={webdavUrl}
              onChange={(e) => setWebdavUrl(e.target.value)}
              placeholder={tr(selectedLocale, "webdavUrlPlaceholder")}
            />
          </label>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "username")}</span>
            <input type="text" value={webdavUsername} onChange={(e) => setWebdavUsername(e.target.value)} />
          </label>

          <label className="eacptrans-field">
            <span>{tr(selectedLocale, "password")}</span>
            <input
              type="password"
              value={webdavPassword}
              onChange={(e) => setWebdavPassword(e.target.value)}
              placeholder={tr(selectedLocale, "webdavPasswordPlaceholder")}
            />
          </label>

          <div className="eacptrans-settings-actions">
            <button
              type="button"
              className="eacptrans-secondary-btn"
              onClick={() => void handleVerifyWebdav()}
              disabled={webdavBusy || !webdavUrl.trim() || !webdavUsername.trim()}
            >
              {webdavBusy ? tr(selectedLocale, "checking") : tr(selectedLocale, "verifyWebdav")}
            </button>
            <button
              type="button"
              className="eacptrans-primary-btn"
              onClick={() => void handleSyncNow()}
              disabled={webdavBusy || !webdavSyncEnabled || !webdavUrl.trim() || !webdavUsername.trim()}
            >
              {webdavBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
              {webdavBusy ? tr(selectedLocale, "syncing") : tr(selectedLocale, "syncNow")}
            </button>
          </div>
          {webdavMessage && <span className="eacptrans-settings-msg">{webdavMessage}</span>}
        </section>

        <section className="eacptrans-settings-card eacptrans-settings-card-wide">
          <div className="eacptrans-settings-head">
            <h2>
              <Shield className="h-4 w-4" />
              {tr(selectedLocale, "privacy")}
            </h2>
            <p>
              {tr(selectedLocale, "privacyStatusPassword")}:{" "}
              {privacyStatus.passwordSet ? tr(selectedLocale, "configured") : tr(selectedLocale, "notConfigured")} ·{" "}
              {tr(selectedLocale, "privacyStatusQuestion")}:{" "}
              {privacyStatus.securityQuestionSet ? tr(selectedLocale, "configured") : tr(selectedLocale, "notConfigured")} ·{" "}
              {tr(selectedLocale, "privacyStatusPrivateItems")}:{" "}
              {privacyStatus.privateItems}
            </p>
          </div>

          {privacyStatus.passwordSet && (
            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "currentPassword")}</span>
              <input type="password" value={privacyCurrent} onChange={(e) => setPrivacyCurrent(e.target.value)} />
            </label>
          )}

          <div className="eacptrans-settings-cols">
            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "newPassword")}</span>
              <input type="password" value={privacyNew} onChange={(e) => setPrivacyNew(e.target.value)} />
            </label>

            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "confirmPassword")}</span>
              <input type="password" value={privacyConfirm} onChange={(e) => setPrivacyConfirm(e.target.value)} />
            </label>
          </div>

          <div className="eacptrans-settings-cols">
            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "securityQuestion")}</span>
              <input type="text" value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} />
            </label>

            <label className="eacptrans-field">
              <span>{tr(selectedLocale, "securityAnswer")}</span>
              <input type="password" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} />
            </label>
          </div>

          {privacyMessage && <span className="eacptrans-settings-msg">{privacyMessage}</span>}
        </section>
      </div>
    </div>
  );
});
