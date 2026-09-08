import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IncomingLinkWatcher } from '../src/components/IncomingLinkWatcher';
import { useHydrated } from '../src/store/useTagStore';
import { colors } from '../src/theme';

export default function RootLayout() {
  const hydrated = useHydrated();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {hydrated ? (
          <>
            {/* One scan shows both people each other. */}
            <IncomingLinkWatcher />
            <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="signin" options={{ animation: 'fade' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            {/* Everything below sits over the camera as a sheet. */}
            <Stack.Screen
              name="card/[id]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
            <Stack.Screen name="leaderboard" options={{ presentation: 'modal' }} />
            <Stack.Screen name="events" options={{ presentation: 'modal' }} />
            <Stack.Screen name="search" options={{ presentation: 'modal' }} />
            {/* Full screen: it's an artwork feed, not a sheet. */}
            <Stack.Screen name="feed" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="event/[id]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="event/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="event/boost" options={{ presentation: 'modal' }} />
            {/* Full screen, not a sheet: it gets held up at a door. */}
              <Stack.Screen name="event/door" options={{ animation: 'fade' }} />
            </Stack>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.snap} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
