import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Cloud, Compass, Folder, RefreshCw, ScanText, Shield, Wifi } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { LOCALE_OPTIONS, normalizeLocale, tr, type Locale } from "../lib/i18n";
import {
  buttonPrimary,
  buttonSecondary,
  checkbox,
  iconButton,
  input,
  inset,
  select,
  surface,
} from "./ui";

interface Props {
  locale: Locale;
  /** Replays the guided tour from the first step. */
  onStartTutorial: () => void;
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
    itemOcrShortcut: string;
    itemZoomShortcut: string;
    autoPaste: boolean;
    pageSize: number;
    historyLimit: number;
    webdavUrl: string;
    webdavUsername: string;
    webdavSyncEnabled: boolean;
    deviceName: string;
    apiTranslateEnabled: boolean;
    apiTranslateBaseUrl: string;
    apiTranslateKey: string;
    apiTranslateModel: string;
    apiTranslateTargetLang: string;
    ocrEnabled: boolean;
    showMemoryUsage: boolean;
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

/* Shared form primitives. Defining them once keeps every settings card on the
 * same tokens instead of repeating utility strings a dozen times. */

function Section({
  title,
  description,
  icon,
  tourId,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Marks the section for the guided tour. */
  tourId?: string;
  children: ReactNode;
}) {
  return (
    <section data-tour={tourId} className={`${surface} p-6`}>
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2.5 text-sm ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={checkbox}
      />
      <span className="font-medium text-gray-700">{label}</span>
    </label>
  );
}

/** Input with a trailing action, used by the path and pairing-code fields. */
function InputWithAction({
  value,
  onChange,
  placeholder,
  type = "text",
  action,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={input}
      />
      {action}
    </div>
  );
}

function Message({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        tone === "warning"
          ? "border border-amber-200 bg-amber-50 text-amber-700"
          : "text-gray-600"
      }`}
    >
      {children}
    </p>
  );
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
  allowBareKey = false,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  checkAvailability?: (value: string) => Promise<boolean>;
  help: string;
  locale: Locale;
  allowModifierOnly?: boolean;
  /** Accept a key with no modifier. Window shortcuts are single letters. */
  allowBareKey?: boolean;
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
      if (!allowBareKey && !nextValue.includes("+")) {
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
  }, [recording, allowModifierOnly, allowBareKey, onChange, checkAvailability, draftValue, value, locale]);

  return (
    <div ref={rootRef}>
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`min-w-[220px] flex-1 rounded-lg border px-3 py-2 font-mono text-xs transition duration-200 ease-out ${
            recording
              ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/25"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          {recording
            ? allowModifierOnly
              ? draftValue || tr(locale, "shortcutPressModifierEnter")
              : tr(locale, "shortcutPressKeys")
            : displayValue}
        </div>
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => {
            setDraftValue("");
            setStatus("");
            setRecording((prev) => !prev);
          }}
        >
          {recording ? tr(locale, "shortcutCancel") : tr(locale, "shortcutRecord")}
        </button>
        <button type="button" className={buttonSecondary} onClick={() => onChange("")}>
          {tr(locale, "shortcutClear")}
        </button>
        <button type="button" className={buttonSecondary} onClick={() => onChange(defaultValue)}>
          {tr(locale, "shortcutDefault")}
        </button>
      </div>
      <span className="mt-1.5 block text-xs text-gray-500">{help}</span>
      {status && <span className="mt-1 block text-xs font-medium text-amber-600">{status}</span>}
    </div>
  );
}

export const SettingsModal = forwardRef<SettingsModalHandle, Props>(function SettingsModal({ locale, onStartTutorial, onSaved }, ref) {
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
  const [itemOcrShortcut, setItemOcrShortcut] = useState("O");
  const [itemZoomShortcut, setItemZoomShortcut] = useState("Z");
  const [ecdictPath, setEcdictPath] = useState("");
  const [effectiveDir, setEffectiveDir] = useState("");
  const [autoPaste, setAutoPaste] = useState(true);
  // Window pinning is deliberately not mirrored here. It is an immediate toggle
  // in the header, not a setting: this modal reads the config once on mount, so
  // a copy of `alwaysOnTop` would go stale the moment the pin was pressed and
  // saving would then write the old value back over it.
  const [pageSize, setPageSize] = useState(50);
  const [historyLimit, setHistoryLimit] = useState(5000);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [webdavSyncEnabled, setWebdavSyncEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState("This Device");
  const [apiTranslateEnabled, setApiTranslateEnabled] = useState(false);
  const [apiTranslateBaseUrl, setApiTranslateBaseUrl] = useState("");
  const [apiTranslateKey, setApiTranslateKey] = useState("");
  const [apiTranslateModel, setApiTranslateModel] = useState("gpt-4o-mini");
  const [apiTranslateTargetLang, setApiTranslateTargetLang] = useState("");
  const [webdavBusy, setWebdavBusy] = useState(false);
  const [webdavMessage, setWebdavMessage] = useState("");

  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrAuto, setOcrAuto] = useState(true);
  const [ocrLanguage, setOcrLanguage] = useState("");
  const [ocrLanguages, setOcrLanguages] = useState<Array<{ tag: string; name: string }>>([]);
  const [showMemoryUsage, setShowMemoryUsage] = useState(false);
  const [lanSyncEnabled, setLanSyncEnabled] = useState(false);
  const [lanSyncPairingCode, setLanSyncPairingCode] = useState("");
  const [lanSyncPort, setLanSyncPort] = useState(0);
  const [lanSyncPeers, setLanSyncPeers] = useState<Array<{ name: string; host: string; addresses: string[]; port: number }>>([]);
  const [lanSyncListening, setLanSyncListening] = useState(false);
  const [lanSyncBusy, setLanSyncBusy] = useState(false);
  const [lanSyncMessage, setLanSyncMessage] = useState("");

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
  const normalizedItemOcrShortcut = useMemo(
    () => normalizeShortcutValue(itemOcrShortcut, "O"),
    [itemOcrShortcut],
  );
  const normalizedItemZoomShortcut = useMemo(
    () => normalizeShortcutValue(itemZoomShortcut, "Z"),
    [itemZoomShortcut],
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
        const nextItemOcrShortcut = normalizeShortcutValue(cfg.itemOcrShortcut, "O");
        const nextItemZoomShortcut = normalizeShortcutValue(cfg.itemZoomShortcut, "Z");
        setShortcut(canonicalizeShortcut(nextShortcut));
        setQueueStepShortcut(canonicalizeShortcut(nextQueueStepShortcut));
        setQuickPastePrefix(canonicalizeShortcut(nextQuickPastePrefix));
        setStackShortcutPrefix(canonicalizeShortcut(nextStackShortcutPrefix));
        setWordTranslateShortcut(canonicalizeShortcut(nextWordTranslateShortcut));
        setItemTagShortcut(canonicalizeShortcut(nextItemTagShortcut));
        setItemPrivateShortcut(canonicalizeShortcut(nextItemPrivateShortcut));
        setItemPinShortcut(canonicalizeShortcut(nextItemPinShortcut));
        setItemDeleteShortcut(canonicalizeShortcut(nextItemDeleteShortcut));
        setItemOcrShortcut(canonicalizeShortcut(nextItemOcrShortcut));
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
            itemOcrShortcut: canonicalizeShortcut(nextItemOcrShortcut),
            itemZoomShortcut: canonicalizeShortcut(nextItemZoomShortcut),
          }).catch(console.error);
        }
        setEffectiveDir(cfg.effectiveDir || "");
        setWebdavUrl(cfg.webdavUrl || "");
        setWebdavUsername(cfg.webdavUsername || "");
        setWebdavSyncEnabled(Boolean(cfg.webdavSyncEnabled));
        setDeviceName(cfg.deviceName || "This Device");
        setApiTranslateEnabled(Boolean(cfg.apiTranslateEnabled));
        setApiTranslateBaseUrl(cfg.apiTranslateBaseUrl || "");
        setApiTranslateKey(cfg.apiTranslateKey || "");
        setApiTranslateModel(cfg.apiTranslateModel || "gpt-4o-mini");
        setApiTranslateTargetLang(cfg.apiTranslateTargetLang || "");
        setOcrEnabled(cfg.ocrEnabled !== false);
        setOcrAuto(cfg.ocrAuto !== false);
        setOcrLanguage(cfg.ocrLanguage || "");
        setShowMemoryUsage(Boolean(cfg.showMemoryUsage));
        setLanSyncEnabled(Boolean(cfg.lanSyncEnabled));
        setLanSyncPairingCode(cfg.lanSyncPairingCode || "");
        setLanSyncPort(typeof cfg.lanSyncPort === "number" ? cfg.lanSyncPort : 0);
        if (typeof cfg.autoPaste === "boolean") setAutoPaste(cfg.autoPaste);
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

  useEffect(() => {
    void api
      .listOcrLanguages()
      .then((list) => setOcrLanguages(list))
      .catch(() => setOcrLanguages([]));
  }, []);

  useEffect(() => {
    const refresh = () => {
      api
        .lanSyncStatus()
        .then((status) => {
          setLanSyncListening(status.listening);
          setLanSyncPeers(status.peers);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
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
        itemOcrShortcut: normalizedItemOcrShortcut,
        itemZoomShortcut: normalizedItemZoomShortcut,
        ecdictPath,
        locale: selectedLocale,
        autoPaste,
        pageSize,
        historyLimit,
        webdavUrl,
        webdavUsername,
        webdavSyncEnabled,
        deviceName,
        apiTranslateEnabled,
        apiTranslateBaseUrl: apiTranslateBaseUrl.trim(),
        apiTranslateKey: apiTranslateKey.trim(),
        apiTranslateModel: apiTranslateModel.trim() || "gpt-4o-mini",
        apiTranslateTargetLang: apiTranslateTargetLang.trim(),
        ocrEnabled,
        ocrAuto,
        ocrLanguage: ocrLanguage.trim(),
        showMemoryUsage,
        lanSyncEnabled,
        lanSyncPairingCode: lanSyncPairingCode.trim(),
        lanSyncPort,
        ...(webdavPassword.trim() ? { webdavPassword: webdavPassword.trim() } : {}),
      });
      await api.setLanSyncEnabled(lanSyncEnabled, lanSyncPairingCode.trim(), lanSyncPort).catch((err) => {
        console.error("LAN sync state update failed:", err);
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
        itemOcrShortcut: normalizedItemOcrShortcut,
        itemZoomShortcut: normalizedItemZoomShortcut,
        autoPaste,
        pageSize,
        historyLimit,
        webdavUrl,
        webdavUsername,
        webdavSyncEnabled,
        deviceName,
        apiTranslateEnabled,
        apiTranslateBaseUrl,
        apiTranslateKey,
        apiTranslateModel,
        apiTranslateTargetLang,
        ocrEnabled,
        showMemoryUsage,
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

  const handleGenerateLanPairingCode = async () => {
    try {
      const code = await api.generateLanPairingCode();
      setLanSyncPairingCode(code);
    } catch (err) {
      setLanSyncMessage(tr(selectedLocale, "lanSyncSyncFailed") + String(err));
    }
  };

  const handleLanSyncNow = async () => {
    setLanSyncBusy(true);
    setLanSyncMessage("");
    try {
      await api.setLanSyncEnabled(lanSyncEnabled, lanSyncPairingCode.trim(), lanSyncPort);
      if (!lanSyncEnabled) {
        setLanSyncMessage("LAN sync disabled.");
        return;
      }
      const result = await api.triggerLanSync();
      const parts = [
        `${tr(selectedLocale, "lanSyncSynced")}`,
        `${result.peersFound} peers`,
        `pushed ${result.pushed}, pulled ${result.pulled}`,
      ];
      if (result.errors.length > 0) {
        parts.push(`errors: ${result.errors.join("; ")}`);
      }
      setLanSyncMessage(parts.join(" · "));
    } catch (err) {
      setLanSyncMessage(tr(selectedLocale, "lanSyncSyncFailed") + String(err));
    } finally {
      setLanSyncBusy(false);
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
    <div className="eacp-animate-fade grid gap-6 pb-2 lg:grid-cols-2">
      <Section
        title={tr(selectedLocale, "settingsGeneral")}
        description={tr(selectedLocale, "settingsGeneralDesc")}
        tourId="settings-general"
      >
        <Field label={tr(selectedLocale, "language")}>
          <select
            value={selectedLocale}
            onChange={(event) => setSelectedLocale(normalizeLocale(event.target.value))}
            className={select}
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={tr(selectedLocale, "dataPath")}
          hint={effectiveDir ? `${tr(selectedLocale, "currentPath")}: ${effectiveDir}` : undefined}
        >
          <InputWithAction
            value={cachePath}
            onChange={setCachePath}
            placeholder={tr(selectedLocale, "dataPathPlaceholder")}
            action={
              <button
                type="button"
                className={`h-9 w-9 ${iconButton}`}
                onClick={async () => {
                  const selected = await open({ directory: true, multiple: false });
                  if (selected && typeof selected === "string") setCachePath(selected);
                }}
                title={tr(selectedLocale, "chooseFolder")}
                aria-label={tr(selectedLocale, "chooseFolder")}
              >
                <Folder className="h-4 w-4" aria-hidden />
              </button>
            }
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr(selectedLocale, "pageSize")}>
            <input
              type="number"
              min="10"
              max="500"
              value={pageSize}
              onChange={(event) => setPageSize(parseInt(event.target.value, 10) || 50)}
              className={input}
            />
          </Field>

          <Field label={tr(selectedLocale, "historyLimit")}>
            <input
              type="number"
              min="100"
              max="20000"
              step="100"
              value={historyLimit}
              onChange={(event) => setHistoryLimit(parseInt(event.target.value, 10) || 5000)}
              className={input}
            />
          </Field>
        </div>

        <CheckRow
          label={tr(selectedLocale, "showMemoryUsage")}
          checked={showMemoryUsage}
          onChange={setShowMemoryUsage}
        />
        <p className="text-xs text-gray-500">{tr(selectedLocale, "showMemoryUsageDesc")}</p>

        <div className={`flex items-center justify-between gap-4 p-3 ${inset}`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {tr(selectedLocale, "tutorialReplay")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {tr(selectedLocale, "tutorialReplayDesc")}
            </p>
          </div>
          <button type="button" className={`shrink-0 ${buttonSecondary}`} onClick={onStartTutorial}>
            <Compass className="h-4 w-4" aria-hidden />
            {tr(selectedLocale, "tutorialReplayAction")}
          </button>
        </div>
      </Section>

      <Section
        title={tr(selectedLocale, "globalShortcuts")}
        description={tr(selectedLocale, "globalShortcutsDesc")}
      >
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

        {quickPastePrefixWarning && <Message tone="warning">{quickPastePrefixWarning}</Message>}
      </Section>

      <Section
        title={tr(selectedLocale, "selectedItemKeys")}
        description={tr(selectedLocale, "selectedItemKeysDesc")}
      >
        <ShortcutRecorder
          label={tr(selectedLocale, "selectedItemTag")}
          value={itemTagShortcut}
          defaultValue="T"
          onChange={setItemTagShortcut}
          help={tr(selectedLocale, "selectedItemTagHelp")}
          locale={selectedLocale}
          allowBareKey
        />

        <ShortcutRecorder
          label={tr(selectedLocale, "selectedItemPrivate")}
          value={itemPrivateShortcut}
          defaultValue="M"
          onChange={setItemPrivateShortcut}
          help={tr(selectedLocale, "selectedItemPrivateHelp")}
          locale={selectedLocale}
          allowBareKey
        />

        <ShortcutRecorder
          label={tr(selectedLocale, "selectedItemPin")}
          value={itemPinShortcut}
          defaultValue="P"
          onChange={setItemPinShortcut}
          help={tr(selectedLocale, "selectedItemPinHelp")}
          locale={selectedLocale}
          allowBareKey
        />

        <ShortcutRecorder
          label={tr(selectedLocale, "selectedItemDelete")}
          value={itemDeleteShortcut}
          defaultValue="Delete"
          onChange={setItemDeleteShortcut}
          help={tr(selectedLocale, "selectedItemDeleteHelp")}
          locale={selectedLocale}
          allowBareKey
        />

        <ShortcutRecorder
          label={tr(selectedLocale, "ocrShortcut")}
          value={itemOcrShortcut}
          defaultValue="O"
          onChange={setItemOcrShortcut}
          help={tr(selectedLocale, "ocrShortcutHelp")}
          locale={selectedLocale}
          allowBareKey
        />

        <ShortcutRecorder
          label={tr(selectedLocale, "zoomShortcut")}
          value={itemZoomShortcut}
          defaultValue="Z"
          onChange={setItemZoomShortcut}
          help={tr(selectedLocale, "zoomShortcutHelp")}
          locale={selectedLocale}
          allowBareKey
        />
      </Section>

      <Section
        title={tr(selectedLocale, "translation")}
        description={tr(selectedLocale, "translationDesc")}
      >
        <Field label={tr(selectedLocale, "ecdictPath")} hint={tr(selectedLocale, "ecdictPathHelp")}>
          <InputWithAction
            value={ecdictPath}
            onChange={setEcdictPath}
            placeholder={tr(selectedLocale, "ecdictPathPlaceholder")}
            action={
              <button
                type="button"
                className={`h-9 w-9 ${iconButton}`}
                onClick={async () => {
                  const selected = await open({ directory: false, multiple: false });
                  if (selected && typeof selected === "string") setEcdictPath(selected);
                }}
                title={tr(selectedLocale, "chooseEcdictFile")}
                aria-label={tr(selectedLocale, "chooseEcdictFile")}
              >
                <Folder className="h-4 w-4" aria-hidden />
              </button>
            }
          />
        </Field>
      </Section>

      <Section
        title="WebDAV"
        description={tr(selectedLocale, "webdavDesc")}
        icon={<Cloud className="h-5 w-5 text-blue-600" aria-hidden />}
      >
        <CheckRow
          label={tr(selectedLocale, "enableWebdav")}
          checked={webdavSyncEnabled}
          onChange={setWebdavSyncEnabled}
        />

        <Field label={tr(selectedLocale, "webdavUrl")}>
          <input
            type="text"
            value={webdavUrl}
            onChange={(event) => setWebdavUrl(event.target.value)}
            placeholder={tr(selectedLocale, "webdavUrlPlaceholder")}
            className={input}
          />
        </Field>

        <Field label={tr(selectedLocale, "username")}>
          <input
            type="text"
            value={webdavUsername}
            onChange={(event) => setWebdavUsername(event.target.value)}
            className={input}
          />
        </Field>

        <Field label={tr(selectedLocale, "password")}>
          <input
            type="password"
            value={webdavPassword}
            onChange={(event) => setWebdavPassword(event.target.value)}
            placeholder={tr(selectedLocale, "webdavPasswordPlaceholder")}
            className={input}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => void handleVerifyWebdav()}
            disabled={webdavBusy || !webdavUrl.trim() || !webdavUsername.trim()}
          >
            {webdavBusy ? tr(selectedLocale, "checking") : tr(selectedLocale, "verifyWebdav")}
          </button>
          <button
            type="button"
            className={buttonPrimary}
            onClick={() => void handleSyncNow()}
            disabled={webdavBusy || !webdavSyncEnabled || !webdavUrl.trim() || !webdavUsername.trim()}
          >
            {webdavBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {webdavBusy ? tr(selectedLocale, "syncing") : tr(selectedLocale, "syncNow")}
          </button>
        </div>

        {webdavMessage && <Message>{webdavMessage}</Message>}
      </Section>

      <Section
        title={tr(selectedLocale, "apiTranslation")}
        description={tr(selectedLocale, "apiTranslationDesc")}
      >
        <CheckRow
          label={tr(selectedLocale, "enableApiTranslation")}
          checked={apiTranslateEnabled}
          onChange={setApiTranslateEnabled}
        />

        <Field label={tr(selectedLocale, "apiBaseUrl")}>
          <input
            type="text"
            value={apiTranslateBaseUrl}
            onChange={(event) => setApiTranslateBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
            className={input}
          />
        </Field>

        <Field label={tr(selectedLocale, "apiKey")}>
          <input
            type="password"
            value={apiTranslateKey}
            onChange={(event) => setApiTranslateKey(event.target.value)}
            placeholder={tr(selectedLocale, "apiKeyPlaceholder")}
            className={input}
          />
        </Field>

        <Field label={tr(selectedLocale, "apiModel")}>
          <input
            type="text"
            value={apiTranslateModel}
            onChange={(event) => setApiTranslateModel(event.target.value)}
            placeholder="gpt-4o-mini"
            className={input}
          />
        </Field>

        <Field label={tr(selectedLocale, "apiTargetLang")}>
          <input
            type="text"
            value={apiTranslateTargetLang}
            onChange={(event) => setApiTranslateTargetLang(event.target.value)}
            placeholder={tr(selectedLocale, "apiTargetLangPlaceholder")}
            className={input}
          />
        </Field>
      </Section>

      <Section
        title={tr(selectedLocale, "ocrSettings")}
        description={tr(selectedLocale, "ocrSettingsDesc")}
        icon={<ScanText className="h-5 w-5 text-blue-600" aria-hidden />}
      >
        <CheckRow
          label={tr(selectedLocale, "ocrEnable")}
          checked={ocrEnabled}
          onChange={setOcrEnabled}
        />

        <CheckRow
          label={tr(selectedLocale, "ocrAuto")}
          checked={ocrAuto}
          disabled={!ocrEnabled}
          onChange={setOcrAuto}
        />
        <p className="text-xs text-gray-500">{tr(selectedLocale, "ocrAutoDesc")}</p>

        <Field
          label={tr(selectedLocale, "ocrLanguage")}
          hint={
            ocrLanguages.length === 0
              ? tr(selectedLocale, "ocrNoLanguagePack")
              : `${tr(selectedLocale, "ocrInstalledLanguages")}: ${ocrLanguages
                  .map((entry) => entry.tag)
                  .join(", ")}`
          }
        >
          <select
            value={ocrLanguage}
            disabled={!ocrEnabled}
            onChange={(event) => setOcrLanguage(event.target.value)}
            className={select}
          >
            <option value="">{tr(selectedLocale, "ocrLanguageAuto")}</option>
            {ocrLanguages.map((entry) => (
              <option key={entry.tag} value={entry.tag}>
                {entry.name} ({entry.tag})
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title={tr(selectedLocale, "lanSync")}
        description={tr(selectedLocale, "lanSyncDesc")}
        icon={<Wifi className="h-5 w-5 text-blue-600" aria-hidden />}
      >
        <CheckRow
          label={tr(selectedLocale, "enableLanSync")}
          checked={lanSyncEnabled}
          onChange={setLanSyncEnabled}
        />

        <Field label={tr(selectedLocale, "lanSyncPairingCode")} hint={tr(selectedLocale, "lanSyncPairingCodeHelp")}>
          <InputWithAction
            value={lanSyncPairingCode}
            onChange={setLanSyncPairingCode}
            placeholder="AB12CD"
            action={
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => void handleGenerateLanPairingCode()}
              >
                {tr(selectedLocale, "lanSyncGenerateCode")}
              </button>
            }
          />
        </Field>

        <Field label={tr(selectedLocale, "lanSyncPort")}>
          <input
            type="number"
            min="0"
            max="65535"
            value={lanSyncPort}
            onChange={(event) => setLanSyncPort(parseInt(event.target.value, 10) || 0)}
            placeholder={tr(selectedLocale, "lanSyncPortPlaceholder")}
            className={input}
          />
        </Field>

        <button
          type="button"
          className={buttonPrimary}
          onClick={() => void handleLanSyncNow()}
          disabled={lanSyncBusy}
        >
          {lanSyncBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {lanSyncBusy ? tr(selectedLocale, "lanSyncSyncing") : tr(selectedLocale, "lanSyncSyncNow")}
        </button>

        {lanSyncListening && (
          <p className="text-xs text-gray-500">
            {tr(selectedLocale, "lanSyncListeningOn")} {lanSyncPort || "auto"}
          </p>
        )}

        <div className={`${surface} p-4`}>
          <p className="text-sm font-semibold text-gray-900">{tr(selectedLocale, "lanSyncPeers")}</p>
          {lanSyncPeers.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">{tr(selectedLocale, "lanSyncNoPeers")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {lanSyncPeers.map((peer) => (
                <li key={`${peer.host}:${peer.port}`} className="font-mono text-xs text-gray-600">
                  {peer.name} — {peer.addresses.join(", ")}:{peer.port}
                </li>
              ))}
            </ul>
          )}
        </div>

        {lanSyncMessage && <Message>{lanSyncMessage}</Message>}
      </Section>

      <div className="lg:col-span-2">
        <Section
          title={tr(selectedLocale, "privacy")}
          description={`${tr(selectedLocale, "privacyStatusPassword")}: ${
            privacyStatus.passwordSet ? tr(selectedLocale, "configured") : tr(selectedLocale, "notConfigured")
          } · ${tr(selectedLocale, "privacyStatusQuestion")}: ${
            privacyStatus.securityQuestionSet ? tr(selectedLocale, "configured") : tr(selectedLocale, "notConfigured")
          } · ${tr(selectedLocale, "privacyStatusPrivateItems")}: ${privacyStatus.privateItems}`}
          icon={<Shield className="h-5 w-5 text-blue-600" aria-hidden />}
        >
          {privacyStatus.passwordSet && (
            <Field label={tr(selectedLocale, "currentPassword")}>
              <input
                type="password"
                value={privacyCurrent}
                onChange={(event) => setPrivacyCurrent(event.target.value)}
                className={input}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr(selectedLocale, "newPassword")}>
              <input
                type="password"
                value={privacyNew}
                onChange={(event) => setPrivacyNew(event.target.value)}
                className={input}
              />
            </Field>

            <Field label={tr(selectedLocale, "confirmPassword")}>
              <input
                type="password"
                value={privacyConfirm}
                onChange={(event) => setPrivacyConfirm(event.target.value)}
                className={input}
              />
            </Field>

            <Field label={tr(selectedLocale, "securityQuestion")}>
              <input
                type="text"
                value={securityQuestion}
                onChange={(event) => setSecurityQuestion(event.target.value)}
                className={input}
              />
            </Field>

            <Field label={tr(selectedLocale, "securityAnswer")}>
              <input
                type="password"
                value={securityAnswer}
                onChange={(event) => setSecurityAnswer(event.target.value)}
                className={input}
              />
            </Field>
          </div>

          {privacyMessage && <Message>{privacyMessage}</Message>}
        </Section>
      </div>
    </div>
  );
});
