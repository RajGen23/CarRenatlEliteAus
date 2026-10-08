import { useEffect, useState } from "react";

import { api } from "@/src/api";

export type AppConfig = {
  demo_mode: boolean;
  demo_payments: boolean;
  welcome_credit: number;
};

const FALLBACK: AppConfig = { demo_mode: false, demo_payments: false, welcome_credit: 0 };

let cached: Promise<AppConfig> | null = null;

export function loadAppConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = api.get<AppConfig>("/config").catch(() => {
      cached = null;
      return FALLBACK;
    });
  }
  return cached;
}

/** Server flags that decide whether demo-only UI (demo logins, simulated top-ups) is shown. */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(FALLBACK);
  useEffect(() => {
    let alive = true;
    loadAppConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
