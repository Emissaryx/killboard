import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import clsx from 'clsx';
import useWindowDimensions from '@/hooks/useWindowDimensions';
import { useCatalogData } from '@/hooks/useCatalogData';
import { SortConfigDirection, useSortableData } from '@/hooks/useSortableData';
import { ErrorMessage } from '@/components/global/ErrorMessage';
import { SearchBox } from '@/components/global/SearchBox';
import { ClientPagination } from '@/components/global/ClientPagination';
import type { CreatureTitle } from '@/__generated__/graphql';
import { creatureTitleIcon, creatureTitleLabel } from '../utils';

const PER_PAGE = 25;

interface CatalogCreature {
  id: string;
  locations: string[];
  name: string;
  realm: 'DESTRUCTION' | 'ORDER' | null;
  title: string;
}

interface CreatureRow {
  id: string;
  idNum: number;
  location: string;
  locationCount: number;
  name: string;
  realm: 'DESTRUCTION' | 'ORDER' | null;
  realmSort: string;
  role: string;
  title: string;
}

const matchesFilters = (
  row: CreatureRow,
  { name, realm, role, location }: Record<string, string>,
): boolean => {
  if (name && !row.name.toLowerCase().includes(name.toLowerCase())) {
    return false;
  }
  if (realm && realm !== 'all') {
    const rowRealm = row.realm ?? 'NEUTRAL';
    if (rowRealm !== realm) {
      return false;
    }
  }
  if (role && role !== 'all' && row.role !== role) {
    return false;
  }
  if (location && location !== 'all' && row.location !== location) {
    return false;
  }
  return true;
};

export const Creatures = (): ReactElement => {
  const [search, setSearch] = useSearchParams();
  const { t } = useTranslation(['common', 'pages', 'enums']);
  const { items, loading, error, updatedAt } =
    useCatalogData<CatalogCreature>('/creatures');
  const { width } = useWindowDimensions();
  const isMobile = width <= 768;
  const [page, setPage] = useState(0);

  const nameFilter = search.get('name') ?? '';
  const realmFilter = search.get('realm') ?? 'all';
  const roleFilter = search.get('role') ?? 'all';
  const locationFilter = search.get('location') ?? 'all';

  const rows = useMemo<CreatureRow[]>(
    () =>
      (items ?? []).map((creature) => ({
        id: creature.id,
        idNum: Number(creature.id),
        location: creature.locations[0] ?? '',
        locationCount: creature.locations.length,
        name: creature.name,
        realm: creature.realm,
        realmSort: creature.realm ?? 'NEUTRAL',
        role: creatureTitleLabel(creature.title as CreatureTitle),
        title: creature.title,
      })),
    [items],
  );

  const roleOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.role).filter(Boolean))].toSorted(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );

  const locationOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.location).filter(Boolean))].toSorted(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesFilters(row, {
          location: locationFilter,
          name: nameFilter,
          realm: realmFilter,
          role: roleFilter,
        }),
      ),
    [rows, nameFilter, realmFilter, roleFilter, locationFilter],
  );

  const {
    items: sortedRows,
    requestSort,
    sortConfig,
  } = useSortableData(filteredRows, {
    direction: SortConfigDirection.ascending,
    key: 'idNum',
  });

  const filterKey = `${nameFilter}|${realmFilter}|${roleFilter}|${locationFilter}`;
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PER_PAGE));
  const pageRows = sortedRows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const getSortClass = (key: string): string => {
    if (!sortConfig || sortConfig.key !== key) {
      return '';
    }
    return sortConfig.direction;
  };

  return (
    <div className="container is-max-widescreen mt-2">
      <nav className="breadcrumb" aria-label="breadcrumbs">
        <ul>
          <li>
            <Link to="/">{t('common:home')}</Link>
          </li>
          <li className="is-active">
            <Link to="/creatures">{t('pages:creatures.title')}</Link>
          </li>
        </ul>
      </nav>

      <div className="filter-grid">
        <label>
          <span>{t('pages:creatures.search')}</span>
          <SearchBox
            initialQuery={nameFilter}
            onSubmit={(event) => {
              search.set('name', event);
              setSearch(search);
            }}
          />
        </label>
        <label>
          <span>{t('pages:creatures.realm')}</span>
          <div className="select">
            <select
              value={realmFilter}
              onChange={(event) => {
                search.set('realm', event.target.value);
                setSearch(search);
              }}
            >
              <option value="all">{t('pages:creatures.filterAll')}</option>
              <option value="ORDER">{t('common:realmOrder')}</option>
              <option value="DESTRUCTION">
                {t('common:realmDestruction')}
              </option>
              <option value="NEUTRAL">{t('common:realmNeutral')}</option>
            </select>
          </div>
        </label>
        <label>
          <span>{t('pages:creatures.role')}</span>
          <div className="select">
            <select
              value={roleFilter}
              onChange={(event) => {
                search.set('role', event.target.value);
                setSearch(search);
              }}
            >
              <option value="all">{t('pages:creatures.filterAll')}</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label>
          <span>{t('pages:creatures.location')}</span>
          <div className="select">
            <select
              value={locationFilter}
              onChange={(event) => {
                search.set('location', event.target.value);
                setSearch(search);
              }}
            >
              <option value="all">{t('pages:creatures.filterAll')}</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {loading && <progress className="progress" />}
      {!loading && error && (
        <ErrorMessage name={error.name} message={error.message} />
      )}
      {!loading && !error && (
        <>
          <p className="is-size-7 has-text-grey mb-2">
            {sortedRows.length.toLocaleString()} /{' '}
            {rows.length.toLocaleString()}
            {updatedAt && (
              <>
                {' · '}
                {t('pages:creatures.dataSyncedAt')}{' '}
                {new Date(updatedAt).toLocaleString()}
              </>
            )}
          </p>
          {sortedRows.length === 0 ? (
            <ErrorMessage customText={t('common:noResults')} />
          ) : (
            <div className="table-container">
              <table
                className={clsx(
                  'table',
                  'is-striped',
                  'is-hoverable',
                  isMobile ? 'is-narrow' : 'is-fullwidth',
                )}
              >
                <thead className="is-relative">
                  <tr>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('idNum'),
                      )}
                      onClick={() => requestSort('idNum')}
                    >
                      {t('pages:creatures.id')}
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('name'),
                      )}
                      onClick={() => requestSort('name')}
                    >
                      {t('pages:creatures.name')}
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('realmSort'),
                      )}
                      onClick={() => requestSort('realmSort')}
                    >
                      {t('pages:creatures.realm')}
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('role'),
                      )}
                      onClick={() => requestSort('role')}
                    >
                      {t('pages:creatures.role')}
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('location'),
                      )}
                      onClick={() => requestSort('location')}
                    >
                      {t('pages:creatures.location')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const icon = creatureTitleIcon(row.title as CreatureTitle);

                    return (
                      <tr key={row.id}>
                        <td>{row.id}</td>
                        <td>
                          <Link to={`/creature/${row.id}`}>{row.name}</Link>
                        </td>
                        <td>
                          {row.realm === 'ORDER' && (
                            <span className="icon-text">
                              <figure className="image is-24x24 m-0 mr-1">
                                <img
                                  src="/images/icons/scenario/order.png"
                                  width={24}
                                  height={24}
                                  alt={t('common:realmOrder')}
                                />
                              </figure>
                              {t('common:realmOrder')}
                            </span>
                          )}
                          {row.realm === 'DESTRUCTION' && (
                            <span className="icon-text">
                              <figure className="image is-24x24 m-0 mr-1">
                                <img
                                  src="/images/icons/scenario/destruction.png"
                                  width={24}
                                  height={24}
                                  alt={t('common:realmDestruction')}
                                />
                              </figure>
                              {t('common:realmDestruction')}
                            </span>
                          )}
                          {row.realm == null && (
                            <span>{t('common:realmNeutral')}</span>
                          )}
                        </td>
                        <td>
                          {row.role && (
                            <span className="icon-text">
                              {icon && (
                                <figure className="image is-24x24 m-0 mr-1">
                                  <img
                                    src={icon}
                                    width={24}
                                    height={24}
                                    alt=""
                                  />
                                </figure>
                              )}
                              {row.role}
                            </span>
                          )}
                        </td>
                        <td>
                          {row.location && (
                            <span>
                              {row.location}
                              {row.locationCount > 1 &&
                                ` (+${row.locationCount - 1})`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ClientPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
};
