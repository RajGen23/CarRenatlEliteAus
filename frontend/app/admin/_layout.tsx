import React, { useEffect } from "react";
import { Slot, router } from "expo-router";
import { useAuth } from "@/src/AuthContext";

export default function AdminLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "admin") router.replace("/(tabs)/home");
    }
  }, [user, loading]);

  if (loading || !user || user.role !== "admin") return null;

  return <Slot />;
}
