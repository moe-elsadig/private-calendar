// src/hooks/useSync.ts
import { useState, useCallback } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { pushChangesToGoogle } from "../sync/pushChanges";
import { pullChangesFromGoogle } from "../sync/pullChanges";

export const useSync = () => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(
        localStorage.getItem("lastSyncTime")
    );

    const performSync = useCallback(async (accessToken: string) => {
        setIsSyncing(true);
        setError(null);
        try {
            console.log("Starting Sync...");
            // Run Push and Pull concurrently
            // Usually safest to Push first (save our work), then Pull (get updates)
            // Or Pull first (update view), then Push.
            // Concurrency: If we push a 'created', getting it back in Pull might duplicat if timing is off sync token not used.
            // But our 'syncStatus' logic helps.

            await Promise.all([
                pushChangesToGoogle(accessToken),
                pullChangesFromGoogle(accessToken),
            ]);

            const now = new Date().toISOString();
            setLastSyncTime(now);
            localStorage.setItem("lastSyncTime", now);
            console.log("Sync Complete");
        } catch (err: any) {
            console.error("Sync Failed", err);
            setError(err.message || "Sync Failed");
        } finally {
            setIsSyncing(false);
        }
    }, []);

    // OAuth Login Trigger
    const loginAndSync = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            performSync(tokenResponse.access_token);
        },
        onError: () => setError("Google Login Failed"),
        scope: "https://www.googleapis.com/auth/calendar.events", // Critical Scope
    });

    return {
        sync: loginAndSync, // Expose the login trigger as the sync button
        isSyncing,
        lastSyncTime,
        error,
    };
};
