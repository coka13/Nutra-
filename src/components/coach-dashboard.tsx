'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Dumbbell, MessageSquare, Users, Utensils } from 'lucide-react';
import { api, Empty, PageHeading, useNutri } from './workspace';
import { LoadingCards } from './loading-cards';

type LiveSession = {
  id: string;
  userId: string;
  name: string;
  status: string;
  completed: number;
  total: number;
};

export function CoachDashboard() {
  const { state, t, navigate, formatDate } = useNutri();
  const [live, setLive] = useState<LiveSession[]>();
  const [error, setError] = useState('');
  const clients = state.relationships.filter(
    (link) => link.coachId === state.user.id && link.status === 'ACTIVE',
  );
  const assigned = state.programs.filter((plan) =>
    clients.some((link) => link.clientId === plan.assignedClientId),
  );
  const next = state.appointments
    .filter((item) => item.status === 'BOOKED' && +new Date(item.startsAt) >= Date.now())
    .slice(0, 4);
  useEffect(() => {
    let current = true;
    function update() {
      if (document.hidden) return;
      api<LiveSession[]>('coach/active-workouts')
        .then((sessions) => {
          if (current) {
            setLive(sessions);
            setError('');
          }
        })
        .catch((cause: Error) => {
          if (current) setError(cause.message);
        });
    }
    update();
    const timer = setInterval(update, 10000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <PageHeading title={t('coachDashboard')} subtitle={state.user.name}>
        <button className="button primary" onClick={() => navigate('clients')}>
          <Users size={17} />
          {t('manageClients')}
        </button>
      </PageHeading>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="panel">
            <h2>{t('coachWork')}</h2>
            <div className="coach-shortcuts">
              {(
                [
                  ['clients', 'clients', Users, clients.length],
                  ['workouts', 'workoutPlans', Dumbbell, assigned.length],
                  ['mealPlans', 'mealPlans', Utensils, state.mealPlans.length],
                  [
                    'messages',
                    'messages',
                    MessageSquare,
                    state.messages.filter(
                      (item) => item.recipientId === state.user.id && !item.readAt,
                    ).length,
                  ],
                ] as const
              ).map(([page, key, Icon, count]) => (
                <button className="button secondary" key={page} onClick={() => navigate(page)}>
                  <Icon size={19} />
                  <span>{t(key)}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>{t('clientsLive')}</h2>
            {error ? (
              <p role="alert">{t(error)}</p>
            ) : !live ? (
              <LoadingCards count={1} />
            ) : !live.length ? (
              <Empty text={t('noClientsLive')} />
            ) : (
              live.map((session) => (
                <div className="list-row" key={session.id}>
                  <span className="grow">
                    <strong>{session.name}</strong>
                    <small>
                      {clients.find((item) => item.clientId === session.userId)?.client.name}
                    </small>
                  </span>
                  <small>
                    {session.completed}/{session.total} {t('sets')}
                  </small>
                </div>
              ))
            )}
          </section>
        </div>
        <section className="panel">
          <div className="section-heading">
            <h2>{t('upcoming')}</h2>
            <button className="text-button" onClick={() => navigate('calendar')}>
              <CalendarDays size={18} />
              {t('viewAll')}
            </button>
          </div>
          {next.length ? (
            next.map((item) => (
              <div className="list-row" key={item.id}>
                <strong>{item.title}</strong>
                <small>
                  {formatDate(item.startsAt, { dateStyle: 'short', timeStyle: 'short' })}
                </small>
              </div>
            ))
          ) : (
            <Empty text={t('noUpcomingMeetings')} />
          )}
        </section>
      </div>
    </>
  );
}
