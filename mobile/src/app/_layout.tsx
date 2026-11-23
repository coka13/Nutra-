import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PhoneSettings, usePhone } from '../settings';
import { WorkspaceHost } from '../workspace-host';

export default function RootLayout() {
  return (
    <PhoneSettings>
      <Navigation />
    </PhoneSettings>
  );
}
function Navigation() {
  const { colors, darkMode } = usePhone();
  return (
    <WorkspaceHost>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </WorkspaceHost>
  );
}
