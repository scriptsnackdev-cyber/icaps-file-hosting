import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheOptions<T> {
    initialData?: T;
    persist?: boolean;
    revalidateOnFocus?: boolean;
    revalidateOnMount?: boolean;
    dedupingInterval?: number; // ms
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    enabled?: boolean;
}

interface CacheState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    timestamp: number;
}

export function useActionCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions<T> = {}
) {
    const {
        initialData = null,
        persist = true,
        revalidateOnMount = true,
        dedupingInterval = 2000,
        onSuccess,
        onError,
        enabled = true
    } = options;

    const [state, setState] = useState<CacheState<T>>({
        data: initialData,
        loading: revalidateOnMount && enabled,
        error: null,
        timestamp: 0
    });

    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        if (!persist) return;

        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                setState(prev => ({
                    ...prev,
                    data: parsed.data,
                    timestamp: parsed.timestamp || 0
                }));
            }
        } catch (e) {
            console.warn(`Error reading cache for key "${key}":`, e);
        }
    }, [key, persist]);

    const lastFetchRef = useRef<number>(0);

    const refresh = useCallback(async (silent = false) => {
        if (!enabled) {
            // console.log(`[useActionCache] refresh skipped for ${key}: not enabled`);
            return;
        }

        const now = Date.now();
        if (now - lastFetchRef.current < dedupingInterval) {
            // console.log(`[useActionCache] refresh skipped for ${key}: deduping`);
            return; // Skip if too soon
        }

        if (!silent) {
            setState(prev => ({ ...prev, loading: true, error: null }));
        }

        try {
            console.log(`[useActionCache] Fetching ${key}...`);
            const data = await fetcher();
            const timestamp = Date.now();
            console.log(`[useActionCache] Fetched ${key}:`, Array.isArray(data) ? `${data.length} items` : data);

            const newState = {
                data,
                loading: false,
                error: null,
                timestamp
            };

            setState(newState);
            lastFetchRef.current = timestamp;

            if (persist && typeof window !== 'undefined') {
                try {
                    localStorage.setItem(key, JSON.stringify({ data, timestamp }));
                } catch (e) {
                    console.warn(`Error writing cache for key "${key}":`, e);
                }
            }

            if (onSuccessRef.current) onSuccessRef.current(data);

        } catch (error: any) {
            const errObj = error instanceof Error ? error : new Error(String(error));
            console.error(`[useActionCache] Error fetching ${key}:`, errObj);
            setState(prev => ({
                ...prev,
                loading: false,
                error: errObj
            }));

            if (onErrorRef.current) onErrorRef.current(errObj);
        }
    }, [key, fetcher, persist, dedupingInterval, enabled]);

    // Initial Fetch & Refetch on key/enabled change
    useEffect(() => {
        if (revalidateOnMount && enabled) {
            refresh(!!state.data); // Silent refresh if we already have data based on current state
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, refresh]);

    // Optimistic Update Helper
    const setData = useCallback((newData: T | ((prev: T | null) => T)) => {
        setState(prev => {
            const resolvedData = typeof newData === 'function'
                ? (newData as any)(prev.data)
                : newData;

            const newState = {
                ...prev,
                data: resolvedData,
                timestamp: Date.now()
            };

            if (persist && typeof window !== 'undefined') {
                localStorage.setItem(key, JSON.stringify({
                    data: resolvedData,
                    timestamp: newState.timestamp
                }));
            }

            return newState;
        });
    }, [key, persist]);

    return {
        ...state,
        refresh,
        setData
    };
}

export const prefetchAction = async <T>(
    key: string,
    fetcher: () => Promise<T>,
    dedupingInterval = 2000
) => {
    // Check if we have recent data
    if (typeof window === 'undefined') return;

    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const parsed = JSON.parse(cached);
            const now = Date.now();
            if (now - (parsed.timestamp || 0) < dedupingInterval) {
                return; // cached is fresh enough
            }
        }

        const data = await fetcher();
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {
        // Silent fail for prefetch
        console.warn(`Prefetch failed for key "${key}":`, e);
    }
};
