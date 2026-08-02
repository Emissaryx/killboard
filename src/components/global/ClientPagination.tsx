import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';

// Pager for data that's already fully loaded client-side (see
// UseCatalogData) and sliced into pages in-memory - unlike QueryPagination,
// there's no cursor or refetch involved, just a page index.
export const ClientPagination = ({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}): ReactElement | null => {
  const { t } = useTranslation(['common']);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="field is-grouped is-pulled-right">
      {page > 0 && (
        <button
          className="button is-info is-small"
          onClick={() => {
            onPageChange(page - 1);
          }}
        >
          {t('common:prevPage')}
          <i className="fas fa-circle-chevron-left ml-1" />
        </button>
      )}
      {page < totalPages - 1 && (
        <button
          className="button is-info is-small"
          onClick={() => {
            onPageChange(page + 1);
          }}
        >
          {t('common:nextPage')}
          <i className="fas fa-circle-chevron-right ml-1" />
        </button>
      )}
    </div>
  );
};
