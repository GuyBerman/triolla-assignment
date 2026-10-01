import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DashboardScreen } from './src/screens/DashboardScreen';
import { FridgeDetailScreen } from './src/screens/FridgeDetailScreen';
import { InspectorScreen } from './src/screens/InspectorScreen';
import { UploadScreen } from './src/screens/UploadScreen';
import type {
  FridgesStackParamList,
  InspectorStackParamList,
  RootTabParamList,
} from './src/navigation/types';
import { colors } from './src/theme';

const FridgesStack = createNativeStackNavigator<FridgesStackParamList>();
const InspectorStack = createNativeStackNavigator<InspectorStackParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();

const headerStyle = {
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { color: colors.text },
  headerTintColor: colors.accent,
} as const;

function FridgesNavigator() {
  return (
    <FridgesStack.Navigator screenOptions={headerStyle}>
      <FridgesStack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Fridges' }}
      />
      <FridgesStack.Screen
        name="FridgeDetail"
        component={FridgeDetailScreen}
        options={({ route }) => ({ title: route.params.fridgeName })}
      />
    </FridgesStack.Navigator>
  );
}

function InspectorNavigator() {
  return (
    <InspectorStack.Navigator screenOptions={headerStyle}>
      <InspectorStack.Screen
        name="InspectorReport"
        component={InspectorScreen}
        options={{ title: 'Inspector report' }}
      />
    </InspectorStack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tabs.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          }}
        >
          <Tabs.Screen
            name="FridgesTab"
            component={FridgesNavigator}
            options={{
              title: 'Fridges',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="thermometer-outline" color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="UploadTab"
            component={UploadScreen}
            options={{
              title: 'Upload',
              headerShown: true,
              ...headerStyle,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="cloud-upload-outline" color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="InspectorTab"
            component={InspectorNavigator}
            options={{
              title: 'Inspector',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="document-text-outline" color={color} size={size} />
              ),
            }}
          />
        </Tabs.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
