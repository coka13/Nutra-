'use client';
import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Loader2, Send, Ticket } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Empty, PageHeading, useNutri } from './workspace';
import { LoadingCards } from './loading-cards';

type SupportTicket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; authorType: 'USER' | 'ADMIN'; body: string; createdAt: string }[];
};
const CATEGORIES = ['SUPPORT', 'BUG', 'FEATURE', 'COMPLAINT', 'REPORT'] as const;

/** User-facing help desk: create requests, read replies and answer them. */
export function SupportView() {
  const { state, t, formatDate } = useNutri();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null),
    [open, setOpen] = useState<string | null>(null),
    [category, setCategory] = useState<(typeof CATEGORIES)[number]>('SUPPORT'),
    [reported, setReported] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setTickets((await api<{ tickets: SupportTicket[] }>('support')).tickets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
      setTickets([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // Reports may only concern accounts the user is linked with (coach or client).
  const linked = state.relationships
    .map((link) => (link.coachId === state.user.id ? link.client : link.coach))
    .filter((person, index, all) => person && all.findIndex((p) => p.id === person.id) === index);

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('support', {
        action: 'create',
        category,
        subject: String(data.get('subject') || ''),
        body: String(data.get('body') || ''),
        reportedUserId: category === 'REPORT' || category === 'COMPLAINT' ? reported || null : null,
      });
      form.reset();
      setNotice(t('requestSent'));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  async function reply(ticketId: string, form: HTMLFormElement) {
    const body = String(new FormData(form).get('reply') || '').trim();
    if (!body) return;
    setBusy(true);
    try {
      await api('support', { action: 'reply', ticketId, body });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={t('helpSupport')} subtitle={t('supportSub')} />
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {notice && (
        <p className="integration-notice" role="status">
          {notice}
        </p>
      )}
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <LifeBuoy size={18} /> {t('newRequest')}
            </h2>
          </div>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void create(e.currentTarget);
            }}
          >
            <label>
              {t('requestType')}
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t('category' + c)}
                  </option>
                ))}
              </select>
            </label>
            {(category === 'REPORT' || category === 'COMPLAINT') && linked.length > 0 && (
              <label>
                {t('reportAbout')}
                <select value={reported} onChange={(e) => setReported(e.target.value)}>
                  <option value="">—</option>
                  {linked.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t('subject')}
              <input name="subject" required minLength={3} maxLength={160} />
            </label>
            <label>
              {t('describeRequest')}
              <textarea name="body" required minLength={5} maxLength={5000} rows={5} />
            </label>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />} {t('sendRequest')}
              </button>
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Ticket size={18} /> {t('yourRequests')}
            </h2>
          </div>
          {tickets === null ? (
            <LoadingCards count={2} />
          ) : !tickets.length ? (
            <Empty text={t('noRequests')} />
          ) : (
            tickets.map((ticket) => (
              <div key={ticket.id} className="support-ticket">
                <button className="list-row" aria-expanded={open === ticket.id} onClick={() => setOpen(open === ticket.id ? null : ticket.id)}>
                  <span className="grow">
                    <strong>{ticket.subject}</strong>
                    <small className="muted"> · {t('category' + ticket.category)}</small>
                  </span>
                  <span className="badge neutral">{t('ticket' + ticket.status)}</span>
                </button>
                {open === ticket.id && (
                  <div className="support-thread">
                    {ticket.messages.map((m) => (
                      <p key={m.id} className={m.authorType === 'ADMIN' ? 'support-message staff' : 'support-message'}>
                        <small>
                          {t(m.authorType === 'ADMIN' ? 'supportTeam' : 'you')} · {formatDate(m.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </small>
                        {m.body}
                      </p>
                    ))}
                    {ticket.status !== 'CLOSED' && (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void reply(ticket.id, e.currentTarget);
                        }}
                      >
                        <input className="grow" name="reply" maxLength={5000} placeholder={t('replyPlaceholder')} aria-label={t('replyPlaceholder')} />
                        <button className="button secondary" disabled={busy}>
                          {t('sendReply')}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

/** Redeems an administrator-issued promotion code (complimentary access, no payment). */
export function PromoRedeem() {
  const { t, formatDate, refresh } = useNutri();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="panel">
      <h2>{t('promoCode')}</h2>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const code = String(new FormData(form).get('code') || '').trim();
          if (!code) return;
          setBusy(true);
          setMessage(null);
          try {
            const { grant } = await api<{ grant: { endsAt: string } }>('promo', { code });
            setMessage({ ok: true, text: t('promoRedeemed').replace('{date}', formatDate(grant.endsAt)) });
            form.reset();
            await refresh();
          } catch (cause) {
            setMessage({ ok: false, text: t(cause instanceof Error ? cause.message : 'serverError') });
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className="grow" name="code" maxLength={32} autoComplete="off" aria-label={t('promoCode')} style={{ textTransform: 'uppercase' }} />
        <button className="button secondary" disabled={busy}>
          {t('redeem')}
        </button>
      </form>
      {message && (
        <p className={message.ok ? 'muted small-copy' : 'form-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
