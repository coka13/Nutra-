'use client';
import { useNutri } from './workspace';

export type UnitOption = { nameHe: string; nameEn: string; grams: number };
/** Grams are the source of truth; quantity + unit are kept so "4 × ביצה" can be shown later. */
export type Amount = {
  grams: number;
  quantity: number | null;
  unitHe: string | null;
  unitEn: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Default amount for a newly picked food: one "ביצה" for egg dishes, otherwise 100 g. */
export function defaultAmount(units: UnitOption[] = []): Amount {
  const egg = units.find((u) => u.nameHe === 'ביצה');
  return egg
    ? { grams: round1(egg.grams), quantity: 1, unitHe: egg.nameHe, unitEn: egg.nameEn }
    : { grams: 100, quantity: null, unitHe: null, unitEn: null };
}

/** "4 × ביצה · 216 g" or "150 g". */
export function useAmountLabel() {
  const { lang, t, number } = useNutri();
  return (a: { grams: number; quantity?: number | null; unitHe?: string | null; unitEn?: string | null }) => {
    const unit = lang === 'he' ? a.unitHe : a.unitEn;
    const grams = `${number(Math.round(a.grams))} ${t('grams')}`;
    return a.quantity && unit ? `${number(a.quantity)} × ${unit} · ${grams}` : grams;
  };
}

/** Quantity + unit selector (grams, or any household unit the food has). */
export function AmountInput({
  units = [],
  value,
  onChange,
  compact = false,
}: {
  units?: UnitOption[];
  value: Amount;
  onChange: (next: Amount) => void;
  compact?: boolean;
}) {
  const { lang, t, number } = useNutri();
  const index = value.unitHe ? units.findIndex((u) => u.nameHe === value.unitHe) : -1;
  const unit = index >= 0 ? units[index] : null;
  const quantity = unit ? (value.quantity ?? 1) : value.grams;
  const label = (u: UnitOption) =>
    `${lang === 'he' ? u.nameHe : u.nameEn} (${number(Math.round(u.grams))} ${t('grams')})`;

  function setQuantity(q: number) {
    if (!Number.isFinite(q) || q <= 0) return;
    if (unit)
      onChange({ grams: round1(q * unit.grams), quantity: q, unitHe: unit.nameHe, unitEn: unit.nameEn });
    else onChange({ grams: Math.min(10000, q), quantity: null, unitHe: null, unitEn: null });
  }
  function setUnit(i: number) {
    const next = units[i];
    if (!next) onChange({ grams: round1(value.grams), quantity: null, unitHe: null, unitEn: null });
    else {
      // Keep the count when switching between units ("2 כפות" → "2 כפיות"); from grams start at 1.
      const q = unit ? quantity : 1;
      onChange({ grams: round1(q * next.grams), quantity: q, unitHe: next.nameHe, unitEn: next.nameEn });
    }
  }

  return (
    <div className={`amount-input ${compact ? 'compact' : ''}`}>
      <input
        type="number"
        required
        min={unit ? 0.25 : 1}
        max={unit ? 1000 : 10000}
        step={unit ? 0.25 : 1}
        aria-label={t('quantity')}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      {units.length > 0 ? (
        <select
          aria-label={t('unit')}
          value={index}
          onChange={(e) => setUnit(Number(e.target.value))}
        >
          <option value={-1}>{t('gramsUnit')}</option>
          {units.map((u, i) => (
            <option key={`${u.nameHe}-${i}`} value={i}>
              {label(u)}
            </option>
          ))}
        </select>
      ) : (
        <span className="amount-unit">{t('grams')}</span>
      )}
      {unit && !compact && (
        <small className="muted">
          ≈ {number(Math.round(value.grams))} {t('grams')}
        </small>
      )}
    </div>
  );
}
