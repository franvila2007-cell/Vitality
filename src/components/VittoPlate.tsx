// Vitto in a different pose from the avatar used on the chat card: same
// teal blob, big sparkly eyes and white lab coat, but here he's presenting a
// plate (with a raised, curious brow) instead of holding up the Vitality "V".
// Drawn as SVG so it stays crisp at any size; deliberately static — the
// avatar's looping bob was already judged too busy elsewhere on the page.
export default function VittoPlate({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 132 120" width={size} height={(size * 120) / 132} className={className} role="img" aria-label="Vitto presenting a plate of food">
      <defs>
        <radialGradient id="vp-body" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#8ff0df" />
          <stop offset="55%" stopColor="#3fc9bd" />
          <stop offset="100%" stopColor="#14938f" />
        </radialGradient>
        <linearGradient id="vp-arm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ed3c5" />
          <stop offset="100%" stopColor="#1ba39d" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="54" cy="112" rx="30" ry="4.5" fill="#0b5f5e" opacity="0.14" />

      {/* sparkles */}
      <path d="M14 22 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8z" fill="#9be8ef" />
      <path d="M30 8 l1.1 2.8 2.8 1.1 -2.8 1.1 -1.1 2.8 -1.1 -2.8 -2.8 -1.1 2.8 -1.1z" fill="#c4f4f1" />

      {/* body (slight head-tilt) */}
      <g transform="rotate(-5 54 64)">
        <ellipse cx="54" cy="62" rx="35" ry="38" fill="url(#vp-body)" />
        <ellipse cx="40" cy="38" rx="13" ry="7" fill="#ffffff" opacity="0.28" transform="rotate(-25 40 38)" />

        {/* lab coat */}
        <path d="M24 74 Q19 98 40 104 L48 82 Q40 80 32 70 Z" fill="#ffffff" stroke="#cfe5e3" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M84 74 Q89 98 68 104 L60 82 Q68 80 76 70 Z" fill="#ffffff" stroke="#cfe5e3" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M41 90 l-3 -6 M67 90 l3 -6" stroke="#cfe5e3" strokeWidth="1.5" strokeLinecap="round" />

        {/* eyes — one brow up: considering the plate */}
        <circle cx="40" cy="55" r="9.5" fill="#ffffff" />
        <circle cx="68" cy="55" r="9.5" fill="#ffffff" />
        <circle cx="42" cy="56" r="6" fill="#1c9a99" />
        <circle cx="70" cy="56" r="6" fill="#1c9a99" />
        <circle cx="42.5" cy="56.5" r="3.2" fill="#07393a" />
        <circle cx="70.5" cy="56.5" r="3.2" fill="#07393a" />
        <circle cx="44" cy="54" r="1.9" fill="#ffffff" />
        <circle cx="72" cy="54" r="1.9" fill="#ffffff" />
        <path d="M31 42 Q40 37 49 41" fill="none" stroke="#0b5f5e" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M59 38 Q68 32 77 38" fill="none" stroke="#0b5f5e" strokeWidth="2.2" strokeLinecap="round" />

        {/* cheeks + smile */}
        <ellipse cx="30" cy="68" rx="5.5" ry="3.4" fill="#7fe0ea" opacity="0.65" />
        <ellipse cx="78" cy="68" rx="5.5" ry="3.4" fill="#7fe0ea" opacity="0.65" />
        <path d="M47 70 Q54 77 61 70" fill="none" stroke="#0b5f5e" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* presenting arm → plate */}
      <path d="M84 78 Q100 76 105 60" fill="none" stroke="url(#vp-arm)" strokeWidth="10" strokeLinecap="round" />
      <circle cx="105" cy="58" r="6.2" fill="#2fbfb2" />

      {/* plate with a little meal: steak, egg, broccoli */}
      <ellipse cx="105" cy="53" rx="22" ry="5.2" fill="#ffffff" stroke="#cfe5e3" strokeWidth="1.5" />
      <ellipse cx="105" cy="52" rx="15.5" ry="3.4" fill="#f1f7f6" />
      <path d="M91 49 Q93 41 101 42 Q108 43 107 49 Q101 52 91 49Z" fill="#b5532f" />
      <path d="M95 45 q4 -2 8 0" fill="none" stroke="#7c3419" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="114" cy="47.5" rx="6.5" ry="3.6" fill="#ffffff" stroke="#e3ecea" strokeWidth="1" />
      <circle cx="114" cy="47.2" r="2.4" fill="#ffc23d" />
      <circle cx="108" cy="43" r="3.2" fill="#4caf50" />
      <circle cx="111" cy="41.4" r="2.6" fill="#43a047" />
      <circle cx="106" cy="41.4" r="2.4" fill="#66bb6a" />
      <rect x="108" y="43.5" width="2.2" height="4" rx="1" fill="#7cb342" />

      {/* steam */}
      <path d="M99 36 q-2.5 -4 0 -7 q2.5 -3 0 -6" fill="none" stroke="#b9e6e2" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <path d="M110 34 q-2.5 -4 0 -7 q2.5 -3 0 -6" fill="none" stroke="#b9e6e2" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
