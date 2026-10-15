import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { tr, type Locale } from "../lib/i18n";
import type { Recommendation } from "../types";

interface Props {
  locale: Locale;
  /** Changes whenever the history changed, so suggestions stay fresh. */
  version: number;
  onCollapse: () => void;
  renderCard: (recommendation: Recommendation) => ReactNode;
}

export function RecommendationStrip({ locale, version, onCollapse, renderCard }: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);

    api
      .getRecommendations({ limit: 6 })
      .then((items) => {
        if (!cancelled) setRecommendations(items);
      })
      .catch((err) => {
        console.error("Recommendations failed:", err);
        if (!cancelled) setRecommendations([]);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <section className="eacptrans-recommend-strip">
      <div className="eacptrans-recommend-strip-head">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="eacptrans-recommend-strip-title">{tr(locale, "recommendedForYou")}</span>
        {recommendations.length > 0 && (
          <span className="eacptrans-recommend-strip-count">{recommendations.length}</span>
        )}
        {busy && <span className="eacptrans-recommend-strip-hint">{tr(locale, "recommendLoading")}</span>}
        <button
          className="eacptrans-recommend-strip-hide"
          onClick={onCollapse}
          title={tr(locale, "recommendHide")}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="eacptrans-recommend-strip-cards" id="recommend-scroll">
        {recommendations.length === 0 && !busy ? (
          <div className="eacptrans-recommend-strip-empty">{tr(locale, "recommendEmpty")}</div>
        ) : (
          recommendations.map((recommendation) => renderCard(recommendation))
        )}
      </div>
    </section>
  );
}
