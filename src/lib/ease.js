// Curvas de las referencias como funciones (para MapLibre y three.js, que no leen CSS).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (sx(mid) < x) lo = mid;
      else hi = mid;
    }
    return sy((lo + hi) / 2);
  };
}

export const easePan = bezier(0.4, 0, 0.2, 1); // [CoM] paneo .6s
export const easeView = bezier(0.77, 0, 0.175, 1); // [CoM] cambio de vista
export const easeEnter = bezier(0.25, 1, 0.5, 1); // [ETH] entrada 1s
