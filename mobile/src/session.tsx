import { createContext, useContext } from 'react';

export type Account = 'user' | 'coach';
export type AuthMode = 'login' | 'register' | 'recover';
export type Session = 'user' | 'coach' | 'signed-out' | 'checking' | 'offline';
type ContextValue = {
  session: Session;
  retry: () => void;
  authenticate: (
    account: Account,
    mode: AuthMode,
    values: { email: string; phone?: string; password?: string; name?: string; language: string },
  ) => Promise<void>;
};
export const SessionContext = createContext<ContextValue | null>(null);
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('Missing session provider');
  return context;
}
