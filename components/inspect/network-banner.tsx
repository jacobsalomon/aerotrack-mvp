"use client";

// Red banner shown when the device loses internet connection.
// Disables write actions in the inspection workspace until reconnected.

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state from browser
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

export default function NetworkBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-50">
      <WifiOff className="h-4 w-4" />
      No internet connection — connect to continue
    </div>
  );
}
