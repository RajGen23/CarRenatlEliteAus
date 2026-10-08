import React, { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/AuthContext";
import { colors } from "@/src/theme";

function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.92)" }]} />
      {Platform.OS !== "web" ? (
        <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.topBorder} />
    </View>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading]);

  if (!user) return null;

  // Base content height for tab icons + labels, plus device bottom inset for
  // gesture/3-button nav bars on Android & iOS home indicator.
  const baseContent = 64;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 12 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelPosition: "below-icon",
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          position: "absolute",
          height: baseContent + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          paddingHorizontal: 4,
          elevation: 0,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 2,
          paddingVertical: 2,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 2,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 9.5,
          lineHeight: 12,
          letterSpacing: 0.8,
          fontFamily: "Manrope_700Bold",
          textTransform: "uppercase",
          textAlign: "center",
          marginTop: 2,
          marginBottom: 0,
          paddingHorizontal: 0,
          includeFontPadding: false,
          width: "100%",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Garage",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "diamond" : "diamond-outline"} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cars"
        options={{
          title: "Fleet",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "car-sport" : "car-sport-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  topBorder: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.border },
});
