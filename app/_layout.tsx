import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useHydrated } from '../src/store/useTagStore';
import { colors } from '../src/theme';

export default function RootLayout() {
  const hydrated = useHydrated();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {hydrated ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            {/* Everything below sits over the camera as a sheet. */}
            <Stack.Screen
              name="card/[id]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="leaderboard" options={{ presentation: 'modal' }} />
            <Stack.Screen name="events" options={{ presentation: 'modal' }} />
            <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
          </Stack>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.snap} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
