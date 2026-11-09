import p0 from "../../../../../docs/a11y-radio.png";
import p2 from "../../../../../docs/album-lyrics.png";
import p1 from "../../../../../docs/album-lyrics-light.png";
import p3 from "../../../../../docs/albums.png";
import p4 from "../../../../../docs/folder-dither.png";
import p5 from "../../../../../docs/follow-sync.png";
import p6 from "../../../../../docs/following-page.png";
import p7 from "../../../../../docs/genres-inferred.png";
import p8 from "../../../../../docs/history-fr.png";
import p9 from "../../../../../docs/home.png";
import p10 from "../../../../../docs/import-ai-metadata.png";
import p11 from "../../../../../docs/language-setting.png";
import p12 from "../../../../../docs/login.png";
import p13 from "../../../../../docs/macos/compact.png";
import p14 from "../../../../../docs/macos/open.png";
import p15 from "../../../../../docs/macos/peek.png";
import p16 from "../../../../../docs/mix-covers-dither.png";
import p17 from "../../../../../docs/new-from-follows.png";
import p18 from "../../../../../docs/og-dither.png";
import p19 from "../../../../../docs/og-share-menu.png";
import p20 from "../../../../../docs/og-song.jpg";
import p26 from "../../../../../docs/phone.png";
import p22 from "../../../../../docs/phone-albums-filters.png";
import p21 from "../../../../../docs/phone-albums-filters-open.png";
import p23 from "../../../../../docs/phone-artists-strip.png";
import p24 from "../../../../../docs/phone-light.png";
import p25 from "../../../../../docs/phone-lyrics-coverage.png";
import p27 from "../../../../../docs/playlist-folder-edit.png";
import p28 from "../../../../../docs/playlist-folder-move.png";
import p29 from "../../../../../docs/playlist-folders.png";
import p30 from "../../../../../docs/public-demo.png";
import p31 from "../../../../../docs/queue.png";
import p32 from "../../../../../docs/radio.png";
import p33 from "../../../../../docs/scrobbling-setting.png";
import p36 from "../../../../../docs/search.png";
import p34 from "../../../../../docs/search-mood-fit.png";
import p35 from "../../../../../docs/search-vibe.png";
import p37 from "../../../../../docs/sidebar-resize.png";
import p39 from "../../../../../docs/stats.png";
import p38 from "../../../../../docs/stats-desktop-light.png";

export interface DocPlate {
  src: string;
  w: number;
  h: number;
}

/** Real screenshots and assets already committed under docs/, keyed by their path there. */
export const DOC_PLATES: Record<string, DocPlate> = {
  "a11y-radio.png": { src: p0, w: 1440, h: 900 },
  "album-lyrics-light.png": { src: p1, w: 2880, h: 1800 },
  "album-lyrics.png": { src: p2, w: 2880, h: 1800 },
  "albums.png": { src: p3, w: 2880, h: 1800 },
  "folder-dither.png": { src: p4, w: 1100, h: 640 },
  "follow-sync.png": { src: p5, w: 1440, h: 900 },
  "following-page.png": { src: p6, w: 1440, h: 900 },
  "genres-inferred.png": { src: p7, w: 1440, h: 900 },
  "history-fr.png": { src: p8, w: 1440, h: 900 },
  "home.png": { src: p9, w: 2880, h: 1800 },
  "import-ai-metadata.png": { src: p10, w: 1440, h: 900 },
  "language-setting.png": { src: p11, w: 768, h: 640 },
  "login.png": { src: p12, w: 2880, h: 1800 },
  "macos/compact.png": { src: p13, w: 1280, h: 140 },
  "macos/open.png": { src: p14, w: 1280, h: 520 },
  "macos/peek.png": { src: p15, w: 1280, h: 380 },
  "mix-covers-dither.png": { src: p16, w: 960, h: 219 },
  "new-from-follows.png": { src: p17, w: 1440, h: 420 },
  "og-dither.png": { src: p18, w: 1200, h: 630 },
  "og-share-menu.png": { src: p19, w: 1280, h: 720 },
  "og-song.jpg": { src: p20, w: 1200, h: 630 },
  "phone-albums-filters-open.png": { src: p21, w: 390, h: 700 },
  "phone-albums-filters.png": { src: p22, w: 390, h: 700 },
  "phone-artists-strip.png": { src: p23, w: 390, h: 700 },
  "phone-light.png": { src: p24, w: 1170, h: 2532 },
  "phone-lyrics-coverage.png": { src: p25, w: 390, h: 700 },
  "phone.png": { src: p26, w: 1170, h: 2532 },
  "playlist-folder-edit.png": { src: p27, w: 1440, h: 900 },
  "playlist-folder-move.png": { src: p28, w: 1440, h: 900 },
  "playlist-folders.png": { src: p29, w: 1440, h: 900 },
  "public-demo.png": { src: p30, w: 1280, h: 720 },
  "queue.png": { src: p31, w: 2880, h: 1800 },
  "radio.png": { src: p32, w: 2880, h: 1620 },
  "scrobbling-setting.png": { src: p33, w: 768, h: 640 },
  "search-mood-fit.png": { src: p34, w: 680, h: 512 },
  "search-vibe.png": { src: p35, w: 680, h: 512 },
  "search.png": { src: p36, w: 2880, h: 1800 },
  "sidebar-resize.png": { src: p37, w: 1280, h: 760 },
  "stats-desktop-light.png": { src: p38, w: 1100, h: 900 },
  "stats.png": { src: p39, w: 2880, h: 1800 },
};
