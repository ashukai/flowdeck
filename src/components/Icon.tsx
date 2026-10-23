import Svg, { Path } from 'react-native-svg'
import { C } from '@/theme'

// A small line-icon set on a 24×24 grid, 2px round strokes — one consistent
// weight everywhere instead of mixed text glyphs and emoji.
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  restart: 'M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  copy: 'M10 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1',
  step: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 9h8M8 13h5',
  diamond: 'M12 3l9 9-9 9-9-9z',
  small: 'M5 9h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z',
  note: 'M5 4h14v10l-6 6H5zM13 20v-6h6',
  tidy: 'M9 3h6v4H9zM12 7v4M6 11h12M6 11v3M18 11v3M3 14h6v4H3zM15 14h6v4h-6z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  page: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  palette: 'M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.4-.15-.75-.4-1.03-.25-.27-.4-.62-.4-1.02 0-.8.67-1.45 1.5-1.45H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
  script: 'M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM7 9h10M7 12h6',
  volume: 'M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  'volume-off': 'M11 5L6 9H3v6h3l5 4V5zM16 9.5l5 5M21 9.5l-5 5',
} as const

export type IconName = keyof typeof PATHS
const FILLED = new Set<IconName>(['play'])

// Text glyphs the screens used before icons existed.
const LEGACY: Record<string, IconName> = {
  '+': 'plus', '＋': 'plus', '−': 'minus', '-': 'minus', '‹': 'chevron-left', '›': 'chevron-right',
  '▸': 'play', '⤓': 'download', '🗑': 'trash', '✕': 'x', '⟳': 'refresh', '✎': 'pencil',
  '⧉': 'copy', '▲': 'chevron-up', '▼': 'chevron-down',
}

export function iconFor(name: string): IconName | null {
  if (name in PATHS) return name as IconName
  return LEGACY[name] ?? null
}

export function Icon({ name, size = 18, color = C.text, strokeWidth = 2 }: {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const filled = FILLED.has(name)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={filled ? 0 : strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  )
}
