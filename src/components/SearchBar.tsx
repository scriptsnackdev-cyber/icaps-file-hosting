'use client';

import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '@/app/layout.module.css';

export default function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const folderId = searchParams?.get('folderId');
        const projectId = searchParams?.get('projectId');

        const formData = new FormData(e.target as HTMLFormElement);
        const queryVal = formData.get('query')?.toString() || '';

        let url = '/';
        const params = new URLSearchParams();
        if (projectId) params.set('projectId', projectId);
        if (folderId) params.set('folderId', folderId);
        if (queryVal.trim()) params.set('search', queryVal.trim());

        const qs = params.toString();
        if (qs) url += `?${qs}`;

        router.push(url);
    };

    const currentSearch = searchParams?.get('search') || '';

    return (
        <form onSubmit={handleSearch} className={styles.searchBar}>
            <Search size={18} color="var(--text-light)" />
            <input
                key={currentSearch}
                type="text"
                name="query"
                defaultValue={currentSearch}
                placeholder="Search across SharePoint..."
                className={styles.searchInput}
            />
        </form>
    );
}
