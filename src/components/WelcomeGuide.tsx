import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clipboard, Download, Eye, Globe, Languages, ScanText, X } from "lucide-react";
import { tr, type I18nKey, type Locale } from "../lib/i18n";
import { buttonPrimary, focusRing, modalPanel, overlay } from "./ui";

interface Props {
  locale: Locale;
  onClose: () => void;
}

interface Step {
  icon: React.ReactNode;
  titleKey: I18nKey;
  descKey: I18nKey;
}

const steps: Step[] = [
  {
    icon: <Clipboard className="h-8 w-8" />,
    titleKey: "welcomeStep1Title",
    descKey: "welcomeStep1Desc",
  },
  {
    icon: <Eye className="h-8 w-8" />,
    titleKey: "welcomeStep2Title",
    descKey: "welcomeStep2Desc",
  },
  {
    icon: <ScanText className="h-8 w-8" />,
    titleKey: "welcomeStep3Title",
    descKey: "welcomeStep3Desc",
  },
  {
    icon: <Languages className="h-8 w-8" />,
    titleKey: "welcomeStep4Title",
    descKey: "welcomeStep4Desc",
  },
  {
    icon: <Download className="h-8 w-8" />,
    titleKey: "welcomeStep5Title",
    descKey: "welcomeStep5Desc",
  },
];

export function WelcomeGuide({ locale, onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === steps.length - 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        if (isLastStep) {
          onClose();
        } else {
          setCurrentStep((s) => s + 1);
        }
      } else if (event.key === "ArrowLeft") {
        setCurrentStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLastStep, onClose]);

  const step = steps[currentStep];

  return createPortal(
    <div
      className={overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${modalPanel} flex max-h-[calc(100vh-32px)] w-full max-w-2xl flex-col`}>
        <header className="flex items-center gap-3 border-b border-gray-200 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Globe className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-lg font-semibold tracking-tight text-gray-900">
            {tr(locale, "welcomeTitle")}
          </h2>
          <button
            type="button"
            className={`h-8 w-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 ${focusRing}`}
            onClick={onClose}
            aria-label={tr(locale, "close")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600">
            {step.icon}
          </div>

          <div className="space-y-3 text-center">
            <h3 className="text-xl font-semibold tracking-tight text-gray-900">
              {tr(locale, step.titleKey)}
            </h3>
            <p className="max-w-md text-sm leading-relaxed text-gray-600">
              {tr(locale, step.descKey)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-all ${
                  index === currentStep ? "w-8 bg-blue-600" : "bg-gray-300"
                }`}
              />
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-gray-200 p-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            {tr(locale, "welcomeSkip")}
          </button>

          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setCurrentStep((s) => s - 1)}
              >
                {tr(locale, "welcomePrev")}
              </button>
            )}

            <button
              type="button"
              className={`${buttonPrimary} flex items-center gap-2 px-6 py-2`}
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  setCurrentStep((s) => s + 1);
                }
              }}
            >
              {isLastStep ? (
                <>
                  <Check className="h-4 w-4" />
                  {tr(locale, "welcomeStart")}
                </>
              ) : (
                tr(locale, "welcomeNext")
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
