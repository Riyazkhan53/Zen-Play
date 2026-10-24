import { Pressable, Switch, Text, View } from 'react-native';

import { CardBack, CardFace, updateProfile, useProfile } from '@/lib/profile';
import { makeStyles, radius, useTheme } from '@/ui/theme';

import { PlayingCardView } from './playing-card';

const FACES: { face: CardFace; label: string }[] = [
  { face: 'classic', label: 'Classic' },
  { face: 'glass', label: 'Glass' },
  { face: '3d', label: '3D' },
];

const BACKS: { back: CardBack; label: string }[] = [
  { back: 'gold', label: 'Gold' },
  { back: 'black', label: 'Black' },
  { back: 'wizard', label: 'Wizard' },
  { back: 'hero', label: 'Hero' },
];

const SAMPLE = { id: -1, suit: 'H' as const, rank: 12 };
const SAMPLE_2 = { id: -2, suit: 'S' as const, rank: 1 };

/** Card front and back designs, plus Rummy's auto-sort, for Settings. */
export function CardStylePicker() {
  const styles = useStyles();
  const colors = useTheme();
  const { cardFace, cardBack, autoSort } = useProfile();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Card front</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {FACES.map(({ face, label }) => {
          const on = cardFace === face;
          return (
            <Pressable
              key={face}
              onPress={() => updateProfile({ cardFace: face })}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label} card front`}
              style={[styles.option, on && styles.optionOn]}
            >
              <View style={styles.felt}>
                <PlayingCardView card={SAMPLE_2} width={34} face={face} />
                <View style={styles.overlap}>
                  <PlayingCardView card={SAMPLE} width={34} face={face} />
                </View>
              </View>
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Card back</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {BACKS.map(({ back, label }) => {
          const on = cardBack === back;
          return (
            <Pressable
              key={back}
              onPress={() => updateProfile({ cardBack: back })}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label} card back`}
              style={[styles.option, on && styles.optionOn]}
            >
              <PlayingCardView width={40} faceDown back={back} />
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.switchTitle}>Rummy auto-sort</Text>
          <Text style={styles.hint}>
            On: your hand is grouped into melds for you. Off: cards stay in the order dealt and new cards go to the
            right end.
          </Text>
        </View>
        <Switch
          value={autoSort}
          onValueChange={(v) => updateProfile({ autoSort: v })}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
          accessibilityLabel="Rummy auto-sort"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  wrap: { gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionOn: { borderColor: colors.accent },
  felt: { flexDirection: 'row', padding: 6, borderRadius: 8, backgroundColor: '#14204A' },
  overlap: { marginLeft: -16 },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  optionTextOn: { color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  switchTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
}));
