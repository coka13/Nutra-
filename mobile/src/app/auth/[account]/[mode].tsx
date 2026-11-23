import { Redirect, useLocalSearchParams } from 'expo-router';
import { AuthScreen } from '../../../auth-screens';

export default function AccountRoute() {
  const { account, mode } = useLocalSearchParams<{ account: string; mode: string }>();
  if (
    (account !== 'user' && account !== 'coach') ||
    (mode !== 'login' && mode !== 'register' && mode !== 'recover')
  )
    return <Redirect href="/" />;
  return <AuthScreen key={`${account}:${mode}`} account={account} mode={mode} />;
}
