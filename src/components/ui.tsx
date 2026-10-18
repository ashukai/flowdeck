import { ReactNode } from 'react'
import {
  Pressable,
  Text,
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native'
import { C, R, S, F } from '@/theme'
import { Icon, iconFor } from '@/components/Icon'

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'ink' | 'raised' | 'dark' | 'darkDanger'
type BtnSize = 'sm' | 'md' | 'lg'

// Fill / label / hover per variant. One accent; everything else is ink and greys.
const VARIANTS: Record<BtnVariant, { bg: string; fg: string; hover: string; border?: string; shadow?: boolean }> = {
  primary:    { bg: C.accent,  fg: '#FFFFFF', hover: C.accent2 },
  soft:       { bg: '#EEF1F6', fg: C.text,    hover: '#E4E8F0' },
  ghost:      { bg: 'transparent', fg: C.text, hover: '#1B21300D' },
  danger:     { bg: C.dangerSoft, fg: C.danger, hover: '#F9DDE5' },
  ink:        { bg: C.text,    fg: '#FFFFFF', hover: '#2B3346' },
  raised:     { bg: '#FFFFFF', fg: C.text,    hover: '#FFFFFF', shadow: true },
  dark:       { bg: 'transparent', fg: '#FFFFFF', hover: '#FFFFFF1A' },
  darkDanger: { bg: 'transparent', fg: '#FF8FA6', hover: '#FF8FA61F' },
}

const SIZES: Record<BtnSize, { h: number; px: number; r: number; font: number; icon: number }> = {
  sm: { h: 34, px: 12, r: 10, font: 14, icon: 16 },
  md: { h: 42, px: 16, r: 12, font: 15, icon: 18 },
  lg: { h: 54, px: 22, r: 16, font: 17, icon: 20 },
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  style,
  full,
}: {
  label: string
  onPress: () => void
  variant?: BtnVariant
  size?: BtnSize
  icon?: string
  iconRight?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  full?: boolean
}) {
  const v = VARIANTS[variant]
  const z = SIZES[size]
  const left = icon ? iconFor(icon) : null
  const right = iconRight ? iconFor(iconRight) : null
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => {
        const { pressed } = state
        const hovered = (state as { hovered?: boolean }).hovered
        return [
          styles.btn,
          { height: z.h, paddingHorizontal: z.px, borderRadius: z.r, backgroundColor: hovered || pressed ? v.hover : v.bg },
          v.shadow && styles.raised,
          { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          full && { alignSelf: 'stretch' },
          style,
        ]
      }}
    >
      {left ? <Icon name={left} size={z.icon} color={v.fg} /> : null}
      <Text style={[styles.btnLabel, { color: v.fg, fontSize: z.font }]} numberOfLines={1}>{label}</Text>
      {right ? <Icon name={right} size={z.icon} color={v.fg} /> : null}
    </Pressable>
  )
}

export function IconButton({
  icon,
  onPress,
  active,
  tint,
  size = 42,
  variant = 'soft',
  label,
}: {
  icon: string
  onPress: () => void
  active?: boolean
  tint?: string
  size?: number
  variant?: BtnVariant
  label?: string
}) {
  const v = VARIANTS[active ? 'ink' : variant]
  const name = iconFor(icon)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? name ?? icon}
      style={(state) => {
        const { pressed } = state
        const hovered = (state as { hovered?: boolean }).hovered
        return [
          styles.iconBtn,
          {
            width: size, height: size, borderRadius: Math.round(size * 0.3),
            backgroundColor: hovered || pressed ? v.hover : v.bg,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
          v.shadow && styles.raised,
        ]
      }}
    >
      {name ? (
        <Icon name={name} size={Math.round(size * 0.45)} color={tint ?? v.fg} />
      ) : (
        <Text style={{ fontSize: size * 0.42, color: tint ?? v.fg }}>{icon}</Text>
      )}
    </Pressable>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
  onSubmitEditing,
  style,
}: {
  label?: string
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
  onSubmitEditing?: () => void
  style?: StyleProp<TextStyle>
}) {
  return (
    <View style={{ gap: S.xs }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        multiline={multiline}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? 'done' : undefined}
        style={[styles.input, multiline && { minHeight: 88, textAlignVertical: 'top' }, style]}
      />
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Pill({ text, color }: { text: string; color?: string }) {
  return (
    <View style={[styles.pill, color ? { backgroundColor: color + '22', borderColor: color + '55' } : null]}>
      <Text style={[styles.pillText, color ? { color } : null]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  btnLabel: { fontWeight: '600', letterSpacing: -0.2 },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  raised: {
    shadowColor: '#1B2130', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  fieldLabel: { color: C.muted, fontSize: F.small, fontWeight: '600' },
  input: {
    backgroundColor: C.bg3,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    color: C.text,
    fontSize: F.body,
  },
  card: {
    backgroundColor: C.bg2,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: C.bg3,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { color: C.muted, fontSize: F.tiny, fontWeight: '700' },
})
