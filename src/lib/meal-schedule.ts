/** Weekdays use JS numbering: 0 = Sunday … 6 = Saturday. */
export function parseWeekdays(value: string | null | undefined): number[] | null {
  if (!value) return null;
  const days = [...new Set(value.split(',').map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort();
  return days.length && days.length < 7 ? days : null;
}

/** Stores a selection; an empty or full selection means "every day" (null). */
export function serializeWeekdays(days: number[] | null | undefined): string | null {
  if (!days) return null;
  const unique = [...new Set(days)].sort();
  return unique.length && unique.length < 7 ? unique.join(',') : null;
}

export function menuApplies(
  plan: { menuDate: string | null; menuWeekdays: string | null },
  date: string,
) {
  if (plan.menuDate) return plan.menuDate === date;
  const days = parseWeekdays(plan.menuWeekdays);
  return days === null || days.includes(new Date(date + 'T12:00:00Z').getUTCDay());
}
