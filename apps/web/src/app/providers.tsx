import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { AudioProvider } from "../features/audio/audio-provider";
import { I18nProvider } from "../i18n/i18n-provider";
import { queryClient } from "../lib/query-client";
import { UiProvider } from "./ui-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <UiProvider>
          <AudioProvider>{children}</AudioProvider>
        </UiProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
