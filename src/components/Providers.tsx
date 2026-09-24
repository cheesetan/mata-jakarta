"use client";

import { PlaybackTicker } from "@/components/PlaybackTicker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlaybackTicker />
      {children}
    </>
  );
}
