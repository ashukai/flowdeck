import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { C } from '@/theme'

// Make the app fill the whole browser window (Chrome/Safari on Mac).
// RNW's default reset doesn't always pin #root to the viewport in dev.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent =
    'html,body{height:100%;width:100%;margin:0;padding:0;overflow:hidden;background:' + C.bg + '}' +
    '#root{height:100%;width:100%;display:flex;flex-direction:column}'
  document.head.appendChild(style)
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="flow/[id]/board" options={{ headerShown: false }} />
          <Stack.Screen name="flow/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="flow/[id]/edit" options={{ title: 'Edit flow' }} />
          <Stack.Screen name="flow/[id]/step/[stepId]" options={{ title: 'Step', presentation: 'card' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
