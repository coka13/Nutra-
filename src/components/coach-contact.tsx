'use client';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { isInternationalPhone, normalizePhone } from '@/lib/phone';
import { useNutri } from './workspace';

export function CoachContact({ coach }: { coach: { email: string; phone: string | null } }) {
  const { t } = useNutri();
  const phone =
    coach.phone && isInternationalPhone(coach.phone) ? normalizePhone(coach.phone) : null;
  return (
    <div className="coach-contact">
      <a className="text-button" href={`mailto:${coach.email}`}>
        <Mail size={15} />
        <span dir="ltr">{coach.email}</span>
      </a>
      {phone && (
        <>
          <a
            className="text-button"
            href={`tel:${phone}`}
            aria-label={`${t('callCoach')} ${phone}`}
          >
            <Phone size={15} />
            <span dir="ltr">{phone}</span>
          </a>
          <a
            className="text-button"
            href={`https://wa.me/${phone.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={15} />
            {t('whatsapp')}
          </a>
        </>
      )}
    </div>
  );
}
