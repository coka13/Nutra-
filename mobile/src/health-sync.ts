import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { HealthSnapshot } from '../../src/lib/activity';

function windowForDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid');
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  const now = new Date();
  if (start > now || start < new Date(now.getTime() - 29 * 86400000))
    throw new Error('healthDateRange');
  return { start, end: end > now ? now : end };
}

export async function readFitnessData(date: string): Promise<HealthSnapshot> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    throw new Error('healthDevelopmentBuild');
  const { start, end } = windowForDate(date);
  if (Platform.OS === 'ios') {
    const health = await import('@kingstinct/react-native-healthkit');
    if (!(await health.isHealthDataAvailable())) throw new Error('healthUnavailable');
    await health.requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'HKWorkoutTypeIdentifier',
      ],
    });
    const filter = { date: { startDate: start, endDate: end } };
    const [totals, energy, distance, workouts] = await Promise.all([
      health.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
        unit: 'count',
        filter,
      }),
      health.queryStatisticsForQuantity(
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        ['cumulativeSum'],
        { unit: 'kcal', filter },
      ),
      health.queryStatisticsForQuantity(
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        ['cumulativeSum'],
        { unit: 'km', filter },
      ),
      health.queryWorkoutSamples({
        limit: 200,
        ascending: false,
        filter: { date: { startDate: start, endDate: end, strictStartDate: true } },
      }),
    ]);
    const types = health.WorkoutActivityType;
    const kinds: Record<number, HealthSnapshot['activities'][number]['kind']> = {
      [types.walking]: 'walking',
      [types.running]: 'running',
      [types.cycling]: 'cycling',
      [types.swimming]: 'swimming',
      [types.rowing]: 'rowing',
      [types.elliptical]: 'elliptical',
      [types.dance]: 'dancing',
      [types.danceInspiredTraining]: 'dancing',
      [types.mixedMetabolicCardioTraining]: 'aerobics',
      [types.highIntensityIntervalTraining]: 'aerobics',
    };
    const activities = workouts
      .filter((item) => kinds[item.workoutActivityType] && item.endDate <= new Date())
      .map((item) => ({
        externalId: item.uuid,
        date,
        kind: kinds[item.workoutActivityType],
        minutes: item.duration.quantity / (item.duration.unit === 'min' ? 1 : 60),
        distanceKm: item.totalDistance
          ? item.totalDistance.quantity / (item.totalDistance.unit === 'km' ? 1 : 1000)
          : null,
      }))
      .filter((item) => item.minutes > 0 && item.minutes <= 1440);
    const steps = totals.sumQuantity ? Math.round(totals.sumQuantity.quantity) : null;
    const activeCalories = energy.sumQuantity ? Math.round(energy.sumQuantity.quantity) : null;
    const distanceKm = distance.sumQuantity
      ? Math.round(distance.sumQuantity.quantity * 100) / 100
      : null;
    // HealthKit deliberately doesn't reveal whether read access was denied.
    if (steps === null && activeCalories === null && distanceKm === null && !activities.length)
      throw new Error('healthNoData');
    return { source: 'apple-health', date, steps, activeCalories, distanceKm, activities };
  }
  if (Platform.OS === 'android') {
    const health = await import('react-native-health-connect');
    if (
      (await health.getSdkStatus()) !== health.SdkAvailabilityStatus.SDK_AVAILABLE ||
      !(await health.initialize())
    )
      throw new Error('healthUnavailable');
    const permissions = await health.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
    ]);
    const canRead = (recordType: string) =>
      permissions.some(
        (permission) =>
          'recordType' in permission &&
          permission.recordType === recordType &&
          permission.accessType === 'read',
      );
    if (!['Steps', 'ExerciseSession', 'ActiveCaloriesBurned', 'Distance'].some(canRead))
      throw new Error('healthPermissionDenied');
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
    const steps = canRead('Steps')
      ? Math.round(
          (await health.aggregateRecord({ recordType: 'Steps', timeRangeFilter })).COUNT_TOTAL ?? 0,
        )
      : null;
    const activeCalories = canRead('ActiveCaloriesBurned')
      ? Math.round(
          (await health.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }))
            .ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
        )
      : null;
    const distanceKm = canRead('Distance')
      ? Math.round(
          ((await health.aggregateRecord({ recordType: 'Distance', timeRangeFilter })).DISTANCE
            ?.inKilometers ?? 0) * 100,
        ) / 100
      : null;
    const types = health.ExerciseType;
    const kinds: Record<number, HealthSnapshot['activities'][number]['kind']> = {
      [types.WALKING]: 'walking',
      [types.RUNNING]: 'running',
      [types.RUNNING_TREADMILL]: 'running',
      [types.BIKING]: 'cycling',
      [types.BIKING_STATIONARY]: 'cycling',
      [types.SWIMMING_OPEN_WATER]: 'swimming',
      [types.SWIMMING_POOL]: 'swimming',
      [types.ROWING]: 'rowing',
      [types.ROWING_MACHINE]: 'rowing',
      [types.ELLIPTICAL]: 'elliptical',
      [types.DANCING]: 'dancing',
      [types.EXERCISE_CLASS]: 'aerobics',
    };
    const activities: HealthSnapshot['activities'] = [];
    if (canRead('ExerciseSession')) {
      let pageToken: string | undefined;
      do {
        const page = await health.readRecords('ExerciseSession', {
          timeRangeFilter,
          pageSize: 100,
          pageToken,
        });
        for (const item of page.records) {
          if (
            !kinds[item.exerciseType] ||
            !item.metadata?.id ||
            new Date(item.endTime) > new Date() ||
            new Date(item.startTime) < start
          )
            continue;
          const minutes = (Date.parse(item.endTime) - Date.parse(item.startTime)) / 60000;
          if (minutes > 0 && minutes <= 1440)
            activities.push({
              externalId: item.metadata.id,
              date,
              kind: kinds[item.exerciseType],
              minutes,
              distanceKm: null,
            });
        }
        pageToken = page.pageToken;
      } while (pageToken && activities.length < 200);
    }
    return {
      source: 'health-connect',
      date,
      steps,
      activeCalories,
      distanceKm,
      activities: activities.slice(0, 200),
    };
  }
  throw new Error('healthUnavailable');
}
