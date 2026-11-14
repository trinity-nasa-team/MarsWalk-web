// Íconos de línea (24 px, trazo 1.6) — un solo sistema para el menú, las subpestañas y los paneles.
const S = ({ children, size = 22 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const ICONS = {
  home: (p) => (
    <S {...p}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </S>
  ),
  plan: (p) => (
    <S {...p}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </S>
  ),
  findings: (p) => (
    <S {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="m8 6 1.5-2h5L16 6" />
      <circle cx="12" cy="13" r="3.5" />
    </S>
  ),
  eva: (p) => (
    <S {...p}>
      <circle cx="12" cy="7" r="4" />
      <path d="M10 6.5h4" />
      <path d="M6 21v-4a6 6 0 0 1 12 0v4" />
      <path d="M9 21v-3M15 21v-3" />
    </S>
  ),
  compare: (p) => (
    <S {...p}>
      <path d="M4 20V4M4 20h16" />
      <path d="m7 15 4-5 3 3 5-6" />
    </S>
  ),
  habitat: (p) => (
    <S {...p}>
      <path d="M3 18a9 9 0 0 1 18 0Z" />
      <path d="M3 18h18M9 18v-3h6v3" />
    </S>
  ),
  hud: (p) => (
    <S {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M12 7v6M9.5 10.5 12 13l2.5-2.5" />
      <path d="M9 17h6" />
    </S>
  ),
  earth: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </S>
  ),
  radiation: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="1.8" />
      {[0, 120, 240].map((a) => (
        <path key={a} d="M12 3a9 9 0 0 1 7.8 4.5L14 10.6a2.4 2.4 0 0 0-2-1.2Z" transform={`rotate(${a} 12 12)`} />
      ))}
    </S>
  ),
  sun: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </S>
  ),
  battery: (p) => (
    <S {...p}>
      <rect x="2" y="7" width="18" height="10" rx="2" />
      <path d="M22 10v4M6 10v4M10 10v4" />
    </S>
  ),
  o2: (p) => (
    <S {...p}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </S>
  ),
  camera: (p) => (
    <S {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="m8 6 1.5-2h5L16 6" />
      <circle cx="12" cy="13" r="3.5" />
    </S>
  ),
  wind: (p) => (
    <S {...p}>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a3 3 0 1 1-3 3" />
      <path d="M3 16h7" />
    </S>
  ),
  devil: (p) => (
    <S {...p}>
      <path d="M4 4h16M6 8h12M8 12h8M9.5 16h5M11 20h2" />
    </S>
  ),
  alert: (p) => (
    <S {...p}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </S>
  ),
};

export function Icon({ name, size }) {
  const C = ICONS[name];
  return C ? <C size={size} /> : null;
}
