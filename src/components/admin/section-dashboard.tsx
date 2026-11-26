'use client';
import { Activity, Bot, CreditCard, Database, Dumbbell, Megaphone, RefreshCw, UserCheck, UserPlus, Users } from 'lucide-react';
import { Card, DateRange, Delta, ErrorState, PageHead, Stat, StatsSkeleton, useAdmin, useDateRange, useLoad } from './ui';
import { TimeChart } from './charts';

type Dashboard = {
  totals: { users: number; coaches: number; trainees: number; coached: number; independent: number; suspended: number; pendingCoaches: number; premium: number; coachSubs: number; adFreeGrants: number; compGrants: number; pendingCancel: number };
  activity: { dau: number; wau: number; mau: number; stickiness: number };
  current: Period;
  previous: Period;
  growth: Record<'registrations' | 'activeUsers' | 'revenue' | 'aiCost' | 'cancellations', number | null>;
  retention: { cohort: number; retained: number; rate: number | null };
  revenue: { mrrUsd: number; adRevenueCents: number; adImpressions: number; adClicks: number } | null;
  storage: { databaseBytes: number; photoBytes: number; brandingBytes: number };
  series: { date: string; registrations: number; dau: number; aiCostUsd: number; revenue: number | null; requests: number; errors: number }[];
};
type Period = { registrations: number; activeUsers: number; aiRequests: number; aiFailures: number; aiTokens: number; aiCostUsd: number; revenueCents: number | null; cancellations: number; requests: number; errorRate: number; avgLatencyMs: number };

export function DashboardSection() {
  const { t, formatNumber, formatMoney, formatBytes, can, navigate } = useAdmin();
  const [range, setRange] = useDateRange(30);
  const { data, error, loading, reload } = useLoad<Dashboard>(`dashboard?from=${range.from}&to=${range.to}`, [range.from, range.to]);
  const finance = can('billing.view');
  return (
    <>
      <PageHead title={t('navDashboard')} subtitle={t('dashboardSub')}>
        <DateRange value={range} onChange={setRange} />
        <button className="adm-icon-btn" onClick={() => void reload()} aria-label={t('retry')}>
          <RefreshCw size={16} className={loading ? 'adm-spin' : ''} />
        </button>
      </PageHead>
      {error && <ErrorState code={error} onRetry={() => void reload()} />}
      {!data ? (
        <StatsSkeleton />
      ) : (
        <div className="adm-stack">
          <div className="adm-grid stats">
            <Stat label={t('totalUsers')} icon={<Users size={15} />} value={formatNumber(data.totals.users)} foot={<span className="adm-stat-foot">{formatNumber(data.totals.suspended)} {t('suspendedUsers').toLowerCase()}</span>} />
            <Stat label={t('activeUsers')} icon={<Activity size={15} />} value={formatNumber(data.activity.mau)} foot={<Delta value={data.growth.activeUsers} />} />
            <Stat label={t('dau')} icon={<UserCheck size={15} />} value={formatNumber(data.activity.dau)} foot={<span className="adm-stat-foot">{t('wau')}: {formatNumber(data.activity.wau)} · {t('stickiness')} {formatNumber(data.activity.stickiness, 1)}%</span>} />
            <Stat label={t('newRegistrations')} icon={<UserPlus size={15} />} value={formatNumber(data.current.registrations)} foot={<Delta value={data.growth.registrations} />} />
            <Stat label={t('retention')} hint={t('retentionHint')} value={data.retention.rate == null ? '—' : `${formatNumber(data.retention.rate, 1)}%`} foot={<span className="adm-stat-foot">{formatNumber(data.retention.retained)} / {formatNumber(data.retention.cohort)}</span>} />
            <Stat label={t('coaches')} icon={<Dumbbell size={15} />} value={formatNumber(data.totals.coaches)} foot={data.totals.pendingCoaches ? <button className="adm-btn small" onClick={() => navigate('coaches', { status: 'PENDING' })}>{formatNumber(data.totals.pendingCoaches)} {t('PENDING').toLowerCase()}</button> : <span className="adm-stat-foot">{t('pendingCoaches')}: 0</span>} />
            <Stat label={t('independentTrainees')} value={formatNumber(data.totals.independent)} foot={<span className="adm-stat-foot">{t('trainees')}: {formatNumber(data.totals.trainees)}</span>} />
            <Stat label={t('coachedTrainees')} value={formatNumber(data.totals.coached)} foot={<span className="adm-stat-foot">{data.totals.trainees ? formatNumber((data.totals.coached / data.totals.trainees) * 100, 1) : 0}%</span>} />
          </div>
          {finance && data.revenue && (
            <div className="adm-grid stats">
              <Stat label={t('mrr')} hint={t('mrrHint')} icon={<CreditCard size={15} />} value={formatMoney(data.revenue.mrrUsd)} foot={<span className="adm-stat-foot">{t('mrrHint')}</span>} />
              <Stat label={t('collected')} value={formatMoney((data.current.revenueCents ?? 0) / 100)} foot={<Delta value={data.growth.revenue} />} />
              <Stat label={t('premiumSubscribers')} value={formatNumber(data.totals.premium)} foot={<span className="adm-stat-foot">{t('coachSubscribers')}: {formatNumber(data.totals.coachSubs)}</span>} />
              <Stat label={t('adFreeUsers')} value={formatNumber(data.totals.adFreeGrants)} foot={<span className="adm-stat-foot">{t('activeGrants')}: {formatNumber(data.totals.compGrants)}</span>} />
              <Stat label={t('cancellations')} value={formatNumber(data.current.cancellations)} foot={<Delta value={data.growth.cancellations} inverse />} />
              <Stat label={t('pendingCancellations')} value={formatNumber(data.totals.pendingCancel)} />
              <Stat label={t('adRevenue')} icon={<Megaphone size={15} />} value={formatMoney(data.revenue.adRevenueCents / 100)} foot={<span className="adm-stat-foot">{formatNumber(data.revenue.adImpressions)} {t('impressions').toLowerCase()}</span>} />
              <Stat label={t('aiCost')} icon={<Bot size={15} />} value={formatMoney(data.current.aiCostUsd)} foot={<Delta value={data.growth.aiCost} inverse />} />
            </div>
          )}
          <div className="adm-grid two">
            <Card title={t('registrationsChart')}>
              <TimeChart
                data={data.series}
                xKey="date"
                series={[
                  { key: 'dau', label: t('dau'), color: 'var(--chart-1)' },
                  { key: 'registrations', label: t('newRegistrations'), color: 'var(--chart-3)', kind: 'bar' },
                ]}
              />
            </Card>
            {finance ? (
              <Card title={t('revenueChart')}>
                <TimeChart
                  data={data.series}
                  xKey="date"
                  kind="bar"
                  series={[
                    { key: 'revenue', label: t('collected'), color: 'var(--chart-1)' },
                    { key: 'aiCostUsd', label: t('aiCost'), color: 'var(--chart-4)' },
                  ]}
                />
              </Card>
            ) : (
              <Card title={t('aiRequests')}>
                <TimeChart data={data.series} xKey="date" kind="line" series={[{ key: 'aiCostUsd', label: t('aiCost'), color: 'var(--chart-4)' }]} />
              </Card>
            )}
          </div>
          <div className="adm-grid two">
            <Card title={t('healthChart')}>
              <TimeChart
                data={data.series}
                xKey="date"
                series={[
                  { key: 'requests', label: t('requests'), color: 'var(--chart-3)' },
                  { key: 'errors', label: t('errorRate'), color: 'var(--chart-5)', kind: 'bar', axis: 'right' },
                ]}
              />
            </Card>
            <div className="adm-grid two" style={{ alignContent: 'start' }}>
              <Stat label={t('aiRequests')} icon={<Bot size={15} />} value={formatNumber(data.current.aiRequests)} foot={<span className="adm-stat-foot">{formatNumber(data.current.aiTokens)} {t('aiTokens').toLowerCase()} · {formatNumber(data.current.aiFailures)} {t('failures').toLowerCase()}</span>} />
              <Stat label={t('errorRate')} value={`${formatNumber(data.current.errorRate, 2)}%`} foot={<span className="adm-stat-foot">{t('avgLatency')}: {formatNumber(data.current.avgLatencyMs)} ms</span>} />
              <Stat label={t('database')} icon={<Database size={15} />} value={formatBytes(data.storage.databaseBytes)} />
              <Stat label={t('storage')} value={formatBytes(data.storage.photoBytes + data.storage.brandingBytes)} foot={<span className="adm-stat-foot">{t('photos')}: {formatBytes(data.storage.photoBytes)}</span>} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
