import type { FitReason } from "@lodesong/shared/vibe-fit";
import { useT } from "@/lib/i18n";

export function FitWhy({ reasons }: { reasons: FitReason[] }) {
  const t = useT();
  return reasons.map((reason) => t(`fit.${reason}`)).join(", ");
}
