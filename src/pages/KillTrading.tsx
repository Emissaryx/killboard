import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ErrorMessage } from '@/components/global/ErrorMessage';
import { SortConfigDirection, useSortableData } from '@/hooks/useSortableData';

// Invisible review dashboard for the kill-trading/farming detector. Not
// linked from MainNav on purpose (same "you need the direct URL" pattern
// as /ranked-leaderboard) - this is a review tool for staff, not a
// player-facing feature. Reads from the killboard-catalog Worker's
// /kill-flags and /kill-backfill-status endpoints rather than the site's
// own GraphQL API - see killboard-catalog's worker.js for how flags get
// produced (a solo-kills backfill walking back to 2024-01-01, plus a
// live check every 5 minutes).
const CATALOG_BASE_URL = 'https://killboard-catalog.tcates79.workers.dev';

interface KillFlagSampleEvent {
  id: string;
  time: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
}

interface KillFlagDetails {
  distinctVictims?: number;
  repeatRatio?: number;
  medianGapMinutes?: number | null;
  sampleEvents?: KillFlagSampleEvent[];
}

interface KillFlag {
  id: number;
  pattern: 'farming' | 'trading';
  characterIds: string[];
  characterNames: Record<string, string>;
  windowStart: string;
  windowEnd: string;
  totalKills: number;
  score: number;
  details: KillFlagDetails;
  firstSeen: string;
  lastSeen: string;
  reviewed: boolean;
  dismissed: boolean;
  banned: boolean;
}

interface BackfillStatus {
  target: string;
  oldestCovered: string | null;
  complete: boolean;
  lastRunAt: string | null;
  liveCursor: string | null;
  liveLastRunAt: string | null;
}

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString();
};

const backfillProgressPercent = (status: BackfillStatus): number => {
  if (status.complete) {
    return 100;
  }
  if (!status.oldestCovered) {
    return 0;
  }
  const target = new Date(status.target).getTime();
  const covered = new Date(status.oldestCovered).getTime();
  const now = Date.now();
  const total = now - target;
  if (total <= 0) {
    return 100;
  }
  const done = now - covered;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
};

export const KillTrading = (): ReactElement => {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [statusError, setStatusError] = useState<Error | null>(null);

  const [flags, setFlags] = useState<KillFlag[] | null>(null);
  const [flagsError, setFlagsError] = useState<Error | null>(null);

  const [patternFilter, setPatternFilter] = useState<
    'all' | 'farming' | 'trading'
  >('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [hideReviewed, setHideReviewed] = useState(true);
  const [hideBanned, setHideBanned] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${CATALOG_BASE_URL}/kill-backfill-status`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Status request failed (${response.status})`);
        }
        return response.json() as Promise<BackfillStatus>;
      })
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatusError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setFlagsError(null);
    const params = new URLSearchParams();
    if (patternFilter !== 'all') {
      params.set('pattern', patternFilter);
    }
    if (showDismissed) {
      params.set('includeDismissed', 'true');
    }
    fetch(`${CATALOG_BASE_URL}/kill-flags?${params.toString()}`, {
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Flags request failed (${response.status})`);
        }
        return response.json() as Promise<{ flags: KillFlag[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setFlags(data.flags);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFlagsError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [patternFilter, showDismissed, reloadToken]);

  // Date range filter is applied client-side against each flag's activity
  // window (windowStart/windowEnd) - a flag matches if its window overlaps
  // the selected [dateFrom, dateTo] range at all, not just if it started
  // exactly inside it, so a long-running pattern that merely touches the
  // selected range still shows up.
  const filteredFlags = useMemo(() => {
    if (!flags) {
      return flags;
    }
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    // 'to' is a whole day - push it to the end of that day so the day you
    // pick is fully included.
    const toMs = dateTo
      ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;
    return flags.filter((flag) => {
      if (hideReviewed && flag.reviewed) {
        return false;
      }
      if (hideBanned && flag.banned) {
        return false;
      }
      const windowStartMs = new Date(flag.windowStart).getTime();
      const windowEndMs = new Date(flag.windowEnd).getTime();
      if (fromMs != null && windowEndMs < fromMs) {
        return false;
      }
      if (toMs != null && windowStartMs > toMs) {
        return false;
      }
      return true;
    });
  }, [flags, dateFrom, dateTo, hideReviewed, hideBanned]);

  const {
    items: sortedFlags,
    requestSort,
    sortConfig,
  } = useSortableData(filteredFlags ?? [], {
    direction: SortConfigDirection.descending,
    key: 'score',
  });

  const getSortClass = (key: string): string => {
    if (!sortConfig || sortConfig.key !== key) {
      return '';
    }
    return sortConfig.direction;
  };

  const updateFlag = (
    id: number,
    patch: { reviewed?: boolean; dismissed?: boolean; banned?: boolean },
  ) => {
    setPendingIds((prev) => new Set(prev).add(id));
    fetch(`${CATALOG_BASE_URL}/kill-flags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
      .then(() => {
        reload();
      })
      .catch((error: unknown) => {
        console.error('Failed to update kill flag', error);
      })
      .finally(() => {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  return (
    <div className="container is-max-widescreen mt-2">
      <h1 className="title is-4">Kill Trading / Farming Review</h1>
      <p className="subtitle is-6">
        Not linked anywhere in the site nav - this page only exists at this URL.
        Flags below are automated pattern matches, not proof of cheating; use
        judgment before acting on them.
      </p>
      <p className="is-size-7 has-text-grey mb-5">
        <strong>How Score is calculated:</strong> for{' '}
        <span className="tag is-warning is-light">farming</span> flags, score =
        repeat ratio (total kills &divide; distinct victims) &times;
        log&#8322;(total kills + 1) - a killer racking up a lot of kills on a
        small, repeated pool of victims scores higher, with diminishing returns
        from raw kill count alone so a long, ordinary farming session on a big
        roster doesn&apos;t outscore a tight, suspicious pattern. For{' '}
        <span className="tag is-danger is-light">trading</span> flags, score =
        total kills in the clique &times; number of characters in the clique -
        more reciprocal kills among more characters scores higher. Score is
        meant to help you triage what to look at first, not as a verdict.
      </p>

      <div className="card mb-5">
        <div className="card-content">
          <p className="title is-6 mb-2">Backfill progress</p>
          {statusError && (
            <ErrorMessage
              name={statusError.name}
              message={statusError.message}
            />
          )}
          {!statusError && !status && <progress className="progress" />}
          {status && (
            <>
              <progress
                className={clsx('progress', {
                  'is-success': status.complete,
                  'is-info': !status.complete,
                })}
                value={backfillProgressPercent(status)}
                max={100}
              >
                {backfillProgressPercent(status)}%
              </progress>
              <div className="content is-small">
                <ul>
                  <li>
                    Status:{' '}
                    {status.complete
                      ? 'complete (reached January 2024)'
                      : `in progress, ${backfillProgressPercent(status)}% of the way back to ${new Date(status.target).toLocaleDateString()}`}
                  </li>
                  <li>
                    Oldest date covered so far:{' '}
                    {formatDate(status.oldestCovered)}
                  </li>
                  <li>Last backfill tick: {formatDate(status.lastRunAt)}</li>
                  <li>Last live tick: {formatDate(status.liveLastRunAt)}</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card mb-5">
        <div className="card-content">
          <div className="columns is-vcentered">
            <div className="column">
              <div className="tabs">
                <ul>
                  <li
                    className={clsx({ 'is-active': patternFilter === 'all' })}
                  >
                    <a onClick={() => setPatternFilter('all')}>All patterns</a>
                  </li>
                  <li
                    className={clsx({
                      'is-active': patternFilter === 'farming',
                    })}
                  >
                    <a onClick={() => setPatternFilter('farming')}>Farming</a>
                  </li>
                  <li
                    className={clsx({
                      'is-active': patternFilter === 'trading',
                    })}
                  >
                    <a onClick={() => setPatternFilter('trading')}>Trading</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="column is-narrow">
              <div className="field has-addons">
                <div className="control">
                  <input
                    type="date"
                    className="input is-small"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </div>
                <div className="control">
                  <a className="button is-small is-static">to</a>
                </div>
                <div className="control">
                  <input
                    type="date"
                    className="input is-small"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <div className="control">
                    <button
                      type="button"
                      className="button is-small"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="column is-narrow">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hideReviewed}
                  onChange={(event) => setHideReviewed(event.target.checked)}
                />{' '}
                Hide reviewed
              </label>
            </div>
            <div className="column is-narrow">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hideBanned}
                  onChange={(event) => setHideBanned(event.target.checked)}
                />{' '}
                Hide banned
              </label>
            </div>
            <div className="column is-narrow">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={showDismissed}
                  onChange={(event) => setShowDismissed(event.target.checked)}
                />{' '}
                Show dismissed
              </label>
            </div>
          </div>

          {flagsError && (
            <ErrorMessage name={flagsError.name} message={flagsError.message} />
          )}
          {!flagsError && !flags && <progress className="progress" />}
          {filteredFlags && filteredFlags.length === 0 && (
            <p>No flagged groups for this filter yet.</p>
          )}
          {filteredFlags && filteredFlags.length > 0 && (
            <div className="table-container">
              <table className="table is-fullwidth is-striped">
                <thead className="is-relative">
                  <tr>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('pattern'),
                      )}
                      onClick={() => requestSort('pattern')}
                    >
                      Pattern
                    </th>
                    <th>Characters</th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('totalKills'),
                      )}
                      onClick={() => requestSort('totalKills')}
                    >
                      Total kills
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('windowStart'),
                      )}
                      onClick={() => requestSort('windowStart')}
                    >
                      Window
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('lastSeen'),
                      )}
                      onClick={() => requestSort('lastSeen')}
                    >
                      Last seen
                    </th>
                    <th
                      className={clsx(
                        'is-clickable',
                        'has-text-link',
                        getSortClass('score'),
                      )}
                      onClick={() => requestSort('score')}
                    >
                      Score
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFlags.map((flag) => (
                    <tr key={flag.id}>
                      <td>
                        <span
                          className={clsx('tag', {
                            'is-warning': flag.pattern === 'farming',
                            'is-danger': flag.pattern === 'trading',
                          })}
                        >
                          {flag.pattern}
                        </span>
                      </td>
                      <td>
                        {flag.characterIds.map((id, index) => (
                          <span key={id}>
                            {index > 0 && ', '}
                            <Link to={`/character/${id}`}>
                              {flag.characterNames[id] ?? id}
                            </Link>
                          </span>
                        ))}
                        <div className="is-size-7">
                          <Link
                            to={`/character-group/${flag.characterIds.join(',')}`}
                          >
                            View combined kill feed
                          </Link>
                        </div>
                        {flag.pattern === 'farming' &&
                          flag.details.distinctVictims != null && (
                            <div className="is-size-7 has-text-grey">
                              {flag.details.distinctVictims} distinct victims, ~
                              {flag.details.repeatRatio?.toFixed(1)}x repeat
                              ratio
                            </div>
                          )}
                      </td>
                      <td>{flag.totalKills}</td>
                      <td className="is-size-7">
                        {formatDate(flag.windowStart)}
                        <br />
                        to {formatDate(flag.windowEnd)}
                      </td>
                      <td className="is-size-7">{formatDate(flag.lastSeen)}</td>
                      <td>{flag.score.toFixed(1)}</td>
                      <td>
                        <div className="buttons are-small">
                          <button
                            type="button"
                            className={clsx('button', {
                              'is-success': flag.reviewed,
                            })}
                            disabled={pendingIds.has(flag.id)}
                            onClick={() =>
                              updateFlag(flag.id, { reviewed: !flag.reviewed })
                            }
                          >
                            {flag.reviewed ? 'Reviewed' : 'Mark reviewed'}
                          </button>
                          <button
                            type="button"
                            className={clsx('button', {
                              'is-dark': flag.banned,
                            })}
                            disabled={pendingIds.has(flag.id)}
                            onClick={() =>
                              updateFlag(flag.id, { banned: !flag.banned })
                            }
                          >
                            {flag.banned ? 'Banned' : 'Mark banned'}
                          </button>
                          <button
                            type="button"
                            className={clsx('button', {
                              'is-danger': !flag.dismissed,
                              'is-light': flag.dismissed,
                            })}
                            disabled={pendingIds.has(flag.id)}
                            onClick={() =>
                              updateFlag(flag.id, {
                                dismissed: !flag.dismissed,
                              })
                            }
                          >
                            {flag.dismissed ? 'Restore' : 'Dismiss'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
