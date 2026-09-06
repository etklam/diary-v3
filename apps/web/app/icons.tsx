import type { SVGProps } from 'react'

// Single icon family for the whole app: 24px grid, 1.7 stroke, currentColor.
// Icons are decorative; accessible names come from the surrounding text.
const paths = {
  home: <path d="M4 11.2 12 4.5l8 6.7M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8M10 20v-5.4h4V20" />,
  timeline: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4V12l3 2.2" /></>,
  clipboard: <><rect x="5.5" y="4.5" width="13" height="16" rx="1.6" /><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1M8.8 10h6.4M8.8 13.6h6.4M8.8 17.2h4" /></>,
  users: <><circle cx="9" cy="8.4" r="3.2" /><path d="M3.4 19.4c.7-3 2.9-4.8 5.6-4.8s4.9 1.8 5.6 4.8M15.4 5.6a3.2 3.2 0 0 1 0 5.7M17.6 14.9c1.6.7 2.7 2.2 3.1 4.2" /></>,
  shield: <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3Z" />,
  bell: <><path d="M12 4a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.4 5.8-2.2 6.6h15.2c-.8-.8-2.2-2.4-2.2-6.6A5.4 5.4 0 0 0 12 4Z" /><path d="M10 19.2a2.1 2.1 0 0 0 4 0" /></>,
  check: <><circle cx="12" cy="12" r="8.2" /><path d="m8.4 12.2 2.4 2.4 4.8-5" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="1.6" /><path d="M4 10h16M8.4 3.4v3.4M15.6 3.4v3.4" /></>,
  book: <path d="M4.5 6.2A2.2 2.2 0 0 1 6.7 4h12.8v14.6H6.9a2.4 2.4 0 0 0-2.4 2.4V6.2ZM4.5 6.2v14.8M19.5 18.6V21H6.9" />,
  pen: <path d="M14.2 5.4 18.6 9.8 8.4 20H4v-4.4L14.2 5.4ZM12.4 7.2l4.4 4.4" />,
  zap: <path d="M13 3 5.4 13.2h5L10.6 21l7.9-10.6h-5.2L13 3Z" />,
  briefcase: <><rect x="3.6" y="7.4" width="16.8" height="12.4" rx="1.6" /><path d="M9 7.4V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.6M3.6 12.4h16.8" /></>,
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z" />,
  chart: <path d="M4 4v15.4a.6.6 0 0 0 .6.6H20M8.4 16v-5.2M12.4 16V7.6M16.4 16v-3.4" />,
  layers: <path d="m12 3.6 8.4 4.6L12 12.8 3.6 8.2 12 3.6ZM4.6 12.4 12 16.5l7.4-4.1M4.6 16.4 12 20.5l7.4-4.1" />,
  wrench: <path d="M14.9 6.3a4.2 4.2 0 0 0-5.6 5.2L4 16.8a1.9 1.9 0 0 0 2.7 2.7l5.3-5.3a4.2 4.2 0 0 0 5.2-5.6l-2.7 2.7-2.3-2.3 2.7-2.7Z" />,
  refresh: <><path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2M19.6 3.8v3.6H16" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 8h14M12 4 5 8l-2.4 5.6a4 4 0 0 0 4.8 0L5 8M19 8l-2.4 5.6a4 4 0 0 0 4.8 0L19 8" /></>,
  calendarRange: <><rect x="4" y="5.5" width="16" height="15" rx="1.6" /><path d="M4 10h16M8.4 3.4v3.4M15.6 3.4v3.4M8.4 14h7.2" /></>,
  fileText: <><path d="M6.4 3.6h7.2L18.6 8.8v10.2a1.4 1.4 0 0 1-1.4 1.4H6.4a1.4 1.4 0 0 1-1.4-1.4V5a1.4 1.4 0 0 1 1.4-1.4Z" /><path d="M13.4 3.8v5.2h5M8.6 13h6.8M8.6 16.4h6.8" /></>,
  flame: <path d="M12 3.4s5.6 4.2 5.6 9.4a5.6 5.6 0 0 1-11.2 0c0-2 1-3.9 2.2-5.4.3 1.2 1 2.3 2 2.8-.2-2.6.4-5.2 1.4-6.8Z" />,
  target: <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="0.8" /></>,
  settings: <><circle cx="12" cy="12" r="2.8" /><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" /></>,
  lock: <><rect x="5.4" y="10.4" width="13.2" height="9.6" rx="1.6" /><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6M12 14v2.6" /></>,
  compass: <><circle cx="12" cy="12" r="8.2" /><path d="m15.4 8.6-1.8 5-5 1.8 1.8-5 5-1.8Z" /></>,
  chevronDown: <path d="m6.5 9.3 5.5 5.4 5.5-5.4" />,
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{paths[name]}</svg>
}

/**
 * "Trade basic" monogram: white geometric T/b on the action-colour tile.
 * The same geometry feeds favicon.svg and the PWA icons in public/, so the
 * brand stays identical across app, tab and installed-app surfaces.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brand-mark">
    <rect x="1.5" y="1.5" width="29" height="29" rx="8" className="brand-mark-tile" />
    <path d="M6 7.6h11.6v3.5h-4v13.3H10V11.1H6Z" className="brand-mark-letter" />
    <path d="M17.4 9H21v15.4h-3.6Z" className="brand-mark-letter" />
    <path fillRule="evenodd" clipRule="evenodd" d="M21.7 15.4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z" className="brand-mark-letter" />
  </svg>
}
