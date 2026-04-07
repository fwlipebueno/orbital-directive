import type { StationState } from "@orbital/shared";
import { useI18n } from "../i18n/i18n-provider";
import { severityLabel } from "../lib/game-labels";
import { cn } from "../lib/cn";

const map: Record<StationState["runSummary"]["severity"], string> = {
  normal: "status-normal",
  attention: "status-attention",
  alert: "status-alert",
  crisis: "status-crisis"
};

export function SeverityBadge({ severity }: { severity: StationState["runSummary"]["severity"] }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
        "border-current/40",
        map[severity]
      )}
    >
      {severityLabel(t, severity)}
    </span>
  );
}
