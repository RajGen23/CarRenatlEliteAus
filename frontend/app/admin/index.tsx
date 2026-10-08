import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";

export default function AdminIndex() {
  useEffect(() => { router.replace("/admin/dashboard"); }, []);
  return <View />;
}
