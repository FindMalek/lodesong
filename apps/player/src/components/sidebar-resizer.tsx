import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { setSetting, useSetting } from "@/lib/settings";
import { clampSidebarWidth, SIDEBAR_COLLAPSE_BELOW, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, sidebarKeyWidth } from "@/lib/sidebar-width";

interface Drag {
  startX: number;
  startWidth: number;
  raw: number;
  zoom: number;
}

const wrapperOf = (target: EventTarget): HTMLElement | null => (target as HTMLElement).closest("[data-slot=sidebar-wrapper]");
const show = (target: EventTarget, width: number) => wrapperOf(target)?.style.setProperty("--sidebar-width", `${width}px`);

export function SidebarResizer() {
  const { setOpen, state, isMobile } = useSidebar();
  const dragging = useRef<Drag | null>(null);
  const width = clampSidebarWidth(useSetting("sidebarWidth"));

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current.raw = dragging.current.startWidth + (event.clientX - dragging.current.startX) / dragging.current.zoom;
    show(event.currentTarget, clampSidebarWidth(dragging.current.raw));
  };

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const { raw } = dragging.current;
    dragging.current = null;
    if (raw < SIDEBAR_COLLAPSE_BELOW) {
      show(event.currentTarget, width);
      setOpen(false);
      return;
    }
    setSetting("sidebarWidth", clampSidebarWidth(raw));
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = sidebarKeyWidth(event.key, width, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    setSetting("sidebarWidth", next);
  };

  if (isMobile || state === "collapsed") return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a window splitter is a focusable separator, <hr> cannot take focus or a value
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      data-slot="sidebar-resizer"
      className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:w-0.5 hover:after:bg-sidebar-ring focus-visible:after:w-0.5 focus-visible:after:bg-sidebar-ring focus-visible:outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const zoom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 1;
        dragging.current = { startX: event.clientX, startWidth: width, raw: width, zoom };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setSetting("sidebarWidth", SIDEBAR_DEFAULT)}
      onKeyDown={keys}
    />
  );
}
