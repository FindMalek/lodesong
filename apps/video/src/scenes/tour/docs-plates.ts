import { staticFile } from "remotion";

const p0 = staticFile("docs/a11y-radio.png");
const p2 = staticFile("docs/album-lyrics.png");
const p1 = staticFile("docs/album-lyrics-light.png");
const p3 = staticFile("docs/albums.png");
const p4 = staticFile("docs/folder-dither.png");
const p5 = staticFile("docs/follow-sync.png");
const p6 = staticFile("docs/following-page.png");
const p7 = staticFile("docs/genres-inferred.png");
const p8 = staticFile("docs/history-fr.png");
const p9 = staticFile("docs/home.png");
const p10 = staticFile("docs/import-ai-metadata.png");
const p11 = staticFile("docs/language-setting.png");
const p12 = staticFile("docs/login.png");
const p13 = staticFile("docs/macos/compact.png");
const p14 = staticFile("docs/macos/open.png");
const p15 = staticFile("docs/macos/peek.png");
const p16 = staticFile("docs/mix-covers-dither.png");
const p17 = staticFile("docs/new-from-follows.png");
const p18 = staticFile("docs/og-dither.png");
const p19 = staticFile("docs/og-share-menu.png");
const p20 = staticFile("docs/og-song.jpg");
const p26 = staticFile("docs/phone.png");
const p22 = staticFile("docs/phone-albums-filters.png");
const p21 = staticFile("docs/phone-albums-filters-open.png");
const p23 = staticFile("docs/phone-artists-strip.png");
const p24 = staticFile("docs/phone-light.png");
const p25 = staticFile("docs/phone-lyrics-coverage.png");
const p27 = staticFile("docs/playlist-folder-edit.png");
const p28 = staticFile("docs/playlist-folder-move.png");
const p29 = staticFile("docs/playlist-folders.png");
const p30 = staticFile("docs/public-demo.png");
const p31 = staticFile("docs/queue.png");
const p32 = staticFile("docs/radio.png");
const p33 = staticFile("docs/scrobbling-setting.png");
const p36 = staticFile("docs/search.png");
const p34 = staticFile("docs/search-mood-fit.png");
const p35 = staticFile("docs/search-vibe.png");
const p37 = staticFile("docs/sidebar-resize.png");
const p39 = staticFile("docs/stats.png");
const p38 = staticFile("docs/stats-desktop-light.png");

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
