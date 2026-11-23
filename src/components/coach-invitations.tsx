'use client';

import { useState } from 'react';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { useNutri } from './workspace';
import { BrandMark } from './brand-logo';

export function CoachInvitations() {
  const { state, t, run } = useNutri();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const invitations = state.relationships.filter(
    (link) => link.clientId === state.user.id && link.status === 'PENDING',
  );
  if (!invitations.length) return null;

  async function respond(id: string, accept: boolean) {
    if (pendingId) return;
    setPendingId(id);
    setError(null);
    try {
      await run('clients/respond', { id, accept });
    } catch (cause) {
      setError({ id, message: cause instanceof Error ? cause.message : 'serverError' });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="coach-invitations" aria-label={t('coachInvitations')}>
      <div className="coach-invitations-heading">
        <span className="coach-invite-icon" aria-hidden="true">
          <UserPlus size={24} />
        </span>
        <div>
          <span className="coach-invite-eyebrow">{t('actionRequired')}</span>
          <h2>
            {t('coachInvitations')} <span className="coach-invite-count">{invitations.length}</span>
          </h2>
          <p>{t('coachInvitationHint')}</p>
        </div>
      </div>
      {invitations.map((invitation) => (
        <article
          className="coach-invitation-card"
          key={invitation.id}
          aria-label={invitation.coach.name}
          aria-busy={pendingId === invitation.id}
        >
          <div className="coach-invitation-person">
            <BrandMark
              coachId={invitation.coach.id}
              name={invitation.coach.name}
              branding={invitation.coach.branding}
              className="avatar coach-invitation-logo"
            />
            <div>
              {invitation.coach.branding?.businessName &&
                invitation.coach.branding.businessName !== invitation.coach.name && (
                  <span className="coach-invitation-business">
                    {invitation.coach.branding.businessName}
                  </span>
                )}
              <strong>{invitation.coach.name}</strong>
              <span className="coach-invitation-email" dir="ltr">
                {invitation.coach.email}
              </span>
            </div>
          </div>
          {invitation.coach.branding?.welcome && (
            <p className="coach-invitation-welcome">{invitation.coach.branding.welcome}</p>
          )}
          <p className="coach-invitation-consent">{t('coachInvitationConsent')}</p>
          <div className="coach-invitation-actions">
            <button
              type="button"
              className="button primary"
              disabled={!!pendingId}
              onClick={() => void respond(invitation.id, true)}
            >
              {pendingId === invitation.id ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {t('accept')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!!pendingId}
              onClick={() => void respond(invitation.id, false)}
            >
              <X size={16} />
              {t('decline')}
            </button>
          </div>
          {error?.id === invitation.id && (
            <p className="form-error coach-invitation-error" role="alert">
              {t(error.message)}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
