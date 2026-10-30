import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/src/AuthContext";
import { colors, fonts, radius, spacing } from "@/src/theme";

type NavItem = { href: string; label: string; icon: keyof typeof Ionicons.glyphMap };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      { href: "/admin/dashboard", label: "Overview", icon: "speedometer-outline" },
      { href: "/admin/users", label: "Customers", icon: "people-outline" },
      { href: "/admin/vendors", label: "Vendors", icon: "business-outline" },
      { href: "/admin/vehicles", label: "Vehicles", icon: "car-sport-outline" },
      { href: "/admin/bookings", label: "Bookings", icon: "calendar-outline" },
    ],
  },
  {
    title: "FINANCE",
    items: [
      { href: "/admin/finance", label: "Finance", icon: "cash-outline" },
      { href: "/admin/revenue", label: "Revenue", icon: "trending-up-outline" },
    ],
  },
  {
    title: "GROWTH",
    items: [
      { href: "/admin/coupons", label: "Coupons", icon: "pricetag-outline" },
      { href: "/admin/featured", label: "Featured", icon: "star-outline" },
      { href: "/admin/referrals", label: "Referrals", icon: "gift-outline" },
    ],
  },
  {
    title: "CARE",
    items: [
      { href: "/admin/support", label: "Support", icon: "chatbubbles-outline" },
    ],
  },
];

const COMPACT_WIDTH = 900;

export function AdminShell({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH;
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href as any);
  };

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const sidebar = (
      <View style={[styles.sidebar, compact && styles.sidebarOverlay]}>
        <View style={styles.brandRow}>
          <View style={styles.brandRing}><Text style={styles.brandText}>ER</Text></View>
          <View>
            <Text style={styles.brandName}>EliteReserve</Text>
            <Text style={styles.brandSub}>ADMIN · MELBOURNE</Text>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {NAV_GROUPS.map((g) => (
            <View key={g.title} style={styles.navGroup}>
              <Text style={styles.navGroupTitle}>{g.title}</Text>
              <View style={styles.nav}>
                {g.items.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Pressable
                      key={n.href}
                      testID={`nav-${n.label.toLowerCase()}`}
                      onPress={() => go(n.href)}
                      style={[styles.navItem, active && styles.navItemActive]}
                    >
                      <Ionicons name={n.icon} size={16} color={active ? colors.primary : colors.textMuted} />
                      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{n.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.adminCard}>
          <View style={styles.adminAvatar}>
            <Text style={styles.adminAvatarText}>{user?.name?.[0] ?? "A"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminName} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.adminEmail} numberOfLines={1}>{user?.email}</Text>
          </View>
          <Pressable testID="admin-logout" onPress={doLogout} hitSlop={8} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={16} color={colors.error} />
          </Pressable>
        </View>
      </View>
  );

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {!compact ? sidebar : null}

      <View style={styles.main}>
        <View style={[styles.topBar, compact && styles.topBarCompact]}>
          {compact ? (
            <Pressable
              testID="admin-menu"
              accessibilityLabel="Open menu"
              onPress={() => setMenuOpen(true)}
              style={styles.menuBtn}
            >
              <Ionicons name="menu" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>{title}</Text>
          <View style={{ flex: 1 }} />
          {action}
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>

      {compact && menuOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            testID="admin-menu-backdrop"
            accessibilityLabel="Close menu"
            onPress={() => setMenuOpen(false)}
            style={styles.backdrop}
          />
          {sidebar}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: "#040404" },
  sidebar: {
    width: 240,
    backgroundColor: "#0a0a0a",
    borderRightWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.xl, paddingHorizontal: 6, paddingTop: 6 },
  brandRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandText: { color: colors.primary, fontFamily: fonts.display, fontStyle: "italic", fontSize: 17 },
  brandName: { color: colors.textPrimary, fontFamily: fonts.displayMedium, fontSize: 16, letterSpacing: -0.3 },
  brandSub: { color: colors.textMuted, fontSize: 8, letterSpacing: 1.8, fontFamily: fonts.bodyBold, marginTop: 2 },
  nav: { gap: 2 },
  navGroup: { marginBottom: spacing.md },
  navGroupTitle: { color: colors.textMuted, fontSize: 8, letterSpacing: 2, fontFamily: fonts.bodyBold, paddingHorizontal: 12, marginBottom: 6, opacity: 0.7 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  navItemActive: { backgroundColor: "rgba(212,175,55,0.08)" },
  navLabel: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  navLabelActive: { color: colors.primary, fontFamily: fonts.bodyBold },
  adminCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  adminAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  adminAvatarText: { color: "#000", fontFamily: fonts.bodyBold, fontSize: 14 },
  adminName: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 },
  adminEmail: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.body, marginTop: 1 },
  logoutBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  rootCompact: { flexDirection: "column" },
  sidebarOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, width: 260 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  menuBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  topBarCompact: { paddingHorizontal: spacing.md },
  titleCompact: { fontSize: 18, flexShrink: 1 },
  scrollCompact: { padding: spacing.md },
  main: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  title: { color: colors.textPrimary, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.4 },
  scroll: { padding: spacing.xl, paddingBottom: 80 },
});
