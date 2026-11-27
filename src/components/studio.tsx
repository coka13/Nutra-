'use client';
import { PromoRedeem } from './support-center';
import { CoachContact } from './coach-contact';
import { BrandMark, brandBackgroundUrl, encodeBackground, encodeLogo } from './brand-logo';
import { ClientProfile } from './client-profile';
import { LoadingCards } from './loading-cards';
import { AiPlanner } from './ai-planner';
import { isInternationalPhone } from '@/lib/phone';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Dumbbell,
  Globe,
  ImagePlus,
  Leaf,
  Loader2,
  LogOut,
  MessageSquare,
  Palette,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { State } from '@/lib/types';
import { PLAN_PRICE_USD } from '@/lib/plans';
import { calendarDate, workoutCalendar } from '@/lib/workout-calendar';
import { weightMetrics } from '@/lib/weight-metrics';
import { WheelInput } from './wheel-input';
import { api, Empty, Form, localDay, Modal, PageHeading, Submit, useNutri } from './workspace';
export function CalendarView() {
  const { state, t, run, formatDate } = useNutri(),
    [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0);
  const timeZone = state.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = calendarDate(new Date(), timeZone);
  const current = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  current.setMonth(current.getMonth() + offset);
  const first = (current.getDay() + 6) % 7,
    days = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const month = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  const workouts = workoutCalendar(
    state.programs,
    state.calendarWorkouts ?? state.workouts,
    state.user.id,
    month,
    timeZone,
  );
  const contacts = state.relationships
    .filter((r) => r.status === 'ACTIVE')
    .map((r) => (r.coachId === state.user.id ? r.client : r.coach));
  const participantName = (appointment: State['appointments'][number]) => {
    const otherId =
      appointment.ownerId === state.user.id ? appointment.guestId : appointment.ownerId;
    return state.relationships
      .flatMap((r) => [r.client, r.coach])
      .find((person) => person.id === otherId)?.name;
  };
  return (
    <>
      <PageHeading title={t('calendar')} subtitle={t('calendarSub')}>
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={16} />
          {t('newAppointment')}
        </button>
      </PageHeading>
      <section className="panel">
        <div className="section-heading">
          <h2>{formatDate(current.toISOString(), { month: 'long', year: 'numeric' })}</h2>
          <div className="row">
            <button
              className="icon-btn"
              aria-label={t('previousMonth')}
              onClick={() => setOffset(offset - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button className="button secondary" onClick={() => setOffset(0)}>
              {t('today')}
            </button>
            <button
              className="icon-btn"
              aria-label={t('nextMonth')}
              onClick={() => setOffset(offset + 1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
        <div className="row wrap workout-calendar-legend">
          {(['workoutDone', 'workoutMissed', 'workoutPending'] as const).map((status) => (
            <span className={`badge workout-status ${status}`} key={status}>
              {t(status)}
            </span>
          ))}
        </div>
        <div className="month-grid">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(2026, 10, 23 + i);
            return (
              <div className="month-weekday" key={i}>
                {formatDate(d.toISOString(), { weekday: 'short' })}
              </div>
            );
          })}
          {Array.from({ length: first + days }, (_, i) => {
            if (i < first) return <div key={i} className="calendar-day outside" />;
            const d = new Date(current.getFullYear(), current.getMonth(), i - first + 1);
            const key = localDay(d);
            const events = state.appointments.filter(
              (a) => calendarDate(a.startsAt, timeZone) === key && a.status !== 'CANCELLED',
            );
            return (
              <div key={i} className={`calendar-day ${key === today ? 'today-cell' : ''}`}>
                <span className="calendar-day-number">{d.getDate()}</span>
                {workouts
                  .filter((workout) => workout.date === key)
                  .map((workout) => (
                    <button
                      type="button"
                      className={`calendar-event workout-status ${workout.status}`}
                      key={workout.id}
                      title={`${workout.name} · ${t(workout.status)}`}
                      onClick={() =>
                        document
                          .getElementById(workout.id)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                    >
                      {workout.name}
                      <span>{t(workout.status)}</span>
                    </button>
                  ))}
                {events.map((a) => (
                  <button
                    className="calendar-event"
                    key={a.id}
                    onClick={() =>
                      document
                        .getElementById(a.id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                  >
                    <span>{formatDate(a.startsAt, { hour: '2-digit', minute: '2-digit' })}</span>
                    {a.title}
                    <span>
                      {t(a.kind || 'MEETING')}
                      {participantName(a) ? ` · ${participantName(a)}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>{t('calendarWorkouts')}</h2>
        </div>
        {workouts.length ? (
          workouts.map((workout) => (
            <div id={workout.id} className="list-row appointment-row" key={workout.id}>
              <span className="tile-icon">
                <Dumbbell size={20} />
              </span>
              <div className="grow">
                <strong>{workout.name}</strong>
                <small>
                  {formatDate(`${workout.date}T12:00:00Z`, {
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                </small>
              </div>
              <span className={`badge workout-status ${workout.status}`}>{t(workout.status)}</span>
            </div>
          ))
        ) : (
          <Empty text={t('noWorkoutsYet')} />
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>{t('sessions')}</h2>
          <span className="muted small-copy">
            {t('timezone')}:{' '}
            {state.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
        </div>
        {state.appointments.length ? (
          state.appointments.map((a) => (
            <div id={a.id} className="list-row appointment-row" key={a.id}>
              <span className="tile-icon">
                {a.kind === 'PERSONAL_TRAINING' ? (
                  <Dumbbell size={20} />
                ) : (
                  <CalendarDays size={20} />
                )}
              </span>
              <div className="grow">
                <strong>{a.title}</strong>
                <small>
                  {t(a.kind || 'MEETING')}
                  {participantName(a) ? ` · ${t('with')} ${participantName(a)}` : ''}
                </small>
                <small>
                  {formatDate(a.startsAt, {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {Math.round((+new Date(a.endsAt) - +new Date(a.startsAt)) / 60000)} {t('min')}
                </small>
                {a.notes && <p className="small-copy">{a.notes}</p>}
              </div>
              <span className={`badge ${a.status === 'CANCELLED' ? 'neutral' : ''}`}>
                {t(a.status)}
              </span>
              {a.status === 'BOOKED' && (
                <div className="row wrap">
                  <button
                    className="text-button muted"
                    onClick={() =>
                      run('appointments/update', { id: a.id, status: 'CANCELLED' }).catch(() => {})
                    }
                  >
                    {t('cancelBooking')}
                  </button>
                  {a.ownerId === state.user.id && (
                    <button
                      className="text-button"
                      onClick={() =>
                        run('appointments/update', { id: a.id, status: 'ATTENDED' }).catch(() => {})
                      }
                    >
                      {t('markAttended')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <Empty text={t('noAppointmentsYet')} />
        )}
      </section>
      {open && (
        <Modal title={t('newAppointment')} onClose={() => setOpen(false)}>
          <Form
            onSubmit={async (f) => {
              await run('appointments', {
                title: f.get('title'),
                kind: f.get('kind'),
                notes: f.get('notes'),
                guestId: f.get('guestId') || null,
                startsAt: new Date(String(f.get('startsAt'))).toISOString(),
                duration: Number(f.get('duration')),
              });
              setOpen(false);
            }}
          >
            <p className="muted small-copy">{t('sharedCalendarHint')}</p>
            <label>
              {t('sessionKind')}
              <select name="kind" defaultValue="MEETING">
                <option value="MEETING">{t('MEETING')}</option>
                <option value="PERSONAL_TRAINING">{t('PERSONAL_TRAINING')}</option>
              </select>
            </label>
            <label>
              {t('title')}
              <input name="title" required maxLength={200} />
            </label>
            <label>
              {t('with')}
              <select name="guestId">
                <option value="">{t('privateCalendarEvent')}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                {t('startTime')}
                <input type="datetime-local" name="startsAt" required />
                <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
              </label>
              <label>
                {t('duration')}
                <input
                  type="number"
                  name="duration"
                  min={15}
                  max={180}
                  defaultValue={45}
                  required
                />
              </label>
            </div>
            <label>
              {t('notes')}
              <textarea name="notes" maxLength={2000} rows={3} />
            </label>
            <Submit>{t('book')}</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function ClientsView() {
  const { state, t, run } = useNutri(),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [invite, setInvite] = useState(false),
    [clientId, setClientId] = useState<string | null>(null);
  const [active, setActive] = useState<
    { userId: string; id: string; name: string; status: string; completed: number; total: number }[]
  >([]);
  useEffect(() => {
    if (state.user.role !== 'COACH') return;
    let current = true;
    function update() {
      if (document.hidden) return;
      api<typeof active>('coach/active-workouts')
        .then((items) => {
          if (current) setActive(items);
        })
        .catch(() => {
          if (current) setActive([]);
        });
    }
    update();
    void api('clients/check-schedule', {}).catch(() => {});
    const timer = setInterval(update, 5000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [state.user.role]);
  const links = state.relationships.filter(
    (r) =>
      r.coachId === state.user.id &&
      (filter === 'all' || r.status === filter) &&
      `${r.client.name} ${r.client.email} ${r.tags}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (state.user.role !== 'COACH') return <Empty text={t('forbidden')} />;
  // Read the link from state so saved notes/tags show up immediately.
  const client = state.relationships.find(
    (r) => r.clientId === clientId && r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  if (client)
    return <ClientProfile key={client.clientId} link={client} onBack={() => setClientId(null)} />;
  return (
    <>
      <PageHeading title={t('clients')} subtitle={t('clientsSub')}>
        <button className="button primary" onClick={() => setInvite(true)}>
          <Plus size={16} />
          {t('inviteClient')}
        </button>
      </PageHeading>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select aria-label={t('status')} value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['all', 'ACTIVE', 'PENDING', 'DECLINED', 'REVOKED'].map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel client-directory">
        <div className="client-table-head">
          <span>{t('name')}</span>
          <span>{t('status')}</span>
          <span>{t('tags')}</span>
          <span />
        </div>
        {links.map((r) => (
          <div className="client-table-row" key={r.id}>
            <div className="row">
              <span className="avatar">
                {r.client.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <strong>{r.client.name}</strong>
                <small>{r.client.email}</small>
                {active
                  .filter((workout) => workout.userId === r.clientId)
                  .map((workout) => (
                    <small key={workout.id}>
                      {t(workout.status === 'PAUSED' ? 'pause' : 'activeLabel')} · {workout.name} ·{' '}
                      {workout.completed}/{workout.total}
                    </small>
                  ))}
              </div>
            </div>
            <span className={`badge ${r.status !== 'ACTIVE' ? 'neutral' : ''}`}>{t(r.status)}</span>
            <span className="muted small-copy">{r.tags || '—'}</span>
            <button
              className="button secondary"
              disabled={r.status !== 'ACTIVE'}
              onClick={() => setClientId(r.clientId)}
            >
              {t('clientProfile')}
              <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
        {!links.length && <Empty text={t('noClientsYet')} />}
      </section>
      {invite && (
        <Modal title={t('inviteClient')} onClose={() => setInvite(false)}>
          <p className="muted">{t('inviteHint')}</p>
          <Form
            onSubmit={async (f) => {
              await run('clients/invite', { email: f.get('email') });
              setInvite(false);
            }}
          >
            <label>
              {t('email')}
              <input type="email" name="email" required />
            </label>
            <Submit>{t('inviteClient')}</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function MessagesView() {
  const { state, t, run, formatDate } = useNutri(),
    [selected, setSelected] = useState(''),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false);
  const contacts = state.relationships
    .filter((r) => r.status === 'ACTIVE')
    .map((r) => (r.coachId === state.user.id ? r.client : r.coach));
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('with');
    if (requested) setSelected(requested);
  }, []);
  const contact = contacts.find((c) => c.id === selected) || contacts[0];
  const coach = state.relationships.find(
    (r) => r.clientId === state.user.id && r.coachId === contact?.id && r.status === 'ACTIVE',
  )?.coach;
  const conversation = state.messages.filter(
    (m) => m.senderId === contact?.id || m.recipientId === contact?.id,
  );
  useEffect(() => {
    if (contact?.id) run('messages/read', { senderId: contact.id }, true).catch(() => {});
  }, [
    contact?.id,
    state.messages.filter((m) => !m.readAt && m.recipientId === state.user.id).length,
  ]);
  return (
    <>
      <PageHeading title={t('messages')} subtitle={t('messageSub')} />
      {contacts.length ? (
        <section className="panel messaging-layout">
          <aside className="contact-list">
            {contacts.map((c) => (
              <button
                key={c.id}
                className={`contact-row ${c.id === contact?.id ? 'selected' : ''}`}
                onClick={() => setSelected(c.id)}
              >
                <span className="avatar">{c.name[0]}</span>
                <div className="grow">
                  <strong>{c.name}</strong>
                  <small>
                    {state.messages.filter(
                      (m) => m.recipientId === state.user.id && m.senderId === c.id && !m.readAt,
                    ).length || ''}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </aside>
          <div className="conversation">
            <div className="conversation-header">
              <span className="avatar">{contact?.name[0]}</span>
              <strong>{contact?.name}</strong>
            </div>
            {coach && <CoachContact coach={coach} />}
            <div className="conversation-messages">
              {conversation.map((m) => (
                <div
                  key={m.id}
                  className={`message ${m.senderId === state.user.id ? 'outgoing' : 'incoming'}`}
                >
                  <p>{m.body}</p>
                  <small>
                    {formatDate(m.createdAt, {
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {m.senderId === state.user.id && m.readAt && <Check size={11} />}
                  </small>
                </div>
              ))}
              {!conversation.length && <Empty text={t('noMessagesYet')} />}
            </div>
            <form
              className="message-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!body.trim() || busy || !contact) return;
                setBusy(true);
                try {
                  await run('messages', { recipientId: contact.id, body }, true);
                  setBody('');
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                aria-label={t('writeMessage')}
                placeholder={t('writeMessage')}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <button
                className="button primary"
                aria-label={t('send')}
                disabled={busy || !body.trim()}
              >
                <Send size={17} />
              </button>
            </form>
          </div>
        </section>
      ) : (
        <Empty text={t('noContacts')} />
      )}
    </>
  );
}
export function AssistantView() {
  const { state, t } = useNutri();
  const enabled =
    state.entitlements.ai &&
    state.integrations.ai &&
    state.profile?.adult &&
    state.profile.aiConsent;
  return (
    <>
      <PageHeading title={t('assistant')} subtitle={t('assistantSub')} />
      <div className="assistant-layout">
        {!state.entitlements.ai && (
          <div className="integration-notice">
            <Sparkles size={18} />
            <p>{t('aiPlanRequired')}</p>
          </div>
        )}
        {state.entitlements.ai && !state.integrations.ai && (
          <div className="integration-notice">
            <Sparkles size={18} />
            <p>{t('aiUnavailable')}</p>
          </div>
        )}
        {(!state.profile?.adult || !state.profile.aiConsent) && (
          <div className="integration-notice">
            <Shield size={18} />
            <p>{t('consent')}</p>
          </div>
        )}
        <AiPlanner enabled={!!enabled} />
        <small className="muted">{t('aiDisclaimer')}</small>
      </div>
    </>
  );
}
export function SettingsView({ onboarding = false }: { onboarding?: boolean }) {
  const { state, lang, t, run, navigate } = useNutri(),
    [deleting, setDeleting] = useState(false),
    [resetting, setResetting] = useState(false),
    [resetBusy, setResetBusy] = useState(false),
    [resetConfirmed, setResetConfirmed] = useState(false);
  const p = state.profile;
  const isCoach = state.user.role === 'COACH';
  const thisYear = new Date().getFullYear();
  const birthYears = Array.from({ length: thisYear - 1920 + 1 }, (_, i) => 1920 + i);
  const latestWeight = weightMetrics(state.progress, '').latest?.value;
  const weightOptions = Array.from({ length: (250 - 30) * 2 + 1 }, (_, i) => 30 + i / 2);
  const heightOptions = Array.from({ length: 230 - 100 + 1 }, (_, i) => 100 + i);
  const timezone = p?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const supportedZones = Intl.supportedValuesOf('timeZone');
  // Keep a stored zone selectable even if this browser lists it under another name (e.g. UTC).
  const timezones = supportedZones.includes(timezone)
    ? supportedZones
    : [timezone, ...supportedZones];
  return (
    <>
      <PageHeading
        title={t(onboarding ? 'welcome' : 'profileSettings')}
        subtitle={t(onboarding ? 'onboardingSub' : 'settingsSub')}
      />
      <Form
        onSubmit={async (f) => {
          if (isCoach && !isInternationalPhone(String(f.get('phone') || '')))
            throw new Error('invalidPhone');
          await run('profile', {
            name: f.get('name'),
            ...(isCoach && { phone: f.get('phone') }),
            ...(!isCoach && {
              heightCm: f.get('heightCm') ? Number(f.get('heightCm')) : null,
              birthYear: f.get('birthYear') ? Number(f.get('birthYear')) : null,
              weightKg:
                f.get('weightKg') && Number(f.get('weightKg')) !== latestWeight
                  ? Number(f.get('weightKg'))
                  : undefined,
              // No longer edited here; keep the stored values.
              goal: p?.goal || 'consistency',
              experience: p?.experience || 'beginner',
              equipment: p?.equipment || 'bodyweight',
              frequency: p?.frequency ?? 3,
              duration: p?.duration ?? 40,
              dietary: f.get('dietary'),
              limitations: f.get('limitations'),
              units: f.get('units'),
            }),
            language: f.get('language'),
            theme: f.get('theme'),
            timezone: f.get('timezone'),
            // Age is derived from the birth year; without one, keep the stored answer.
            adult: f.get('birthYear')
              ? thisYear - Number(f.get('birthYear')) >= 18
              : (p?.adult ?? false),
            aiConsent: f.get('aiConsent') === 'on',
            reminders: f.get('reminders') === 'on',
            onboarded: true,
          });
          if (onboarding) navigate('dashboard');
        }}
      >
        <div className="settings-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>{t('preferences')}</h2>
              <span className="tile-icon">
                <Users size={18} />
              </span>
            </div>
            <label>
              {t('name')}
              <input name="name" defaultValue={state.user.name} maxLength={200} required />
            </label>
            {isCoach && (
              <>
                <label>
                  {t('email')}
                  <input type="email" value={state.user.email} readOnly dir="ltr" />
                </label>
                <label>
                  {t('phone')}
                  <input
                    name="phone"
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    defaultValue={state.user.phone || ''}
                    required
                    maxLength={40}
                    placeholder="+972501234567"
                  />
                  <small>{t('coachContactHint')}</small>
                </label>
              </>
            )}
            {!isCoach && (
              <>
                <div className="form-grid">
                  <label>
                    {t('birthYear')}
                    <WheelInput
                      name="birthYear"
                      label={t('birthYear')}
                      options={birthYears}
                      defaultValue={p?.birthYear}
                      center={1995}
                      min={1900}
                      max={thisYear}
                      step={1}
                    />
                  </label>
                  <label>
                    {t('heightCm')}
                    <WheelInput
                      name="heightCm"
                      label={t('heightCm')}
                      options={heightOptions}
                      defaultValue={p?.heightCm}
                      center={170}
                      min={50}
                      max={260}
                      step={0.1}
                    />
                  </label>
                  <label>
                    {t('logWeight')}
                    <WheelInput
                      name="weightKg"
                      label={t('logWeight')}
                      options={weightOptions}
                      defaultValue={latestWeight}
                      center={70}
                      min={0.1}
                      max={700}
                      step={0.1}
                    />
                  </label>
                </div>
                <label>
                  {t('dietary')}
                  <textarea name="dietary" maxLength={500} defaultValue={p?.dietary || ''} />
                </label>
                <label>
                  {t('limitations')}
                  <textarea
                    name="limitations"
                    maxLength={500}
                    defaultValue={p?.limitations || ''}
                  />
                </label>
              </>
            )}
          </section>
          <div>
            <section className="panel">
              <h2>{t('settings')}</h2>
              <div className="form-grid">
                <label>
                  {t('language')}
                  <select name="language" defaultValue={lang}>
                    <option value="en">English</option>
                    <option value="he">עברית</option>
                  </select>
                </label>
                <label>
                  {t('theme')}
                  <select name="theme" defaultValue={state.user.theme}>
                    <option value="light">{t('light')}</option>
                    <option value="dark">{t('dark')}</option>
                  </select>
                </label>
                {!isCoach && (
                  <label>
                    {t('units')}
                    <select name="units" defaultValue={p?.units || 'metric'}>
                      <option value="metric">{t('metricUnits')}</option>
                      <option value="imperial">{t('imperial')}</option>
                    </select>
                  </label>
                )}
              </div>
              <label>
                {t('timezone')}
                <select name="timezone" defaultValue={timezone} required dir="ltr">
                  {timezones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="reminders" defaultChecked={p?.reminders ?? true} />
                {t('reminders')}
              </label>
            </section>
            {state.entitlements.ai ? (
              <section className="panel">
                <h2>{t('privacy')}</h2>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="aiConsent"
                    defaultChecked={p?.aiConsent || false}
                  />
                  {t('aiConsent')}
                </label>
                <p className="muted small-copy">{t('aiDisclaimer')}</p>
              </section>
            ) : (
              // Keep an earlier AI consent intact while the plan has no AI.
              p?.aiConsent && <input type="hidden" name="aiConsent" value="on" />
            )}
            <div className="form-actions">
              <Submit>{t(onboarding ? 'getStarted' : 'save')}</Submit>
            </div>
          </div>
        </div>
      </Form>
      {!onboarding && (
        <>
          <section className="panel">
            <h2 className="danger-text">{t('resetData')}</h2>
            <p className="muted">{t('resetDataHint')}</p>
            <button
              className="button danger"
              onClick={() => {
                setResetConfirmed(false);
                setResetting(true);
              }}
            >
              {t('resetData')}
            </button>
          </section>
          <section className="panel sharing-panel">
            <h2>{t('sharing')}</h2>
            <p className="muted">{t('sharingHint')}</p>
            {state.relationships
              .filter((r) => r.clientId === state.user.id)
              .map((r) => (
                <div className="list-row" key={r.id}>
                  <BrandMark coachId={r.coach.id} name={r.coach.name} branding={r.coach.branding} />
                  <div className="grow">
                    <strong>{r.coach.name}</strong>
                    <small>{t(r.status)}</small>
                    {r.status === 'ACTIVE' && <CoachContact coach={r.coach} />}
                  </div>
                  {r.status === 'PENDING' ? (
                    <div className="row wrap">
                      <button
                        className="button primary"
                        onClick={() =>
                          run('clients/respond', { id: r.id, accept: true }).catch(() => {})
                        }
                      >
                        {t('accept')}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          run('clients/respond', { id: r.id, accept: false }).catch(() => {})
                        }
                      >
                        {t('decline')}
                      </button>
                    </div>
                  ) : (
                    r.status === 'ACTIVE' && (
                      <button
                        className="button secondary"
                        onClick={() => run('clients/revoke', { id: r.id }).catch(() => {})}
                      >
                        {t('revoke')}
                      </button>
                    )
                  )}
                </div>
              ))}
          </section>
          <section className="panel">
            <div className="row wrap between">
              <div>
                <h2>{t('privacy')}</h2>
                <p className="muted small-copy">{state.user.email}</p>
              </div>
              <div className="row wrap">
                <a href="/api/export" className="button secondary">
                  <Download size={16} />
                  {t('download')}
                </a>
                <button className="button secondary" onClick={() => navigate('billing')}>
                  <Wallet size={16} />
                  {t('billing')}
                </button>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await run('auth/logout', {}, true);
                      location.replace(
                        document.documentElement.dataset.nativeShell ? '/phone-session' : '/auth',
                      );
                    } catch {}
                  }}
                >
                  <LogOut size={16} />
                  {t('logout')}
                </button>
                <button className="text-button danger-text" onClick={() => setDeleting(true)}>
                  {t('deleteAccount')}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
      {resetting && (
        <Modal
          title={t('resetData')}
          role="alertdialog"
          dismissOnBackdrop={false}
          onClose={() => {
            if (!resetBusy) setResetting(false);
          }}
        >
          <p className="danger-text">{t('resetDataWarning')}</p>
          <p>{t('resetDataKeeps')}</p>
          <Form
            onSubmit={async (f) => {
              if (!resetConfirmed || resetBusy) return;
              setResetBusy(true);
              try {
                await run('account/reset', { password: f.get('password'), confirmed: true }, true);
                setResetting(false);
                navigate('onboarding');
              } finally {
                setResetBusy(false);
              }
            }}
          >
            <label>
              {t('password')}
              <input
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                disabled={resetBusy}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={resetConfirmed}
                onChange={(e) => setResetConfirmed(e.target.checked)}
                disabled={resetBusy}
              />
              {t('resetDataConfirm')}
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={resetBusy}
                onClick={() => setResetting(false)}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="button danger"
                disabled={!resetConfirmed || resetBusy}
              >
                {resetBusy && <Loader2 className="spin" size={16} />}
                {t('resetDataAction')}
              </button>
            </div>
          </Form>
        </Modal>
      )}
      {deleting && (
        <Modal title={t('deleteAccount')} onClose={() => setDeleting(false)}>
          <p>{t('deleteHint')}</p>
          <Form
            onSubmit={async (f) => {
              await run('account/delete', { password: f.get('password') }, true);
              location.replace(
                document.documentElement.dataset.nativeShell ? '/phone-session' : '/auth',
              );
            }}
          >
            <label>
              {t('password')}
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <button className="button danger">{t('deleteAccount')}</button>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function BillingView() {
  const [loaded, setLoaded] = useState(false);
  const { state, t, lang, formatDate } = useNutri(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [payments, setPayments] = useState<
      { id: string; amount: number; currency: string; status: string; createdAt: string }[]
    >([]);
  useEffect(() => {
    let active = true;
    api<{ payments: typeof payments }>('billing/info')
      .then((r) => {
        if (active) setPayments(r.payments);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'billingUnavailable');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function redirect(action: string, tier?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ url: string }>(`billing/${action}`, { tier });
      location.href = result.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'billingUnavailable');
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={t('billing')} subtitle={t('membershipSub')}>
        {state.subscription?.customerId && (
          <button className="button secondary" disabled={busy} onClick={() => redirect('portal')}>
            {t('manageBilling')}
            <ArrowUpRight size={16} />
          </button>
        )}
      </PageHeading>
      <div className="integration-notice">
        <Shield size={22} />
        <p>{t(state.integrations.billing ? 'checkoutHint' : 'providerDisabled')}</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="pricing-cards">
        {['free', 'premium', ...(state.user.role === 'COACH' ? ['coachTier'] : [])].map(
          (key, i) => {
            const tier = i === 0 ? 'FREE' : i === 1 ? 'PREMIUM' : 'COACH',
              current = state.entitlements.plan === tier,
              price = tier === 'FREE' ? 0 : PLAN_PRICE_USD[tier];
            return (
              <section className={`panel pricing-card ${current ? 'current' : ''}`} key={key}>
                <Wallet size={26} />
                <h2>{t(key)}</h2>
                <strong className="price">
                  {price ? (
                    <>
                      ${price}
                      <small> {t('perMonth')}</small>
                    </>
                  ) : (
                    t('free')
                  )}
                </strong>
                <p>
                  {t(i === 0 ? 'freeDetail' : i === 1 ? 'plusDetail' : 'coachDetail')}
                  {i === 0 && ` · ${t('freeDetail2')}`}
                </p>
                {i > 0 && !state.integrations.billing && <small>{t('billingPending')}</small>}
                {current ? (
                  <span className="badge">{t('currentPlan')}</span>
                ) : i > 0 ? (
                  <button
                    className="button primary"
                    disabled={!state.integrations.billing || busy}
                    onClick={() => redirect('checkout', tier)}
                  >
                    {t(state.integrations.billing ? 'secureCheckout' : 'notConfigured')}
                  </button>
                ) : null}
              </section>
            );
          },
        )}
      </div>
      <div className="billing-summary">
        <section className="panel">
          <h2>{t('status')}</h2>
          <p>
            {t(
              state.subscription?.tier === 'COACH'
                ? 'coachTier'
                : state.subscription?.tier === 'PREMIUM'
                  ? 'premium'
                  : 'free',
            )}{' '}
            · {t(state.subscription?.status || 'ACTIVE')}
          </p>
          {state.subscription?.currentPeriodEnd && (
            <small>
              {t('renews')}: {formatDate(String(state.subscription.currentPeriodEnd))}
            </small>
          )}
        </section>
        <section className="panel">
          <h2>{t('invoices')}</h2>
          {!loaded ? (
            <LoadingCards count={1} />
          ) : payments.length ? (
            payments.map((p) => (
              <div key={p.id} className="list-row">
                <span className="grow">
                  {formatDate(p.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <strong>
                  {new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
                    style: 'currency',
                    currency: p.currency,
                  }).format(p.amount / 100)}
                </strong>
                <span className="badge neutral">{t(p.status)}</span>
              </div>
            ))
          ) : (
            <Empty text={t(error ? 'billingHistoryUnavailable' : 'noPaymentsYet')} />
          )}
        </section>
        <PromoRedeem />
      </div>
    </>
  );
}
export function BrandingView() {
  const { state, t, run } = useNutri(),
    [color, setColor] = useState(state.branding?.color || '#16715b'),
    [business, setBusiness] = useState(state.branding?.businessName || state.user.name),
    [welcome, setWelcome] = useState(state.branding?.welcome || ''),
    [logoBusy, setLogoBusy] = useState(false),
    [logoError, setLogoError] = useState(''),
    [backgroundBusy, setBackgroundBusy] = useState(false),
    [backgroundError, setBackgroundError] = useState('');
  if (state.user.role !== 'COACH') return <Empty text={t('forbidden')} />;
  const logoAt = state.branding?.logoAt;
  const backgroundAt = state.branding?.backgroundAt;
  async function changeBackground(file: File | null) {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    setBackgroundError('');
    try {
      if (file) await run('branding/background', { image: await encodeBackground(file) });
      else await run('branding/background/delete', {});
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      setBackgroundBusy(false);
    }
  }
  async function changeLogo(file: File | null) {
    if (logoBusy) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      if (file) await run('branding/logo', { image: await encodeLogo(file) });
      else await run('branding/logo/delete', {});
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      setLogoBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={t('branding')} subtitle={t('brandingSub')} />
      <div className="two-column">
        <section className="panel">
          <Form
            onSubmit={async () => {
              await run('branding', { businessName: business, color, welcome });
            }}
          >
            <label>
              {t('businessName')}
              <input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              {t('brandColor')}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label>
              {t('welcomeMessage')}
              <textarea
                value={welcome}
                maxLength={1000}
                onChange={(e) => setWelcome(e.target.value)}
              />
            </label>
            <Submit />
          </Form>
          <div className="brand-logo-field">
            <strong>{t('brandLogo')}</strong>
            <p className="muted small-copy">{t('brandLogoHint')}</p>
            <div className="row wrap">
              <label className="button secondary" aria-disabled={logoBusy}>
                {logoBusy ? <Loader2 size={16} className="spin" /> : <ImagePlus size={16} />}
                {t(logoAt ? 'replaceLogo' : 'uploadLogo')}
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void changeLogo(file);
                  }}
                />
              </label>
              {logoAt && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={logoBusy}
                  onClick={() => void changeLogo(null)}
                >
                  <Trash2 size={16} />
                  {t('removeLogo')}
                </button>
              )}
            </div>
            {logoError && (
              <p className="form-error" role="alert">
                {t(logoError)}
              </p>
            )}
          </div>
          <div className="brand-logo-field">
            <strong>{t('brandBackground')}</strong>
            <p className="muted small-copy">{t('brandBackgroundHint')}</p>
            <div className="row wrap">
              <label className="button secondary" aria-disabled={backgroundBusy}>
                {backgroundBusy ? <Loader2 size={16} className="spin" /> : <ImagePlus size={16} />}
                {t(backgroundAt ? 'replaceBackground' : 'uploadBackground')}
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={backgroundBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void changeBackground(file);
                  }}
                />
              </label>
              {backgroundAt && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={backgroundBusy}
                  onClick={() => void changeBackground(null)}
                >
                  <Trash2 size={16} />
                  {t('removeBackground')}
                </button>
              )}
            </div>
            {backgroundError && (
              <p className="form-error" role="alert">
                {t(backgroundError)}
              </p>
            )}
          </div>
        </section>
        <section
          className={`brand-preview panel ${backgroundAt ? 'has-background' : ''}`}
          style={
            {
              borderTop: `5px solid ${color}`,
              ...(backgroundAt && {
                '--brand-background': `url("${brandBackgroundUrl(state.user.id, backgroundAt)}")`,
              }),
            } as CSSProperties
          }
        >
          <span className="eyebrow">{t('preview')}</span>
          {logoAt ? (
            <BrandMark
              coachId={state.user.id}
              name={business}
              branding={{ color, logoAt }}
              className="brand-preview-icon"
            />
          ) : (
            <div className="brand-preview-icon" style={{ background: color }}>
              <Leaf size={30} />
            </div>
          )}
          <h2>{business}</h2>
          <p>{welcome}</p>
          <span className="muted small-copy">Fitura+</span>
        </section>
      </div>
    </>
  );
}
type AdminData = {
  users: { id: string; name: string; email: string; role: string }[];
  flags: { key: string; enabled: boolean }[];
  audit: { id: string; action: string; createdAt: string }[];
};
export function AdminView() {
  const { t, run, state } = useNutri(),
    [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<AdminData>('admin')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (state.user.role !== 'ADMIN') return <Empty text={t('forbidden')} />;
  return (
    <>
      <PageHeading title={t('admin')} />
      {error && <p>{t(error)}</p>}
      {data && (
        <>
          <section className="panel">
            <h2>{t('users')}</h2>
            {data.users.map((u) => (
              <div className="list-row" key={u.id}>
                <strong>{u.name}</strong>
                <span className="grow">{u.email}</span>
                <span className="badge neutral">{u.role}</span>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>{t('systemConfig')}</h2>
            {data.flags.map((f) => (
              <label className="checkbox-label" key={f.key}>
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    try {
                      await run('admin/flag', { key: f.key, enabled });
                      setData({
                        ...data,
                        flags: data.flags.map((v) => (v.key === f.key ? { ...v, enabled } : v)),
                      });
                    } catch {}
                  }}
                />
                {t(f.key)}
              </label>
            ))}
          </section>
        </>
      )}
    </>
  );
}
