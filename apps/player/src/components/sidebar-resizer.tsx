import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { setSetting, useSetting } from "@/lib/settings";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  shouldCollapseSidebar,
  sidebarCss,
  sidebarKeyWidth,
  visibleSidebarWidth,
} from "@/lib/sidebar-width";

interface Drag {
  wrapper: HTMLElement | null;
  stored: string;
  startX: number;
  startWidth: number;
  raw: number;
  zoom: number;
}

const currentZoom = (): number => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 1;
const show = (drag: Drag, css: string) => drag.wrapper?.style.setProperty("--sidebar-width", css);

export function SidebarResizer() {
  const { setOpen, state, isMobile } = useSidebar();
  const dragging = useRef<Drag | null>(null);
  const width = clampSidebarWidth(useSetting("sidebarWidth"));
  const hidden = isMobile || state === "collapsed";

  const cancel = () => {
    const drag = dragging.current;
    dragging.current = null;
    if (drag) show(drag, drag.stored);
  };

  // The handle is gone by then, so no pointerup or cancel will come to undo the live width.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cancel only reads a ref
  useEffect(() => {
    if (hidden) cancel();
  }, [hidden]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (!drag) return;
    drag.raw = drag.startWidth + (event.clientX - drag.startX) / drag.zoom;
    show(drag, sidebarCss(clampSidebarWidth(drag.raw)));
  };

  const end = () => {
    const drag = dragging.current;
    if (!drag) return;
    if (shouldCollapseSidebar(drag.raw)) {
      cancel();
      setOpen(false);
      return;
    }
    dragging.current = null;
    setSetting("sidebarWidth", clampSidebarWidth(drag.raw));
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = sidebarKeyWidth(event.key, visibleSidebarWidth(width, window.innerWidth, currentZoom()), event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    setSetting("sidebarWidth", next);
  };

  if (hidden) return null;

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
        const zoom = currentZoom();
        const startWidth = visibleSidebarWidth(width, window.innerWidth, zoom);
        dragging.current = {
          wrapper: event.currentTarget.closest<HTMLElement>("[data-slot=sidebar-wrapper]"),
          stored: sidebarCss(width),
          startX: event.clientX,
          startWidth,
          raw: startWidth,
          zoom,
        };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      onDoubleClick={() => setSetting("sidebarWidth", SIDEBAR_DEFAULT)}
      onKeyDown={keys}
    />
  );
}
