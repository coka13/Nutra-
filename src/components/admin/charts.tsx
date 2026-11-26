'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAdmin } from './ui';

type Series = { key: string; label: string; color: string; kind?: 'area' | 'bar' | 'line'; axis?: 'left' | 'right' };

const tooltipStyle = {
  background: 'var(--a-panel)',
  border: '1px solid var(--a-line)',
  borderRadius: 10,
  color: 'var(--a-text)',
  fontSize: 12,
};

/** One chart component for the console: themed via CSS variables, RTL-aware axis order. */
export function TimeChart({ data, xKey, series, kind = 'area', height = 260 }: { data: Record<string, unknown>[]; xKey: string; series: Series[]; kind?: 'area' | 'bar' | 'line'; height?: number }) {
  const { lang, formatNumber } = useAdmin();
  const rtl = lang === 'he';
  const twoAxes = series.some((s) => s.axis === 'right');
  const tickDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(5).replace('-', '/') : value);
  const common = (
    <>
      <CartesianGrid stroke="var(--a-line)" vertical={false} />
      <XAxis dataKey={xKey} tickFormatter={tickDate} reversed={rtl} tick={{ fill: 'var(--a-muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
      <YAxis yAxisId="left" orientation={rtl ? 'right' : 'left'} tick={{ fill: 'var(--a-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => formatNumber(Number(v), 2)} />
      {twoAxes && <YAxis yAxisId="right" orientation={rtl ? 'left' : 'right'} tick={{ fill: 'var(--a-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => formatNumber(Number(v), 2)} />}
      <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => tickDate(String(v))} formatter={(v) => formatNumber(Number(v), 2)} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  );
  return (
    <div className="adm-chart" style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart data={data}>
            {common}
            {series.map((s) => (
              <Bar key={s.key} yAxisId={s.axis ?? 'left'} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        ) : kind === 'line' ? (
          <LineChart data={data}>
            {common}
            {series.map((s) => (
              <Line key={s.key} yAxisId={s.axis ?? 'left'} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {series.map((s) =>
              s.kind === 'bar' ? (
                <Bar key={s.key} yAxisId={s.axis ?? 'left'} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
              ) : (
                <Area key={s.key} yAxisId={s.axis ?? 'left'} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} />
              ),
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
