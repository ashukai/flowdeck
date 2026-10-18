import { useWindowDimensions } from 'react-native'

// Breakpoint helper so the same screens lay out cleanly on iPhone and on a
// wide Mac browser window. `cols` drives the library grid; `wide` toggles
// two-pane / roomier layouts.
export function useLayout() {
  const { width, height } = useWindowDimensions()
  const wide = width >= 900
  const medium = width >= 600
  const cols = width >= 1280 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1
  return { width, height, wide, medium, cols, isPhone: !medium }
}
