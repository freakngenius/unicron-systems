// Map projection helper — converts (lon, lat) to SVG-space coordinates inside the
// 0-900 × 0-540 viewBox used by the prototype's HiFiMap component.
//
// Calibrated against the 5 prototype branch anchors so PHX/HOU/ATL/CHI/SEA land
// in roughly the same pixel positions as the hand-placed prototype:
//   PHX  lat=33.45  lon=-112.07  → (240, 360)
//   HOU  lat=29.76  lon=-95.36   → (470, 410)
//   ATL  lat=33.75  lon=-84.39   → (660, 360)
//   CHI  lat=41.88  lon=-87.63   → (580, 250)
//   SEA  lat=47.61  lon=-122.33  → (200, 160)
//
// Per the build brief: "It doesn't need to be cartographically accurate — it needs
// to look right." So we use a simple linear interpolation:
//   lon range [-125, -75] → x range [100, 760]
//   lat range [25, 50]    → y range [480, 80]   (inverted because SVG y flips)

export const SVG_VIEWBOX = { width: 900, height: 540 } as const;

const LON_MIN = -125;
const LON_MAX = -75;
const LAT_MIN = 25;
const LAT_MAX = 50;

const X_MIN = 100;
const X_MAX = 760;
const Y_MIN = 80;   // top of map (high latitude)
const Y_MAX = 480;  // bottom of map (low latitude)

export function lonLatToSvg(lon: number, lat: number): { x: number; y: number } {
  const lonT = (lon - LON_MIN) / (LON_MAX - LON_MIN);
  const latT = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
  const x = X_MIN + lonT * (X_MAX - X_MIN);
  // SVG y grows downward; high latitude → low y.
  const y = Y_MAX - latT * (Y_MAX - Y_MIN);
  return { x, y };
}

// Convert SVG-space coords to absolute container pixels, honoring the same viewBox
// math the Map component uses. zoom = 1 reproduces the original full-extent behavior;
// higher zoom + a (centerX, centerY) reproduces the shrunk, centered viewBox so the
// anchored card stays glued to the pin as the map zooms.
//
// preserveAspectRatio="xMidYMid slice" means the SVG covers the container with
// overflow cropped on the larger axis.
export function svgToPx(
  sx: number,
  sy: number,
  containerW: number,
  containerH: number,
  opts: { zoom?: number; centerX?: number; centerY?: number } = {},
): { x: number; y: number } {
  const vbFullW = SVG_VIEWBOX.width;
  const vbFullH = SVG_VIEWBOX.height;
  const z = Math.max(1, opts.zoom ?? 1);
  const cx = opts.centerX ?? vbFullW / 2;
  const cy = opts.centerY ?? vbFullH / 2;
  const w = vbFullW / z;
  const h = vbFullH / z;
  // Same clamp as Map.tsx so the viewBox never pans past the edges.
  const x = Math.max(0, Math.min(vbFullW - w, cx - w / 2));
  const y = Math.max(0, Math.min(vbFullH - h, cy - h / 2));
  const scale = Math.max(containerW / w, containerH / h);
  const sw = w * scale;
  const sh = h * scale;
  const offsetX = (containerW - sw) / 2;
  const offsetY = (containerH - sh) / 2;
  return { x: offsetX + (sx - x) * scale, y: offsetY + (sy - y) * scale };
}
