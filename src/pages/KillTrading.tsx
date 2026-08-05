import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  >('farming');
  const [showDismissed, setShowDismissed] = useState(false);
  const [hideReviewed, setHideReviewed] = useState(true);
  const [hideBanned, setHideBanned] = useState(true);
  const [minScore, setMinScore] = useState(50);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // Rows checked for a bulk action (e.g. "mark reviewed" across a batch
  // of obviously-legit trading fights at once, instead of clicking each
  // row's button one at a time).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
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

  // Highest score currently loaded, used as the slider's ceiling. Null
  // until flags actually load, so the default threshold below isn't
  // clamped down before real data arrives.
  const maxScore = useMemo(() => {
    if (!flags || flags.length === 0) {
      return null;
    }
    return Math.max(...flags.map((flag) => flag.score));
  }, [flags]);

  // If a pattern/date filter narrows the loaded set enough that the max
  // score drops below the currently selected threshold, pull the
  // threshold back down too rather than leaving it stuck above every
  // visible row (which would silently show zero results).
  useEffect(() => {
    if (maxScore == null) {
      return;
    }
    setMinScore((current) => (current > maxScore ? maxScore : current));
  }, [maxScore]);

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
      if (flag.score < minScore) {
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
  }, [flags, dateFrom, dateTo, hideReviewed, hideBanned, minScore]);

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

  // Applies one patch to every currently-selected row in parallel, then
  // reloads once and clears the selection - used by the bulk action bar
  // so reviewing a big batch of obviously-legit trading pairs doesn't
  // mean clicking "Mark reviewed" one row at a time.
  const bulkUpdateFlags = (patch: {
    reviewed?: boolean;
    dismissed?: boolean;
    banned?: boolean;
  }) => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }
    setPendingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    Promise.allSettled(
      ids.map((id) =>
        fetch(`${CATALOG_BASE_URL}/kill-flags/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      ),
    )
      .then((results) => {
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          console.error('Failed to bulk-update kill flags', failures);
        }
      })
      .finally(() => {
        setPendingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        setSelectedIds(new Set());
        reload();
      });
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    sortedFlags.length > 0 &&
    sortedFlags.every((flag) => selectedIds.has(flag.id));
  const someVisibleSelected = sortedFlags.some((flag) =>
    selectedIds.has(flag.id),
  );

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        sortedFlags.forEach((flag) => next.delete(flag.id));
      } else {
        sortedFlags.forEach((flag) => next.add(flag.id));
      }
      return next;
    });
  };

  // Bulma checkboxes don't expose an "indeterminate" prop, and the DOM
  // property can only be set imperatively - so a ref + effect is needed
  // to show the "some but not all visible rows selected" dash state.
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

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
          <div className="tabs">
            <ul>
              <li className={clsx({ 'is-active': patternFilter === 'all' })}>
                <a onClick={() => setPatternFilter('all')}>All patterns</a>
              </li>
              <li
                className={clsx({ 'is-active': patternFilter === 'farming' })}
              >
                <a onClick={() => setPatternFilter('farming')}>Farming</a>
              </li>
              <li
                className={clsx({ 'is-active': patternFilter === 'trading' })}
              >
                <a onClick={() => setPatternFilter('trading')}>Trading</a>
              </li>
            </ul>
          </div>
          <div className="columns is-vcentered is-multiline">
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
              <label className="label is-small mb-1" htmlFor="min-score-slider">
                Min score: {minScore.toFixed(1)}
              </label>
              <input
                id="min-score-slider"
                type="range"
                min={0}
                max={Math.max(1, Math.ceil(maxScore ?? minScore))}
                step={0.5}
                value={minScore}
                onChange={(event) => setMinScore(Number(event.target.value))}
              />
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
            <>
              {selectedIds.size > 0 && (
                <div className="notification is-info is-light py-2 px-3 mb-3 is-flex is-align-items-center">
                  <span className="mr-3">{selectedIds.size} selected</span>
                  <div className="buttons are-small mb-0">
                    <button
                      type="button"
                      className="button is-success"
                      onClick={() => bulkUpdateFlags({ reviewed: true })}
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      className="button is-danger"
                      onClick={() => bulkUpdateFlags({ dismissed: true })}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="button is-light"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
              )}
              <div className="table-container">
                <table className="table is-fullwidth is-striped">
                  <thead className="is-relative">
                    <tr>
                      <th>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          aria-label="Select all visible rows"
                        />
                      </th>
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
                          <input
                            type="checkbox"
                            checked={selectedIds.has(flag.id)}
                            onChange={() => toggleSelected(flag.id)}
                            aria-label={`Select flag ${flag.id}`}
                          />
                        </td>
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
                                {flag.details.distinctVictims} distinct victims,
                                ~{flag.details.repeatRatio?.toFixed(1)}x repeat
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
                        <td className="is-size-7">
                          {formatDate(flag.lastSeen)}
                        </td>
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
                                updateFlag(flag.id, {
                                  reviewed: !flag.reviewed,
                                })
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
                                // Marking something banned means it's been
                                // looked at and acted on, so it should also
                                // count as reviewed (and drop out of an
                                // "unreviewed" filtered view). Un-banning
                                // doesn't force it back to unreviewed - a
                                // human might still want it marked reviewed
                                // even after reversing the ban call.
                                updateFlag(
                                  flag.id,
                                  flag.banned
                                    ? { banned: false }
                                    : { banned: true, reviewed: true },
                                )
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
