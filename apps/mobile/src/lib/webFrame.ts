// Web demo presentation constants.
//
// On wide web windows the app renders inside a phone-width frame so it reads
// as a mobile app to anyone who clicks the bare demo URL (portfolio/resume/
// GitHub). Native and narrow web keep the same full-bleed layout, so these
// only ever matter to the web build — and to the shared Sheet/Modal, which
// must size itself to the same frame to avoid spilling across the whole
// browser. Kept in one file so the frame and the sheets it contains can never
// drift apart.
export const WEB_FRAME_BREAKPOINT = 520;
export const WEB_FRAME_WIDTH = 420;
export const WEB_FRAME_RADIUS = 24;