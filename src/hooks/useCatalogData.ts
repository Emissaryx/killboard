import { useEffect, useState } from 'react';

// Creatures/Quests want real sort and filter over the entire catalog, not
// just a 15-row GraphQL page at a time - and the API only supports
// server-side sort/filter on a couple of fields anyway.
// A `killboard-catalog` Cloudflare Worker crawls the full dataset on an
// hourly cron and caches it in D1. This fetches that cache in one request
// so sort/filter can happen in the browser. See killboard-catalog's
// worker.js for the crawl/cache side of this.
const CATALOG_BASE_URL = 'https://theemissary.dev/api/catalog';

interface CatalogResponse<T> {
  count: number;
  items: T[];
  updatedAt: string | null;
}

export interface CatalogState<T> {
  error: Error | null;
  items: T[] | null;
  loading: boolean;
  updatedAt: string | null;
}

export const useCatalogData = <T>(path: string): CatalogState<T> => {
  const [items, setItems] = useState<T[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setUpdatedAt(null);
    setFetchError(null);

    fetch(`${CATALOG_BASE_URL}${path}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Catalog request failed (${response.status})`);
        }
        return response.json() as Promise<CatalogResponse<T>>;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setItems(data.items);
        setUpdatedAt(data.updatedAt);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setFetchError(
          error instanceof Error ? error : new Error(String(error)),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return {
    error: fetchError,
    items,
    loading: items == null && fetchError == null,
    updatedAt,
  };
};
