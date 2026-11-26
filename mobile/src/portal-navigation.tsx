import { useState, type ComponentProps } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePhone } from './settings';

type Item = [string, string, ComponentProps<typeof Ionicons>['name']];
const personal: Item[] = [
  ['dashboard', 'mobileHome', 'home-outline'],
  ['workouts', 'trainingSessions', 'barbell-outline'],
  ['nutrition', 'nutrition', 'nutrition-outline'],
  ['activity', 'stepsAndActivity', 'footsteps-outline'],
  ['progress', 'progress', 'stats-chart-outline'],
  ['settings', 'profile', 'person-outline'],
];
const coaching: Item[] = [
  ['dashboard', 'dashboard', 'grid-outline'],
  ['clients', 'clients', 'people-outline'],
  ['workouts', 'workoutPlans', 'barbell-outline'],
  ['mealPlans', 'mealPlans', 'nutrition-outline'],
  ['more', 'mobileMore', 'ellipsis-horizontal'],
];
const more: Item[] = [
  ['packages', 'packages', 'albums-outline'],
  ['trainingLog', 'trainingLog', 'checkmark-circle-outline'],
  ['clientPayments', 'clientPayments', 'wallet-outline'],
  ['businessReports', 'businessReports', 'stats-chart-outline'],
  ['library', 'allExercises', 'barbell-outline'],
  ['messages', 'messages', 'chatbubble-outline'],
  ['calendar', 'calendar', 'calendar-outline'],
  ['branding', 'branding', 'color-palette-outline'],
  ['billing', 'billing', 'card-outline'],
  ['settings', 'settings', 'settings-outline'],
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
  const { lang, colors, t } = usePhone();
  const { height } = useWindowDimensions();
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
          {items.map(([key, label, icon]) => {
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
                  {t(label)}
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
            accessibilityLabel={t('close')}
            onPress={() => setMenu(false)}
          />
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                direction: lang === 'he' ? 'rtl' : 'ltr',
                maxHeight: height * 0.85,
              },
            ]}
          >
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {more.map(([key, label, icon]) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: key === page }}
                  style={styles.menuItem}
                  onPress={() => {
                    setMenu(false);
                    open(key);
                  }}
                >
                  <Ionicons name={icon} size={21} color={colors.accent} />
                  <Text style={{ color: colors.ink, fontSize: 16 }}>{t(label)}</Text>
                </Pressable>
              ))}
            </ScrollView>
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
