import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { api, setAuthSessionHandlers, setAuthTokenProvider } from "./src/lib/api";
import { MeetupScreen } from "./src/screens/MeetupScreen";
import { MembersScreen } from "./src/screens/MembersScreen";
import { RecipesScreen } from "./src/screens/RecipesScreen";
import { StatusScreen } from "./src/screens/StatusScreen";
import { useSessionStore } from "./src/state/session";

const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#f6f0e6",
    card: "#fffaf3",
    text: "#2a2118",
    border: "#d8cab6",
    primary: "#2f5d44",
  },
};

export default function App() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const setActorUserId = useSessionStore((state) => state.setActorUserId);
  const setAccessToken = useSessionStore((state) => state.setAccessToken);
  const setTokenExpiresAt = useSessionStore((state) => state.setTokenExpiresAt);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    setAuthTokenProvider(() => accessToken);
    setAuthSessionHandlers({
      refresh: api.refreshSession,
      onSessionUpdate: (session) => {
        setAccessToken(session.token);
        setTokenExpiresAt(session.expiresAt);
        setActorUserId(session.user.id);
      },
      onUnauthorized: () => {
        clearSession();
      },
    });
  }, [accessToken, clearSession, setAccessToken, setActorUserId, setTokenExpiresAt]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) return;
    api
      .getSession()
      .then((payload) => {
        if (cancelled) return;
        setActorUserId(payload.user.id);
        setTokenExpiresAt(payload.expiresAt);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, setActorUserId, setTokenExpiresAt]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#2f5d44",
            tabBarInactiveTintColor: "#766555",
            tabBarStyle: {
              backgroundColor: "#fffaf3",
              borderTopColor: "#d8cab6",
            },
          }}
        >
          <Tab.Screen name="Home" component={StatusScreen} />
          <Tab.Screen name="Members" component={MembersScreen} />
          <Tab.Screen name="Meetup" component={MeetupScreen} />
          <Tab.Screen name="Recipes" component={RecipesScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
