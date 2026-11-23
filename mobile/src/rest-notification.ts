import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const identifier = 'nutri-workout-rest';
const channelId = 'workout-rest';
let pending = Promise.resolve();
let requested = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function updateWorkoutRest(deadline: unknown, language: unknown) {
  if (deadline !== null && typeof deadline !== 'string') return;
  const end = deadline ? Date.parse(deadline) : 0;
  if (!Number.isFinite(end) || end > Date.now() + 16 * 60_000) return;
  pending = pending
    .catch(() => {})
    .then(async () => {
      const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).find(
        (item) => item.identifier === identifier,
      );
      if (end <= Date.now()) {
        if (scheduled && deadline === null)
          await Notifications.cancelScheduledNotificationAsync(identifier);
        return;
      }
      if (
        scheduled?.content.data?.deadline === deadline &&
        scheduled.content.data?.lang === language
      )
        return;
      if (scheduled) await Notifications.cancelScheduledNotificationAsync(identifier);
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(channelId, {
          name: language === 'he' ? 'מנוחה באימון' : 'Workout rest',
          // AndroidImportance is re-exported through an Expo barrel that ESLint cannot resolve.
          // eslint-disable-next-line import/namespace
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 100, 250],
          sound: 'default',
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain && !requested) {
        requested = true;
        permission = await Notifications.requestPermissionsAsync();
      }
      if (!permission.granted || end <= Date.now()) return;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Nutra+',
          body:
            language === 'he'
              ? 'זמן המנוחה הסתיים. אפשר להתחיל את הסט הבא.'
              : 'Rest is over. You’re ready for the next set.',
          sound: 'default',
          vibrate: [0, 250, 100, 250],
          data: { deadline, lang: language },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(end),
          channelId,
        },
      });
    })
    .catch((error: unknown) =>
      console.warn('Workout rest notification could not be scheduled', error),
    );
}
