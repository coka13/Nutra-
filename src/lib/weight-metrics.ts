type WeightRecord = { kind: string; date: string; value: number };

export function weightMetrics(records: WeightRecord[], month: string) {
  const weights = records
    .filter(
      (record) => record.kind === 'weight' && Number.isFinite(record.value) && record.value > 0,
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const entries = weights.filter((record) => record.date.startsWith(`${month}-`));
  return {
    latest: weights.at(-1),
    entries,
    average: entries.length
      ? entries.reduce((sum, record) => sum + record.value, 0) / entries.length
      : undefined,
    change: entries.length > 1 ? entries.at(-1)!.value - entries[0].value : undefined,
  };
}
