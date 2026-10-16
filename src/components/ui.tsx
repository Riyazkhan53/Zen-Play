import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, MAX_WIDTH, radius } from '@/ui/theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.screenInner, style]}>{children}</View>
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[styles.buttonText, { color: v.text }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  primary: { bg: colors.accent, border: colors.accent, text: colors.accentText },
  secondary: { bg: colors.surfaceAlt, border: colors.border, text: colors.text },
  ghost: { bg: 'transparent', border: colors.border, text: colors.muted },
  danger: { bg: 'transparent', border: colors.danger, text: colors.danger },
};

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <Pressable onPress={onClose} style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
      {onClose ? <Text style={styles.bannerClose}>✕</Text> : null}
    </Pressable>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Back" hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      <Text style={styles.topTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.topRight}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenInner: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16 },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3B1D24',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { flex: 1, color: '#FECACA', fontSize: 14 },
  bannerClose: { color: '#FECACA', fontSize: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 34, lineHeight: 38, marginTop: -4 },
  topTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  topRight: { minWidth: 40, alignItems: 'flex-end' },
});
