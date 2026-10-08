import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirm dialog. On web Alert.alert buttons sometimes don't
 * dispatch the destructive press handler, so we fall back to window.confirm.
 * Resolves true if the user confirmed, false otherwise.
 */
export function confirm(
  title: string,
  message: string,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const ok = window.confirm(`${title}\n\n${message}`);
      resolve(ok);
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
