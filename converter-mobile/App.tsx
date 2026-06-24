import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen    from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors, fontSize, fontWeight } from './src/theme';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card:       colors.surface,
    text:       colors.text,
    border:     colors.border,
    primary:    colors.accent,
    notification: colors.accent,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor:  colors.surface,
              borderTopColor:   colors.border,
              borderTopWidth:   1,
              height:           60,
              paddingBottom:    8,
              paddingTop:       6,
            },
            tabBarActiveTintColor:   colors.accent,
            tabBarInactiveTintColor: colors.dim,
            tabBarLabelStyle: {
              fontSize:   fontSize.xs,
              fontWeight: fontWeight.medium,
            },
            tabBarIcon: ({ focused, color, size }) => {
              const icons: Record<string, [string, string]> = {
                Converter: ['flash',          'flash-outline'],
                Ajustes:   ['settings',       'settings-outline'],
              };
              const [active, inactive] = icons[route.name] ?? ['help', 'help-outline'];
              return (
                <Ionicons
                  name={(focused ? active : inactive) as 'flash'}
                  size={size}
                  color={color}
                />
              );
            },
          })}
        >
          <Tab.Screen name="Converter" component={HomeScreen}     />
          <Tab.Screen name="Ajustes"   component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
