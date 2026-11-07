import type { FitReason } from "@lodesong/shared/vibe-fit";
import { useT } from "@/lib/i18n";
import { fitWords } from "@/lib/vibe-playlists";

export function FitWhy({ reasons }: { reasons: FitReason[] }) {
  return fitWords(reasons, useT());
}
