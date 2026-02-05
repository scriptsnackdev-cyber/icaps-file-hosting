import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheOptions<T> {
    persist?: boolean;
    initialData?: T;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: any) => void;
}

export function useActionCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions<T> = {}
) {
    const { persist = true, initialData, enabled = true } = options;
    const [data, setData] = useState<T | null>(initialData || null);
    const [loading, setLoading] = useState<boolean>(!initialData);
    const [error, setError] = useState<any>(null);
    const hasLoadedFromCache = useRef(false);

    // Initial load from cache
    useEffect(() => {
        setData(null);
        setLoading(true);

        if (!persist || typeof window === 'undefined') {
            hasLoadedFromCache.current = true;
            return;
        }

        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                setData(parsed);
                // If we found data in cache, we are not "loading" in the sense of empty UI
                // But we will still fetch fresh data
                setLoading(false);
            } else {
                setData(null);
                setLoading(true);
            }
        } catch (e) {
            console.error(`Failed to parse cache for key ${key}`, e);
            setData(null);
            setLoading(true);
        } finally {
            hasLoadedFromCache.current = true;
        }
    }, [key, persist]);

    const optionsRef = useRef(options);
    useEffect(() => { optionsRef.current = options; }, [options]);

    // Fetch fresh data
    const refresh = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        try {
            const result = await fetcher();
            setData(result);
            if (persist && typeof window !== 'undefined') {
                localStorage.setItem(key, JSON.stringify(result));
            }
            optionsRef.current.onSuccess?.(result);
        } catch (err) {
            console.error(`Fetcher failed for key ${key}`, err);
            setError(err);
            optionsRef.current.onError?.(err);
        } finally {
            setLoading(false);
        }
    }, [key, fetcher, persist]);

    // Construct a composite key for dependencies to avoid infinite loops if fetcher is unstable
    // But ideally fetcher should be stable (useCallback)
    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        // Only fetch after we tried to load from cache
        if (hasLoadedFromCache.current) {
            refresh(!!data); // silent if we have data
        } else {
            // Fallback for non-persisted or server-side
            refresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, refresh, enabled]); // Intentionally excluding data to avoid loop, relying on refresh stability

    return { data, loading, error, refresh, setData };
}

/**
 * Global prefetch helper to warm the cache
 */
export async function prefetchAction<T>(key: string, fetcher: () => Promise<T>) {
    try {
        const result = await fetcher();
        if (typeof window !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(result));
        }
        return result;
    } catch (e) {
        console.warn(`Prefetch failed for key ${key}`, e);
        return null;
    }
}
