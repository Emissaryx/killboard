import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import Tippy from '@tippyjs/react';
import type { ReactElement } from 'react';
import clsx from 'clsx';
import useWindowDimensions from '@/hooks/useWindowDimensions';
import { useCatalogData } from '@/hooks/useCatalogData';
import { SortConfigDirection, useSortableData } from '@/hooks/useSortableData';
import { ErrorMessage } from '@/components/global/ErrorMessage';
import { SearchBox } from '@/components/global/SearchBox';
import { ClientPagination } from '@/components/global/ClientPagination';
import { GoldPrice } from '@/components/GoldPrice';
import { ItemPopup } from '@/components/item/ItemPopup';
import { QuestRepeatableType } from '@/__generated__/graphql';
import { questTypeIcon } from '../utils';

const PER_PAGE = 25;

interface CatalogQuestReward {
  count: number;
  item: {
    iconUrl: string;
    id: string;
    name: string;
  };
}

interface CatalogQuestType {
  isEpic: boolean;
  isGroup: boolean;
  isPlayerKill: boolean;
  isRvR: boolean;
  isTome: boolean;
  isTravel: boolean;
}

interface CatalogQuest {
  choiceCount: number;
  gold: number;
  id: string;
  minLevel: number;
  name: string;
  repeatableType: string;
  rewardsChoice: CatalogQuestReward[];
  rewardsGiven: CatalogQuestReward[];
  type: CatalogQuestType;
  xp: number;
}

type QuestCategory =
  | 'epic'
  | 'playerkill'
  | 'repeatable'
  | 'rvr'
  | 'rvrGroup'
  | 'standard'
  | 'tome'
  | 'travel';

const getQuestCategory = (quest: CatalogQuest): QuestCategory => {
  if (quest.type.isEpic) {
    return 'epic';
  }
  if (quest.type.isPlayerKill) {
    return 'playerkill';
  }
  if (quest.type.isGroup && quest.type.isRvR) {
    return 'rvrGroup';
  }
  if (quest.type.isRvR) {
    return 'rvr';
  }
  if (quest.type.isTravel) {
    return 'travel';
  }
  if (quest.type.isTome) {
    return 'tome';
  }
  if (
    (quest.repeatableType as QuestRepeatableType) !== QuestRepeatableType.None
  ) {
    return 'repeatable';
  }
  return 'standard';
};

const RewardIcons = ({
  questId,
  rewards,
}: {
  questId: string;
  rewards: CatalogQuestReward[];
}): ReactElement => (
  <>
    <div className="mb-2 is-flex">
      {rewards.slice(0, 5).map((reward) => (
        <div key={`${questId}-${reward.item.id}`}>
          <Tippy
            duration={0}
            placement="top"
            content={<ItemPopup itemId={reward.item.id} />}
          >
            <div>
              <Link to={`/item/${reward.item.id}`}>
                <figure className="image is-32x32">
                  <div style={{ position: 'relative' }}>
                    <img
                      style={{ left: 0, position: 'absolute', top: 0 }}
                      src={reward.item.iconUrl}
                      alt={reward.item.name}
                    />
                    {reward.count > 1 && (
                      <div
                        className="has-text-white"
                        style={{ position: 'absolute', right: 4, top: 0 }}
                      >
                        {reward.count}
                      </div>
                    )}
                  </div>
                </figure>
              </Link>
            </div>
          </Tippy>
        </div>
      ))}
    </div>
    {rewards.length > 5 && <div>{rewards.length - 5} other items</div>}
  </>
);

const matchesFilters = (
  quest: CatalogQuest,
  { name, category }: { category: string; name: string },
): boolean => {
  if (name && !quest.name.toLowerCase().includes(name.toLowerCase())) {
    return false;
  }
  if (category && category !== 'all' && getQuestCategory(quest) !== category) {
    return false;
  }
  return true;
};

export const Quests = (): ReactElement => {
  const [search, setSearch] = useSearchParams();
  const { t } = useTranslation(['common', 'pages', 'enums']);
  const { items, loading, error, updatedAt } =
    useCatalogData<CatalogQuest>('/quests');
  const { width } = useWindowDimensions();
  const isMobile = width <= 768;
  const [page, setPage] = useState(0);

  const nameFilter = search.get('name') ?? '';
  const categoryFilter = search.get('type') ?? 'all';

  const categoryLabels: Record<QuestCategory, string> = {
    epic: t('pages:quests.typeEpic'),
    playerkill: t('pages:quests.typePlayerKill'),
    repeatable: t('pages:quests.typeRepeatable'),
    rvr: t('pages:quests.typeRvr'),
    rvrGroup: t('pages:quests.typeRvrGroup'),
    standard: t('pages:quests.typeStandard'),
    tome: t('pages:quests.typeTome'),
    travel: t('pages:quests.typeTravel'),
  };

  const rows = useMemo(
    () =>
      (items ?? []).map((quest) => ({
        choiceCount: quest.choiceCount,
        gold: quest.gold,
        id: quest.id,
        idNum: Number(quest.id),
        minLevel: quest.minLevel,
        name: quest.name,
        repeatableType: quest.repeatableType,
        rewardsChoice: quest.rewardsChoice,
        rewardsGiven: quest.rewardsGiven,
        type: quest.type,
        xp: quest.xp,
      })),
    [items],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((quest) =>
        matchesFilters(quest, { category: categoryFilter, name: nameFilter }),
      ),
    [rows, nameFilter, categoryFilter],
  );

  const {
    items: sortedRows,
    requestSort,
    sortConfig,
  } = useSortableData(filteredRows, {
    direction: SortConfigDirection.ascending,
    key: 'idNum',
  });

  const filterKey = `${nameFilter}|${categoryFilter}`;
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

  const sortableHeader = (key: string, label: string): ReactElement => (
    <th
      align="right"
      className={clsx('is-clickable', 'has-text-link', getSortClass(key))}
      onClick={() => requestSort(key)}
    >
      {label}
    </th>
  );

  return (
    <div className="container is-max-widescreen mt-2">
      <nav className="breadcrumb" aria-label="breadcrumbs">
        <ul>
          <li>
            <Link to="/">{t('common:home')}</Link>
          </li>
          <li className="is-active">
            <Link to="/quests">{t('pages:quests.title')}</Link>
          </li>
        </ul>
      </nav>

      <div className="filter-grid">
        <label>
          <span>{t('pages:quests.search')}</span>
          <SearchBox
            initialQuery={nameFilter}
            onSubmit={(event) => {
              search.set('name', event);
              setSearch(search);
            }}
          />
        </label>
        <label>
          <span>{t('pages:quests.type')}</span>
          <div className="select">
            <select
              value={categoryFilter}
              onChange={(event) => {
                search.set('type', event.target.value);
                setSearch(search);
              }}
            >
              <option value="all">{t('pages:quests.filterAllTypes')}</option>
              {(Object.keys(categoryLabels) as QuestCategory[]).map(
                (category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ),
              )}
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
                {t('pages:quests.dataSyncedAt')}{' '}
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
                      {t('pages:quests.id')}
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('name'),
                      )}
                      onClick={() => requestSort('name')}
                    >
                      {t('pages:quests.name')}
                    </th>
                    {sortableHeader('minLevel', t('pages:quests.level'))}
                    {sortableHeader('xp', t('pages:quests.xp'))}
                    <th align="right" id="table_gold">
                      <span
                        className={clsx(
                          'is-clickable',
                          'has-text-link',
                          getSortClass('gold'),
                          'mr-2',
                        )}
                        onClick={() => requestSort('gold')}
                      >
                        {t('pages:quests.gold')}
                      </span>
                    </th>
                    <th>{t('pages:quests.given')}</th>
                    <th>{t('pages:quests.choice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((quest) => (
                    <tr key={quest.id}>
                      <td>{quest.id}</td>
                      <td>
                        <Link to={`/quest/${quest.id}`}>
                          <div className="icon-text">
                            <span className="icon has-text-info">
                              <img
                                src={`/images/icons/${questTypeIcon(
                                  quest.type,
                                  quest.repeatableType as QuestRepeatableType,
                                )}`}
                                alt="Quest Type"
                              />
                            </span>
                            <span>{quest.name}</span>
                          </div>
                        </Link>
                      </td>
                      <td align="right">{quest.minLevel}</td>
                      <td align="right">{quest.xp}</td>
                      <td align="right" aria-labelledby="table_gold">
                        <GoldPrice price={quest.gold} />
                      </td>
                      <td>
                        <RewardIcons
                          questId={quest.id}
                          rewards={quest.rewardsGiven}
                        />
                      </td>
                      <td>
                        {quest.choiceCount > 0 && (
                          <div>Choose {quest.choiceCount}</div>
                        )}
                        <RewardIcons
                          questId={quest.id}
                          rewards={quest.rewardsChoice}
                        />
                      </td>
                    </tr>
                  ))}
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
