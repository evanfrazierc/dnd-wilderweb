// Small hand-drawn line-icon set used throughout the app so every stat, nav
// entry, and building category reads consistently. Geometric and restrained
// on purpose — no illustrative clip-art.

const PATHS = {
  // --- Resources ---
  Wood: (
    <>
      <rect x="4.5" y="9" width="15" height="6" rx="2.6" />
      <ellipse cx="6.2" cy="12" rx="1.7" ry="2.9" />
      <ellipse cx="6.2" cy="12" rx="0.6" ry="1.1" />
    </>
  ),
  Food: (
    <>
      <path d="M12 20V6" />
      <path d="M12 8.5 8.4 5.4M12 8.5l3.6-3.1" />
      <path d="M12 12 8.4 8.9M12 12l3.6-3.1" />
      <path d="M12 15.5 8.9 12.8M12 15.5l3.1-2.7" />
    </>
  ),
  Stone: <path d="M12 3.5 18 8l-1 8.5H7L6 8Z" />,
  Iron: (
    <>
      <path d="M7.5 16 9 8h6l1.5 8Z" />
      <path d="M8.6 11.5h6.8" />
    </>
  ),
  Wealth: (
    <>
      <circle cx="12" cy="12" r="7.75" />
      <path d="M12 8.2v7.6M9.6 15v-1.15c0 .8.9 1.45 2.4 1.45s2.4-.6 2.4-1.5-.8-1.25-2.4-1.55c-1.6-.3-2.4-.7-2.4-1.55s.9-1.5 2.4-1.5 2.4.6 2.4 1.35" />
    </>
  ),
  Horses: (
    <path d="M7 10.2C7 6.8 9.2 4.2 12 4.2s5 2.6 5 6c0 2-.7 3.2-.7 5v4.6h-2.6v-4.1c0-.9-.7-1.6-1.7-1.6s-1.7.7-1.7 1.6v4.1H7.7v-4.6c0-1.8-.7-3-.7-5Z" />
  ),
  Weapons: (
    <>
      <path d="M4.5 19.5 15 9M13.4 6.5l4.1 4.1M15.9 4 20 8.1" />
      <path d="M19.5 4.5 9 15M10.6 17.5 6.5 13.4M8.1 15.9 4 11.8" />
    </>
  ),
  Tools: (
    <>
      <path d="M14.7 9.3 19 5a2.4 2.4 0 0 0-3-3l-4.3 4.3" />
      <path d="M11.7 6.3 5 13c-1.4 1.4-1.4 3 0 4S8 18.4 9.4 17L16 10.4" />
      <path d="M4.3 19.7l2-2" />
    </>
  ),
  Population: (
    <>
      <circle cx="9" cy="8.2" r="2.6" />
      <circle cx="16" cy="9.6" r="2.1" />
      <path d="M4 19c0-2.9 2.2-5.1 5-5.1s5 2.2 5 5.1" />
      <path d="M14.3 14.4c2.2.3 3.7 2.1 3.7 4.4" />
    </>
  ),
  Medicine: (
    <>
      <path d="M5 12.5c0 3.9 3.1 6.5 7 6.5s7-2.6 7-6.5" />
      <path d="M4 12.5h16" />
      <path d="M12 4v5.2M9.4 6.6h5.2" />
    </>
  ),
  Ships: (
    <>
      <path d="M4 15.5h16l-2.6 4.6a2 2 0 0 1-1.75 1H8.35a2 2 0 0 1-1.75-1Z" />
      <path d="M12 15.5V5M12 6l4.5 2.3-4.5 2.2" />
    </>
  ),
  Unrest: (
    <path d="M12 3.5c.4 2.4-1.6 3.4-1.6 5.6 0 1.1.7 1.8 1.6 1.8s1.6-.8 1.6-1.8c1.6 1.4 2.9 3.4 2.9 5.6 0 3.1-2.4 5.3-4.5 5.3s-4.5-2.2-4.5-5.3c0-3.4 2.6-5.1 4.5-11.2Z" />
  ),
  Diplomacy: (
    <>
      <path d="M3.5 12.5 7 9.2c.6-.6 1.6-.6 2.2.1l.5.5 3-3c.6-.6 1.6-.6 2.2 0l.5.5 1-1c.6-.6 1.6-.6 2.1 0l1.9 1.9-4 4-2.4-2.4" />
      <path d="M7 10l4.4 4.4c.6.6 1.6.6 2.2 0l.2-.2c.6-.6.6-1.6 0-2.2" />
      <path d="M9.6 12.6l1.4 1.4c.6.6.6 1.6 0 2.2l-.2.2c-.6.6-1.6.6-2.2 0" />
    </>
  ),
  Loyalty: (
    <>
      <path d="M12 3.3 18.5 5.6V11c0 4.6-2.9 7.7-6.5 9.1-3.6-1.4-6.5-4.5-6.5-9.1V5.6Z" />
      <path d="M12 3.3V20.1" />
    </>
  ),
  Piety: (
    <>
      <path d="M12 3c1.8 2 1.9 3.4.5 5.2 1.7.3 2.9 1.7 2.9 3.5 0 2.2-1.5 3.6-3.4 3.6s-3.4-1.4-3.4-3.6c0-1.8 1.2-3.1 2.8-3.5C9.9 6.6 10.2 5 12 3Z" />
      <path d="M12 15.3V21M8.7 21h6.6" />
    </>
  ),
  Dread: (
    <>
      <circle cx="12" cy="11" r="6.2" />
      <circle cx="9.6" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9.3 14.6c1.7 1 3.7 1 5.4 0" />
      <path d="M9 17.2v2M12 17.6v2.2M15 17.2v2" />
    </>
  ),
  Intrigue: (
    <>
      <path d="M2.5 12S6 6.3 12 6.3 21.5 12 21.5 12 18 17.7 12 17.7 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),

  // --- Navigation ---
  Atlas: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 5.4 13.6 12 12 18.6 10.4 12Z" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  Calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.8" />
      <path d="M3.5 9.8h17" />
      <path d="M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  Settlements: (
    <>
      <path d="M3.5 20V13l3.2-2.4L10 13v7" />
      <path d="M10 20V8.5L14.5 5l4.5 3.5V20" />
      <path d="M3.5 20h15" />
      <path d="M14.5 9.5v2.4M12.6 15h3.8" />
    </>
  ),
  History: (
    <>
      <path d="M6 4.5h10.5a2 2 0 0 1 2 2V21l-2.6-1.5L13.3 21l-2.6-1.5L8.1 21l-2.6-1.5L6 21Z" />
      <path d="M8.3 9h6.6M8.3 12.3h6.6M8.3 15.6h4" />
    </>
  ),
  Codex: (
    <>
      <path d="M12 6.2c-2-1.4-4.7-1.7-7-1V17c2.3-.7 5-.4 7 1 2-1.4 4.7-1.7 7-1V5.2c-2.3-.7-5-.4-7 1Z" />
      <path d="M12 6.2V18" />
    </>
  ),

  // --- Seasons ---
  Spring: (
    <>
      <path d="M12 20V11" />
      <path d="M12 13c0-3 -2.2-4.6-5-4.6C7.3 11.4 9.3 13.4 12 13Z" />
      <path d="M12 11c0-3 2.2-4.6 5-4.6C16.7 9.8 14.7 11.8 12 11Z" />
    </>
  ),
  Summer: (
    <>
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 3.3v2.4M12 18.3v2.4M20.7 12h-2.4M5.7 12H3.3M18 6l-1.7 1.7M7.7 16.3 6 18M18 18l-1.7-1.7M7.7 7.7 6 6" />
    </>
  ),
  Autumn: (
    <>
      <path d="M12 4c4.4 0 7 3.6 7 8.2S16.4 20 12 20s-7-3.6-7-7.8S7.6 4 12 4Z" />
      <path d="M12 4v16" />
    </>
  ),
  Winter: (
    <>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M12 3l-1.6 2M12 3l1.6 2M12 21l-1.6-2M12 21l1.6-2" />
    </>
  ),

  // --- Building categories ---
  "Main Settlement": (
    <>
      <path d="M4.5 20V11l7.5-5.5L19.5 11v9Z" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  Resources: (
    <>
      <path d="M4.5 19.5 12 12M9 7l7.5 7.5" />
      <path d="M14 5.3 18.7 10" />
      <path d="M6.6 17.4l2 2" />
    </>
  ),
  "Defense and Military": (
    <path d="M12 3.3 18.5 5.6V11c0 4.6-2.9 7.7-6.5 9.1-3.6-1.4-6.5-4.5-6.5-9.1V5.6Z" />
  ),

  // --- Misc ---
  ArrowUp: <path d="M6 15 12 9l6 6" />,
  ArrowDown: <path d="M6 9 12 15l6-6" />,
  MapPin: (
    <>
      <path d="M12 21s7-7.4 7-12.4A7 7 0 0 0 5 8.6C5 13.6 12 21 12 21Z" />
      <circle cx="12" cy="8.6" r="2.3" />
    </>
  ),
  Sparkle: (
    <path d="M12 3.5c.4 2.9 1.4 4.9 4.5 5.3-3.1.4-4.1 2.4-4.5 5.3-.4-2.9-1.4-4.9-4.5-5.3 3.1-.4 4.1-2.4 4.5-5.3Z" />
  ),
  Scroll: (
    <>
      <path d="M6.5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 1-2 2h-11" />
      <circle cx="6" cy="6" r="1.6" />
      <circle cx="6" cy="18" r="1.6" />
      <path d="M9 9.3h6.5M9 12.3h6.5M9 15.3h4" />
    </>
  ),
  Plus: <path d="M12 5.5v13M5.5 12h13" />,
  Trash: (
    <>
      <path d="M5.5 7h13M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    </>
  ),

  // --- Deity alignment ---
  AlignGood: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 4.6v2M12 17.4v2M19.4 12h-2M6.6 12h-2M17.2 6.8l-1.4 1.4M8.2 15.8l-1.4 1.4M17.2 17.2l-1.4-1.4M8.2 8.2 6.8 6.8" />
    </>
  ),
  AlignEvil: (
    <>
      <circle cx="12" cy="10.3" r="5.3" />
      <circle cx="9.8" cy="9.9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="9.9" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 19l1-3.5M12 19.6v-4M15 19l-1-3.5" />
    </>
  ),
  AlignNeutral: (
    <>
      <path d="M12 3.5v15.8M8.4 19.3h7.2" />
      <path d="M5 8.2h5.2M13.8 8.2H19" />
      <path d="M5 8.2 3 12.4a2.4 2.4 0 0 0 4.4 0ZM19 8.2 17 12.4a2.4 2.4 0 0 0 4.4 0Z" />
    </>
  ),
  AlignUnknown: (
    <>
      <circle cx="12" cy="12" r="8.4" strokeDasharray="2.6 2.8" />
      <path d="M9.8 9.6a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1.9-1.1 1.7" />
      <circle cx="12" cy="16.6" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
};

function resolve(name) {
  if (PATHS[name]) return PATHS[name];
  if (name?.endsWith("s") && PATHS[name.slice(0, -1)]) return PATHS[name.slice(0, -1)];
  if (name && PATHS[`${name}s`]) return PATHS[`${name}s`];
  return null;
}

export default function Icon({ name, size = 18, className = "", ...rest }) {
  const content = resolve(name) || <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {content}
    </svg>
  );
}
