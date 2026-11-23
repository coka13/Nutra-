import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePhone } from './settings';

type Item = [string, string, string, ComponentProps<typeof Ionicons>['name']];
const personal: Item[] = [
  ['dashboard', 'Home', 'בית', 'home-outline'],
  ['workouts', 'Workouts', 'אימונים', 'barbell-outline'],
  ['nutrition', 'Nutrition', 'תזונה', 'nutrition-outline'],
  ['activity', 'Activity', 'פעילות', 'footsteps-outline'],
  ['progress', 'Progress', 'התקדמות', 'stats-chart-outline'],
  ['settings', 'Profile', 'פרופיל', 'person-outline'],
];
const coaching: Item[] = [
  ['dashboard', 'Dashboard', 'לוח בקרה', 'grid-outline'],
  ['clients', 'Clients', 'מתאמנים', 'people-outline'],
  ['workouts', 'Workout Plans', 'תוכניות אימון', 'barbell-outline'],
  ['mealPlans', 'Nutrition Plans', 'תוכניות תזונה', 'nutrition-outline'],
  ['more', 'More', 'עוד', 'ellipsis-horizontal'],
];
const more: Item[] = [
  ['activity', 'Steps & aerobics', 'צעדים ואירובי', 'footsteps-outline'],
  ['library', 'All exercises', 'כל התרגילים', 'barbell-outline'],
  ['messages', 'Messages', 'הודעות', 'chatbubble-outline'],
  ['calendar', 'Calendar', 'יומן', 'calendar-outline'],
  ['settings', 'Settings', 'הגדרות', 'settings-outline'],
];

export function PortalNavigation({
  coach,
  page,
  open,
  ready,
}: {
  coach: boolean;
  page: string;
  open: (page: string) => void;
  ready: boolean;
}) {
  const { lang, colors } = usePhone();
  const [menu, setMenu] = useState(false);
  const items = coach ? coaching : personal;
  const selectedPage = ['active', 'builder', 'library'].includes(page)
    ? 'workouts'
    : !coach && ['recipes', 'mealPlans'].includes(page)
      ? 'nutrition'
      : coach && more.some(([item]) => item === page)
        ? 'more'
        : page;
  return (
    <>
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={{
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <View style={[styles.tabs, { direction: lang === 'he' ? 'rtl' : 'ltr' }]}>
          {items.map(([key, en, he, icon]) => {
            const selected = key === selectedPage;
            return (
              <Pressable
                key={key}
                disabled={!ready}
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: !ready }}
                style={[styles.tab, selected && { backgroundColor: colors.background }]}
                onPress={() => (key === 'more' ? setMenu(true) : open(key))}
              >
                <Ionicons name={icon} size={22} color={selected ? colors.accent : colors.muted} />
                <Text style={[styles.label, { color: selected ? colors.accent : colors.muted }]}>
                  {lang === 'he' ? he : en}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
      <Modal
        visible={menu && ready}
        transparent
        animationType="slide"
        onRequestClose={() => setMenu(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel={lang === 'he' ? 'סגירה' : 'Close'}
            onPress={() => setMenu(false)}
          />
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, direction: lang === 'he' ? 'rtl' : 'ltr' },
            ]}
          >
            {more.map(([key, en, he, icon]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                style={styles.menuItem}
                onPress={() => {
                  setMenu(false);
                  open(key);
                }}
              >
                <Ionicons name={icon} size={21} color={colors.accent} />
                <Text style={{ color: colors.ink, fontSize: 16 }}>{lang === 'he' ? he : en}</Text>
              </Pressable>
            ))}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'stretch', padding: 4, gap: 2 },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 57,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' },
  sheet: { borderTopStartRadius: 22, borderTopEndRadius: 22, padding: 16 },
  menuItem: {
    minHeight: 50,
    flexDirection: 'row',
    gap: 13,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
});
