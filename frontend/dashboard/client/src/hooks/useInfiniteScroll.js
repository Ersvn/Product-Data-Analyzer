import { useEffect, useRef, useCallback } from 'react';

export function useInfiniteScroll({ onLoadMore, hasMore, isLoading }) {
    const observerRef = useRef();

    const lastElementRef = useCallback((node) => {
        if (isLoading) return;
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore) {
                onLoadMore();
            }
        }, {
            rootMargin: '100px',
        });

        if (node) observerRef.current.observe(node);
    }, [isLoading, hasMore, onLoadMore]);

    return lastElementRef;
}