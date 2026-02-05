# Technical Specification: Action Context Cache Standardization

## 1. Context & Problem Statement

Currently, the application implements "optimistic caching" (loading from `localStorage` before fetching fresh data) in multiple places:
- `src/contexts/AuthContext.tsx`: Caches admin status, email, user ID.
- `src/contexts/StorageContext.tsx`: Caches storage stats.
- `src/components/layout/Sidebar.tsx`: Caches the list of projects.
- `src/app/drive/[[...slug]]/page.tsx`: Caches the list of projects (duplicated from Sidebar) and file nodes for the current folder.

### Issues identifying:
1.  **Duplication**: The logic (load -> parse -> set state -> fetch -> update -> save) is rewritten 4+ times.
2.  **Inconsistency**: Different error handling strategies, different key naming conventions (`auth_...`, `storage_...`, `cache_...`).
3.  **Redundant Network Requests**: `Sidebar` and `DrivePage` both fetch projects independently, potentially causing double requests on load.
4.  **Maintenance Risk**: Changing the caching strategy requires updating multiple files.

## 2. Proposed Solution: Unified Action Context Cache

We will introduce a new system, likely a `ActionCacheContext` or a set of hooks, to standardize this behavior. The system will handle:
- **Persistence**: Reading/Writing to `localStorage`.
- **State Management**: Providing `data`, `loading`, `error` states.
- **Revalidation**: Fetching fresh data and updating the cache seamlessly.
- **Deduplication**: Sharing data between components (e.g., Projects list) to avoid redundant fetches.

### 2.1. New Architecture

We will create a generalized `useActionCache` hook and potentially a global generic Store if needed, but given React's nature, a specialized Hook + Context where data sharing is needed is best.

However, since `Projects` are shared global state used by Sidebar and Pages, they should move to a Context.
`Nodes` (files/folders) are local to the view (DrivePage), so they can use the Hook but don't necessarily need to be in a global context, although caching them is useful.

**The "Action Context Cache" System:**

A generic Context that stores "Actions" (async operations) results by key.

```tsx
// Interface
interface CacheItem<T> {
    data: T | null;
    timestamp: number;
    loading: boolean;
    error: any;
}

interface ActionContextType {
    // Generic execute function
    runAction: <T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions) => { data: T | null, loading: boolean };
    
    // Direct access if needed
    getCache: <T>(key: string) => T | null;
    updateCache: <T>(key: string, data: T) => void;
    
    // Specific Shared Actions (pre-defined for type safety & sharing)
    projects: CacheItem<Project[]>;
    refreshProjects: () => Promise<void>;
}
```

### 2.2. Standardized Keys

We will define all cache keys in a single constant file to avoid collisions.
`src/constants/cacheKeys.ts`

```typescript
export const CACHE_KEYS = {
    AUTH_USER: 'auth_user', // Composite object?
    PROJECTS: 'global_projects',
    STORAGE_STATS: 'storage_stats',
    NODES: (projectId: string, path: string) => `nodes_${projectId}_${path}`,
    PROJECT_DETAILS: (projectId: string) => `project_${projectId}`
};
```

## 3. Implementation Plan

### Phase 1: Create the Foundation
1.  Create `src/constants/cacheKeys.ts`.
2.  Create `src/hooks/useActionCache.ts` (The core logic for load-fetch-save).
3.  Create `src/contexts/ActionContext.tsx` (To hold shared global state like Projects).

### Phase 2: Refactor Components
1.  **Refactor `AuthContext`**: Use the new helper helpers (or keep independent if it causes circular dependencies, but strive to use the standard keys/logic).
2.  **Refactor `StorageContext`**: Replace internal logic with `useActionCache`.
3.  **Refactor `Sidebar`**: Remove local fetching. Consume `projects` from `ActionContext`.
4.  **Refactor `DrivePage`**:
    - Consume `projects` from `ActionContext` (delete local `projects` state).
    - Use `useActionCache` for fetching Nodes (this keeps nodes state local to the page but uses the standard caching logic).

## 4. Detailed Design Details

### The `useActionCache` Hook
This hook will abstract the "Stale-While-Revalidate" pattern used with localStorage.

```tsx
function useActionCache<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    options: { 
        initialData?: T, 
        persist?: boolean // default true
        syncWithContext?: boolean // if true, updates global context
    }
) {
    // 1. Initialize state from localStorage (if persist) or initialData
    // 2. useEffect -> fetcher() -> update state -> update localStorage
    // 3. Return { data, loading, error, refresh }
}
```

### The `ActionContext`
This will act as the "Source of Truth" for globally shared data.

```tsx
export const ActionProvider = ({ children }) => {
    // Use the hook internally for shared resources
    const projects = useActionCache(CACHE_KEYS.PROJECTS, fetchProjectsApi);
    
    // ... potentially other global lists like Whitelist?
    
    return (
        <ActionContext.Provider value={{ projects }}>
            {children}
        </ActionContext.Provider>
    )
}
```

## 5. Benefits
- **Single Source of Truth**: Projects are fetched once.
- **Consistent UX**: All cached data behaves the same (instant load -> background refresh).
- **Clean Code**: Removes hundreds of lines of duplicated `useEffect` and `localStorage` parsing logic.
