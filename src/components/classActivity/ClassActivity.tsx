import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import clsx from 'clsx';
import { Career } from '@/__generated__/graphql';
import { assetUrl, careerIcon } from '@/utils';
import { scenarioCareerName } from '@/components/scenario/scenarioRoles';
import { ErrorMessage } from '@/components/global/ErrorMessage';
import { SortConfigDirection, useSortableData } from '@/hooks/useSortableData';
import { PeriodPicker, monthKeyForDate } from './PeriodPicker';
import {
  type Period,
  buildMonthPeriod,
  buildYtdPeriod,
  monthLabelForKey,
  monthShortLabelForKey,
  parseMonthKey,
  previousMonthKey,
  trailingMonthKeys,
} from './periodUtils';

// This page used to ask production-api.waremu.com's activeCharactersStats
// for a full month directly, which is an expensive live aggregate scan —
// busy months reliably blew past the API's own ~60s timeout even split
// into 25 per-career requests. Instead, a small Cloudflare Worker
// (killboard-class-activity) polls Skirmishes every 5 minutes and keeps a
// running de-duplicated ledger in D1. This page reads pre-aggregated
// totals from that Worker's /class-activity-range endpoint, which counts
// DISTINCT characters across any inclusive range of calendar-month
// buckets - a single month, a quarter, a half-year, a year, or a trailing
// 12-month window are all just different [from, to] ranges to it.
const CLASS_ACTIVITY_WORKER_URL =
  'https://killboard-class-activity.tcates79.workers.dev';

const REALM_ORDER = 0;
const REALM_DESTRUCTION = 1;

const CAREER_META: {
  career: Career;
  realm: typeof REALM_ORDER | typeof REALM_DESTRUCTION;
}[] = [
  { career: Career.Archmage, realm: REALM_ORDER },
  { career: Career.BrightWizard, realm: REALM_ORDER },
  { career: Career.Engineer, realm: REALM_ORDER },
  { career: Career.IronBreaker, realm: REALM_ORDER },
  { career: Career.KnightOfTheBlazingSun, realm: REALM_ORDER },
  { career: Career.RunePriest, realm: REALM_ORDER },
  { career: Career.ShadowWarrior, realm: REALM_ORDER },
  { career: Career.Slayer, realm: REALM_ORDER },
  { career: Career.SwordMaster, realm: REALM_ORDER },
  { career: Career.WarriorPriest, realm: REALM_ORDER },
  { career: Career.WhiteLion, realm: REALM_ORDER },
  { career: Career.WitchHunter, realm: REALM_ORDER },
  { career: Career.BlackGuard, realm: REALM_DESTRUCTION },
  { career: Career.BlackOrc, realm: REALM_DESTRUCTION },
  { career: Career.Choppa, realm: REALM_DESTRUCTION },
  { career: Career.Chosen, realm: REALM_DESTRUCTION },
  { career: Career.DiscipleOfKhaine, realm: REALM_DESTRUCTION },
  { career: Career.Magus, realm: REALM_DESTRUCTION },
  { career: Career.Marauder, realm: REALM_DESTRUCTION },
  { career: Career.Shaman, realm: REALM_DESTRUCTION },
  { career: Career.Sorcerer, realm: REALM_DESTRUCTION },
  { career: Career.SquigHerder, realm: REALM_DESTRUCTION },
  { career: Career.WitchElf, realm: REALM_DESTRUCTION },
  { career: Career.Zealot, realm: REALM_DESTRUCTION },
];

interface ClassActivityRow {
  career: Career;
  realm: 0 | 1;
  count: number;
}

interface ClassActivityRangeResponse {
  from: string;
  to: string;
  total: number;
  byCareer: Record<string, { realm: 0 | 1; count: number }>;
  monthsWithData: string[];
  coverageSince: string | null;
}

interface RangeState {
  loading: boolean;
  error?: Error;
  rows: ClassActivityRow[];
  total: number;
  monthsWithData: string[];
  coverageSince: string | null;
}

// How many "YYYY-MM" buckets an inclusive [from, to] range spans - used to
// tell "every month in this range has data" apart from "only some do."
const monthsInRange = (from: string, to: string): number => {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
};

const useClassActivityRange = (period: Period): RangeState => {
  const [state, setState] = useState<RangeState>({
    loading: true,
    rows: [],
    total: 0,
    monthsWithData: [],
    coverageSince: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${CLASS_ACTIVITY_WORKER_URL}/class-activity-range?from=${period.from}&to=${period.to}`,
        );
        const data = (await response.json()) as ClassActivityRangeResponse & {
          error?: string;
        };
        // Belt-and-suspenders: don't trust response.ok alone. The Worker
        // always returns an `error` field (never `byCareer`) on a
        // validation failure, whatever HTTP status carries it - checking
        // for that field directly means a malformed request (or a status
        // code an intermediary proxy/cache mangles) shows a clean error
        // message instead of crashing on `data.byCareer[...]` being
        // undefined.
        if (!response.ok || data.error || !data.byCareer) {
          throw new Error(
            data.error ??
              `Class Activity Worker responded with ${response.status}`,
          );
        }
        if (cancelled) {
          return;
        }
        setState({
          loading: false,
          rows: CAREER_META.map((meta) => ({
            career: meta.career,
            realm: meta.realm,
            count: data.byCareer[meta.career]?.count ?? 0,
          })),
          total: data.total,
          monthsWithData: data.monthsWithData,
          coverageSince: data.coverageSince,
        });
      } catch (caughtError) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error:
              caughtError instanceof Error
                ? caughtError
                : new Error('Unable to load character activity.'),
          }));
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to]);

  return state;
};

const RealmPanel = ({
  careers,
  maxCount,
  realmName,
  total,
}: {
  careers: ClassActivityRow[];
  maxCount: number;
  realmName: 'Order' | 'Destruction';
  total: number;
}): ReactElement => (
  <div className="class-activity-panel">
    <header className="class-activity-panel-header">
      <img
        alt={realmName}
        height={28}
        src={assetUrl(`/images/icons/scenario/${realmName.toLowerCase()}.png`)}
        width={28}
      />
      <h2>{realmName} activity</h2>
      <span>{total.toLocaleString()} active</span>
    </header>
    <ul className="class-activity-bars">
      {careers.map(({ career, count }) => (
        <li key={career}>
          <img alt={career} height={20} src={careerIcon(career)} width={20} />
          <span className="class-activity-bar-name">
            {scenarioCareerName(career)}
          </span>
          <div className="class-activity-bar-track">
            <span
              className={`class-activity-bar-fill class-activity-bar-fill-${
                realmName === 'Order' ? 'order' : 'destruction'
              }`}
              style={{
                width: `${maxCount === 0 ? 0 : (count / maxCount) * 100}%`,
              }}
            />
          </div>
          <strong className="class-activity-bar-count">
            {count.toLocaleString()}
          </strong>
        </li>
      ))}
    </ul>
  </div>
);

const ClassActivityOverview = ({
  currentMonth,
}: {
  currentMonth: string;
}): ReactElement => {
  const [period, setPeriod] = useState<Period>(() =>
    buildMonthPeriod(currentMonth),
  );
  const { loading, error, rows, total, monthsWithData, coverageSince } =
    useClassActivityRange(period);

  if (error) {
    return <ErrorMessage message={error.message} name={error.name} />;
  }

  const requestedMonths = monthsInRange(period.from, period.to);
  const isUntracked = !loading && monthsWithData.length === 0;
  const isPartiallyTracked =
    !loading &&
    monthsWithData.length > 0 &&
    monthsWithData.length < requestedMonths;
  const isOngoing = period.to >= currentMonth && coverageSince != null;

  const orderRows = rows
    .filter((row) => row.realm === REALM_ORDER)
    .toSorted((a, b) => b.count - a.count);
  const destructionRows = rows
    .filter((row) => row.realm === REALM_DESTRUCTION)
    .toSorted((a, b) => b.count - a.count);
  const orderTotal = orderRows.reduce((sum, row) => sum + row.count, 0);
  const destructionTotal = destructionRows.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const combinedTotal = orderTotal + destructionTotal;
  const orderSharePercent =
    combinedTotal === 0 ? 50 : (orderTotal / combinedTotal) * 100;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const tableRows = rows.toSorted((a, b) => b.count - a.count);

  return (
    <>
      <div className="class-activity-toolbar">
        <PeriodPicker
          currentMonth={currentMonth}
          idPrefix="overview"
          value={period}
          onChange={setPeriod}
        />
        <div className="class-activity-total">
          <strong>{loading ? '…' : total.toLocaleString()}</strong>
          <span>active characters in {period.label}</span>
        </div>
      </div>
      {(() => {
        if (loading) {
          return (
            <div className="scenario-window-loading">
              <progress className="progress is-small is-primary" />
              <strong>Loading activity for {period.label}…</strong>
            </div>
          );
        }
        if (isUntracked) {
          return (
            <div className="notification is-warning">
              <p>
                <strong>{period.label}</strong> doesn&apos;t have any recorded
                data yet — either it&apos;s further back than this page&apos;s
                historical backfill has reached so far, or it&apos;s in the
                future. That&apos;s not the same as zero players.
              </p>
            </div>
          );
        }
        return (
          <>
            {isOngoing && coverageSince != null && (
              <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
                Counting through {format(new Date(coverageSince), 'PPp')} so far
                for this period.
              </p>
            )}
            {isPartiallyTracked && (
              <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
                Only {monthsWithData.length} of {requestedMonths} months in this
                period have recorded data so far — the total likely undercounts
                the full period.
              </p>
            )}
            <div className="scenario-win-balance mb-4">
              <div className="scenario-win-balance-totals">
                <span>
                  <strong>{orderTotal.toLocaleString()}</strong> Order
                </span>
                <span>
                  <strong>{destructionTotal.toLocaleString()}</strong>{' '}
                  Destruction
                </span>
              </div>
              <div className="scenario-win-balance-bar">
                <span style={{ width: `${orderSharePercent}%` }} />
              </div>
            </div>
            <div className="class-activity-grid mb-4">
              <RealmPanel
                careers={orderRows}
                maxCount={maxCount}
                realmName="Order"
                total={orderTotal}
              />
              <RealmPanel
                careers={destructionRows}
                maxCount={maxCount}
                realmName="Destruction"
                total={destructionTotal}
              />
            </div>
            <table className="table is-fullwidth class-activity-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Realm</th>
                  <th>Active characters</th>
                  <th>% of realm</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const realmTotal =
                    row.realm === REALM_ORDER ? orderTotal : destructionTotal;
                  const share =
                    realmTotal === 0 ? 0 : (row.count / realmTotal) * 100;
                  return (
                    <tr key={row.career}>
                      <td>
                        <img
                          alt={row.career}
                          height={20}
                          src={careerIcon(row.career)}
                          width={20}
                        />{' '}
                        {scenarioCareerName(row.career)}
                      </td>
                      <td
                        className={
                          row.realm === REALM_ORDER
                            ? 'scenario-breakdown-order'
                            : 'scenario-breakdown-destruction'
                        }
                      >
                        {row.realm === REALM_ORDER ? 'Order' : 'Destruction'}
                      </td>
                      <td>{row.count.toLocaleString()}</td>
                      <td>{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        );
      })()}
    </>
  );
};

// Period B defaults to "the same month, one year earlier" than Period A's
// initial value (e.g. Period A = July 2026 defaults Period B to July
// 2025) - the exact comparison the user asked for out of the box. Both
// pickers stay fully independent after that; picking a new granularity or
// period on either side doesn't re-derive the other one automatically.
const deltaClassName = (change: number): string | undefined => {
  if (change > 0) {
    return 'compare-delta-positive';
  }
  if (change < 0) {
    return 'compare-delta-negative';
  }
  return undefined;
};

const MAX_COMPARE_PERIODS = 4;

// Same shape as useClassActivityRange above, but for a *list* of periods
// whose length changes at runtime (the Compare tab's Add/Remove period
// buttons). Calling useClassActivityRange once per period inside a .map()
// would violate the rules of hooks the moment that list's length changes
// between renders - the number of hook calls has to stay the same on
// every render. This is one hook with one effect that fetches every
// period in parallel and returns one state array instead, so the hook
// call count never depends on how many periods are being compared.
const useClassActivityRanges = (periods: Period[]): RangeState[] => {
  const idleState = (): RangeState => ({
    loading: true,
    rows: [],
    total: 0,
    monthsWithData: [],
    coverageSince: null,
  });
  const [states, setStates] = useState<RangeState[]>(() =>
    periods.map(idleState),
  );

  // periods' array identity changes every render (it's rebuilt by .map/
  // state setters), so it can't be the effect dependency directly without
  // refetching on every render - the actual [from, to] values are what
  // should trigger a refetch, so that's what's compared here instead.
  const key = periods.map((period) => `${period.from}|${period.to}`).join(',');

  useEffect(() => {
    let cancelled = false;
    setStates(periods.map(idleState));

    const loadOne = async (period: Period): Promise<RangeState> => {
      try {
        const response = await fetch(
          `${CLASS_ACTIVITY_WORKER_URL}/class-activity-range?from=${period.from}&to=${period.to}`,
        );
        const data = (await response.json()) as ClassActivityRangeResponse & {
          error?: string;
        };
        if (!response.ok || data.error || !data.byCareer) {
          throw new Error(
            data.error ??
              `Class Activity Worker responded with ${response.status}`,
          );
        }
        return {
          loading: false,
          rows: CAREER_META.map((meta) => ({
            career: meta.career,
            realm: meta.realm,
            count: data.byCareer[meta.career]?.count ?? 0,
          })),
          total: data.total,
          monthsWithData: data.monthsWithData,
          coverageSince: data.coverageSince,
        };
      } catch (caughtError) {
        return {
          loading: false,
          rows: [],
          total: 0,
          monthsWithData: [],
          coverageSince: null,
          error:
            caughtError instanceof Error
              ? caughtError
              : new Error('Unable to load character activity.'),
        };
      }
    };

    void (async () => {
      const results = await Promise.all(periods.map(loadOne));
      if (!cancelled) {
        setStates(results);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return states;
};

const ClassActivityCompare = ({
  currentMonth,
}: {
  currentMonth: string;
}): ReactElement => {
  const { t } = useTranslation(['pages']);
  const currentYear = parseMonthKey(currentMonth).year;
  // Defaults to "year to date" for this year vs last year rather than the
  // single-month comparison this tab used to default to - that's what
  // people actually reach for here (e.g. "have we had more active
  // characters so far this year than by this point last year?"), and Add
  // period below lets that extend to three (or more) years side by side.
  const [periods, setPeriods] = useState<Period[]>(() => [
    buildYtdPeriod(currentYear, currentMonth),
    buildYtdPeriod(currentYear - 1, currentMonth),
  ]);

  const results = useClassActivityRanges(periods);
  const loading = results.some((result) => result.loading);

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    return <ErrorMessage message={firstError.message} name={firstError.name} />;
  }

  const perPeriodRows = results.map((result) =>
    CAREER_META.map((meta) => ({
      career: meta.career,
      realm: meta.realm,
      count: result.rows.find((row) => row.career === meta.career)?.count ?? 0,
    })),
  );
  const maxCount = Math.max(1, ...perPeriodRows.flat().map((row) => row.count));

  // "Change" always compares the first and last periods in the list (in
  // whatever order they were added) - a direct generalization of the
  // original two-period A-minus-B column. With three or more periods, the
  // in-between ones still get their own raw-count columns; the single
  // delta column just needs two fixed endpoints to stay meaningful rather
  // than trying to show every pairwise combination at once.
  const firstRows = perPeriodRows[0] ?? [];
  const lastRows = perPeriodRows[perPeriodRows.length - 1] ?? [];
  const deltaByCareer = new Map(
    CAREER_META.map((meta) => {
      const countFirst =
        firstRows.find((r) => r.career === meta.career)?.count ?? 0;
      const countLast =
        lastRows.find((r) => r.career === meta.career)?.count ?? 0;
      const change = countLast - countFirst;
      const changePercent =
        countFirst === 0 ? null : (change / countFirst) * 100;
      return [meta.career, { change, changePercent }] as const;
    }),
  );
  const sortedCareerMeta = CAREER_META.toSorted(
    (x, y) =>
      Math.abs(deltaByCareer.get(y.career)?.change ?? 0) -
      Math.abs(deltaByCareer.get(x.career)?.change ?? 0),
  );

  const canAddPeriod = periods.length < MAX_COMPARE_PERIODS;
  const canRemovePeriod = periods.length > 2;

  return (
    <>
      {periods.map((period, index) => (
        <div className="class-activity-toolbar mb-2" key={index}>
          <PeriodPicker
            currentMonth={currentMonth}
            idPrefix={`period-${index}`}
            value={period}
            onChange={(next) => {
              setPeriods((prev) =>
                prev.map((p, i) => (i === index ? next : p)),
              );
            }}
          />
          {canRemovePeriod && (
            <button
              aria-label={t('pages:classActivity.removePeriod')}
              className="delete"
              onClick={() => {
                setPeriods((prev) => prev.filter((_, i) => i !== index));
              }}
              type="button"
            />
          )}
        </div>
      ))}
      {canAddPeriod && (
        <button
          className="button is-small mb-4"
          onClick={() => {
            setPeriods((prev) => [
              ...prev,
              buildYtdPeriod(currentYear - prev.length, currentMonth),
            ]);
          }}
          type="button"
        >
          + {t('pages:classActivity.addPeriod')}
        </button>
      )}
      {loading ? (
        <div className="scenario-window-loading">
          <progress className="progress is-small is-primary" />
          <strong>
            Loading {periods.map((period) => period.label).join(' vs ')}…
          </strong>
        </div>
      ) : (
        <>
          <div className="compare-columns">
            {periods.map((period, index) => {
              const rows = perPeriodRows[index] ?? [];
              const order = rows
                .filter((r) => r.realm === REALM_ORDER)
                .toSorted((x, y) => y.count - x.count);
              const dest = rows
                .filter((r) => r.realm === REALM_DESTRUCTION)
                .toSorted((x, y) => y.count - x.count);
              const result = results[index];
              return (
                <div key={index}>
                  <div className="compare-period-heading">
                    {period.label} — {result.total.toLocaleString()} active
                    {result.monthsWithData.length === 0 &&
                      ' (no data recorded)'}
                  </div>
                  <div className="class-activity-grid">
                    <RealmPanel
                      careers={order}
                      maxCount={maxCount}
                      realmName="Order"
                      total={order.reduce((sum, r) => sum + r.count, 0)}
                    />
                    <RealmPanel
                      careers={dest}
                      maxCount={maxCount}
                      realmName="Destruction"
                      total={dest.reduce((sum, r) => sum + r.count, 0)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <table className="table is-fullwidth class-activity-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Realm</th>
                {periods.map((period, index) => (
                  <th key={index}>{period.label}</th>
                ))}
                {periods.length >= 2 && (
                  <th>
                    {t('pages:classActivity.change')} (
                    {periods[periods.length - 1].label} vs {periods[0].label})
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedCareerMeta.map((meta) => {
                const delta = deltaByCareer.get(meta.career) ?? {
                  change: 0,
                  changePercent: null,
                };
                return (
                  <tr key={meta.career}>
                    <td>
                      <img
                        alt={meta.career}
                        height={20}
                        src={careerIcon(meta.career)}
                        width={20}
                      />{' '}
                      {scenarioCareerName(meta.career)}
                    </td>
                    <td
                      className={
                        meta.realm === REALM_ORDER
                          ? 'scenario-breakdown-order'
                          : 'scenario-breakdown-destruction'
                      }
                    >
                      {meta.realm === REALM_ORDER ? 'Order' : 'Destruction'}
                    </td>
                    {perPeriodRows.map((rows, index) => (
                      <td key={index}>
                        {(
                          rows.find((r) => r.career === meta.career)?.count ?? 0
                        ).toLocaleString()}
                      </td>
                    ))}
                    <td className={deltaClassName(delta.change)}>
                      {delta.change > 0 ? '+' : ''}
                      {delta.change.toLocaleString()}
                      {delta.changePercent != null && (
                        <>
                          {' '}
                          ({delta.change > 0 ? '+' : ''}
                          {delta.changePercent.toFixed(0)}%)
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
};

// Fetches each of `months` individually (in parallel) rather than one
// summed range - the Worker's /class-activity-range endpoint only
// returns a total for whatever [from, to] it's given, so a real
// month-by-month trend needs one request per month. That's 12 small
// requests instead of the 1 the other two tabs make; acceptable since
// this tab is a deliberate "look at the shape over a year" view, not
// the page's default, so it isn't paying that cost on every visit.
const useClassActivityMonths = (
  months: string[],
): {
  loading: boolean;
  error?: Error;
  byMonth: Record<string, ClassActivityRangeResponse>;
} => {
  const [state, setState] = useState<{
    loading: boolean;
    error?: Error;
    byMonth: Record<string, ClassActivityRangeResponse>;
  }>({ loading: true, byMonth: {} });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    const load = async (): Promise<void> => {
      try {
        const results = await Promise.all(
          months.map(async (month) => {
            const response = await fetch(
              `${CLASS_ACTIVITY_WORKER_URL}/class-activity-range?from=${month}&to=${month}`,
            );
            const data =
              (await response.json()) as ClassActivityRangeResponse & {
                error?: string;
              };
            if (!response.ok || data.error || !data.byCareer) {
              throw new Error(
                data.error ??
                  `Class Activity Worker responded with ${response.status}`,
              );
            }
            return [month, data] as const;
          }),
        );
        if (cancelled) {
          return;
        }
        setState({ loading: false, byMonth: Object.fromEntries(results) });
      } catch (caughtError) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error:
              caughtError instanceof Error
                ? caughtError
                : new Error('Unable to load character activity.'),
          }));
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // months is a freshly-built array every render (trailingMonthKeys
    // returns a new array each call) - depending on its joined value
    // instead of the array reference avoids refetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(',')]);

  return state;
};

interface ClassActivityRoleRangeResponse {
  from: string;
  to: string;
  total: number;
  byRealmRole: Record<string, Record<string, number>>;
  monthsWithRoleData: string[];
  coverageSince: string | null;
}

// Same one-request-per-month shape as useClassActivityMonths above, just
// against /class-activity-role-range instead of /class-activity-range.
// Kept as a separate hook/endpoint rather than folding role data into the
// existing response because role tracking was added later and its
// backfill covers a much shorter window (ROLE_BACKFILL_MONTHS in the
// Worker, currently 13 months) - monthsWithRoleData lets the frontend
// distinguish "not backfilled yet" from "genuinely zero this month"
// independently of the career data's own (longer) coverage.
const useClassActivityRoleMonths = (
  months: string[],
): {
  loading: boolean;
  error?: Error;
  byMonth: Record<string, ClassActivityRoleRangeResponse>;
} => {
  const [state, setState] = useState<{
    loading: boolean;
    error?: Error;
    byMonth: Record<string, ClassActivityRoleRangeResponse>;
  }>({ loading: true, byMonth: {} });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    const load = async (): Promise<void> => {
      try {
        const results = await Promise.all(
          months.map(async (month) => {
            const response = await fetch(
              `${CLASS_ACTIVITY_WORKER_URL}/class-activity-role-range?from=${month}&to=${month}`,
            );
            const data =
              (await response.json()) as ClassActivityRoleRangeResponse & {
                error?: string;
              };
            if (!response.ok || data.error || !data.byRealmRole) {
              throw new Error(
                data.error ??
                  `Class Activity Worker responded with ${response.status}`,
              );
            }
            return [month, data] as const;
          }),
        );
        if (cancelled) {
          return;
        }
        setState({ loading: false, byMonth: Object.fromEntries(results) });
      } catch (caughtError) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error:
              caughtError instanceof Error
                ? caughtError
                : new Error('Unable to load role activity.'),
          }));
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(',')]);

  return state;
};

// Shows each class's active-character count across the trailing 12
// months plus its 12-month average, so a reviewer can tell whether the
// current month is normal for that class or an outlier - something
// neither Overview (one snapshot) nor Compare (two arbitrary snapshots)
// answers on its own.
const formatCompactCount = (count: number): string =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);

const TrendSparklineCell = ({
  monthly,
  maxMonthly,
  months,
  barColorClass,
}: {
  monthly: number[];
  maxMonthly: number;
  months: string[];
  barColorClass: string;
}): ReactElement => (
  <div className="class-activity-sparkline">
    {monthly.map((count, index) => (
      <div className="class-activity-sparkline-col" key={months[index]}>
        <span className="class-activity-sparkline-value">
          {count > 0 ? formatCompactCount(count) : ''}
        </span>
        <div className="class-activity-sparkline-bar-track">
          <span
            className={[
              'class-activity-sparkline-bar',
              barColorClass,
              index === months.length - 1
                ? 'class-activity-sparkline-bar-current'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              height: `${(count / maxMonthly) * 100}%`,
            }}
            title={`${monthLabelForKey(months[index])}: ${count.toLocaleString()}`}
          />
        </div>
      </div>
    ))}
  </div>
);

const ClassActivityTrend = ({
  currentMonth,
}: {
  currentMonth: string;
}): ReactElement => {
  const { t } = useTranslation(['pages']);
  // Defaults to last month, not the actual current month - the current
  // month is still accumulating, so an average window ending on it would
  // always look like a decline (see the isEndMonthOngoing handling below).
  // The user can pick any month via the picker, including the current one.
  const [endMonth, setEndMonth] = useState<string>(() =>
    previousMonthKey(currentMonth),
  );
  const months = trailingMonthKeys(endMonth, 12);
  const { loading, error, byMonth } = useClassActivityMonths(months);

  const monthsWithData = months.filter(
    (month) => (byMonth[month]?.monthsWithData.length ?? 0) > 0,
  );
  // The final month in this window is whichever month was picked as the
  // window's end. If that's the actual current (still-accumulating) month,
  // its total is only a partial-month figure - not comparable to the 11
  // fully-elapsed months around it, so it's excluded from the average and
  // flagged as "in progress" instead of a misleading "vs average" percent
  // (confirmed against real data: a mid-month partial count came in at
  // roughly a quarter of the prior *complete* month's final total, which
  // is normal accumulation, not an actual drop in activity).
  // The worker's coverageSince field is a global "data valid as of" cursor
  // that's populated on every response, even for months that finished long
  // ago - it is NOT a per-month "still counting" flag by itself. It only
  // means "still in progress" when the requested month is the actual
  // current calendar month (mirrors the `period.to >= currentMonth` gate
  // the Overview tab uses for its own "Counting through ..." note).
  const endMonthCoverageSince = byMonth[endMonth]?.coverageSince ?? null;
  const isEndMonthOngoing =
    endMonth === currentMonth && endMonthCoverageSince != null;
  const isFullyTracked = monthsWithData.length === months.length;

  // Shared by every per-class row and the "All classes" total row below -
  // same average/vsAverage/in-progress-exclusion rules, just given a
  // different `monthly` series to crunch.
  const computeTrendStats = (
    monthly: number[],
  ): {
    monthly: number[];
    average: number;
    currentCount: number;
    vsAverage: number | null;
    maxMonthly: number;
  } => {
    const trackedCounts = months
      .map((month, index) => ({ month, count: monthly[index] }))
      .filter(({ month }) => monthsWithData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ count }) => count);
    const average =
      trackedCounts.length === 0
        ? 0
        : trackedCounts.reduce((sum, count) => sum + count, 0) /
          trackedCounts.length;
    const currentCount = monthly.at(-1) ?? 0;
    const vsAverage =
      average === 0 || isEndMonthOngoing
        ? null
        : ((currentCount - average) / average) * 100;
    const maxMonthly = Math.max(1, ...monthly);
    return { monthly, average, currentCount, vsAverage, maxMonthly };
  };

  // Uses the worker's own per-month `total` (distinct active characters),
  // not a sum of the per-career counts below - a character only has one
  // career, so the two agree in practice, but `total` is the source of
  // truth the Overview tab already uses for its own combined figure. It's
  // computed first so it can double as the denominator for each class's
  // "% of pop" share below.
  const totalMonthly = months.map((month) => byMonth[month]?.total ?? 0);
  const totalRow = computeTrendStats(totalMonthly);

  // A raw count only shows whether a class was played more or less, which
  // is indistinguishable from "the whole server was busier/quieter this
  // month" - it doesn't tell you if the class actually got more or less
  // popular *relative to everything else*. Dividing by that month's total
  // (rather than comparing a class's raw count to its own average, which
  // is what computeTrendStats already does above) answers that: a class
  // holding a bigger or smaller slice of the population, independent of
  // overall activity swings. (Flagged by R1CH in Discord - "shouldn't
  // that show percentage? Otherwise it's just a proxy for activity.")
  const computeShareStats = (
    monthly: number[],
  ): {
    shareMonthly: number[];
    shareAverage: number;
    currentShare: number;
    shareVsAverage: number | null;
  } => {
    const shareMonthly = monthly.map((count, index) =>
      totalMonthly[index] > 0 ? (count / totalMonthly[index]) * 100 : 0,
    );
    const trackedShares = months
      .map((month, index) => ({ month, share: shareMonthly[index] }))
      .filter(({ month }) => monthsWithData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ share }) => share);
    const shareAverage =
      trackedShares.length === 0
        ? 0
        : trackedShares.reduce((sum, share) => sum + share, 0) /
          trackedShares.length;
    const currentShare = shareMonthly.at(-1) ?? 0;
    const shareVsAverage =
      trackedShares.length === 0 || isEndMonthOngoing
        ? null
        : currentShare - shareAverage;
    return { shareMonthly, shareAverage, currentShare, shareVsAverage };
  };

  const unsortedTrendRows = CAREER_META.map((meta) => {
    const monthly = months.map(
      (month) => byMonth[month]?.byCareer[meta.career]?.count ?? 0,
    );
    return {
      career: meta.career,
      careerName: scenarioCareerName(meta.career),
      realm: meta.realm,
      ...computeTrendStats(monthly),
      ...computeShareStats(monthly),
    };
  });

  // Hooks must run unconditionally on every render (including the loading
  // and error states below), so this is called up here rather than after
  // the early returns further down.
  const {
    items: trendRows,
    requestSort,
    sortConfig,
  } = useSortableData(unsortedTrendRows, {
    direction: SortConfigDirection.descending,
    key: 'currentCount',
  });
  const getSortClass = (key: string): string => {
    if (!sortConfig || sortConfig.key !== key) {
      return '';
    }
    return sortConfig.direction;
  };

  if (error) {
    return <ErrorMessage message={error.message} name={error.name} />;
  }

  if (loading) {
    return (
      <div className="scenario-window-loading">
        <progress className="progress is-small is-primary" />
        <strong>Loading last 12 months…</strong>
      </div>
    );
  }

  return (
    <>
      <label className="class-activity-trend-month-picker">
        <span>Average ending</span>
        <input
          max={currentMonth}
          onChange={(event) => {
            if (event.target.value) {
              setEndMonth(event.target.value);
            }
          }}
          type="month"
          value={endMonth}
        />
      </label>
      <p className="class-activity-trend-range">
        {monthLabelForKey(months[0])} &ndash;{' '}
        {monthLabelForKey(months.at(-1) ?? endMonth)}
      </p>
      {isEndMonthOngoing && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          {monthLabelForKey(endMonth)} is still in progress (counting through{' '}
          {new Date(endMonthCoverageSince).toLocaleString()} so far), so it's
          excluded from the 12-month average and its &quot;vs average&quot;
          below - comparing a partial month against 11 complete ones would
          always look like a big drop even when activity is normal.
        </p>
      )}
      {!isFullyTracked && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          Only {monthsWithData.length} of {months.length} months in this window
          have recorded data so far - the average and trend likely undercount
          the full window.
        </p>
      )}
      <table className="table is-fullwidth class-activity-table">
        <thead className="is-relative">
          <tr>
            <th
              className={clsx('is-clickable', getSortClass('careerName'))}
              onClick={() => requestSort('careerName')}
            >
              Class
            </th>
            <th
              className={clsx('is-clickable', getSortClass('realm'))}
              onClick={() => requestSort('realm')}
            >
              Realm
            </th>
            <th>
              Trend (last 12 months)
              <div className="class-activity-sparkline-axis">
                <span>{monthShortLabelForKey(months[0])}</span>
                <span>{monthShortLabelForKey(months.at(-1) ?? endMonth)}</span>
              </div>
            </th>
            <th
              className={clsx('is-clickable', getSortClass('currentCount'))}
              onClick={() => requestSort('currentCount')}
            >
              {monthLabelForKey(endMonth)}
            </th>
            <th
              className={clsx('is-clickable', getSortClass('average'))}
              onClick={() => requestSort('average')}
            >
              {t('pages:classActivity.trendAverage')}
            </th>
            <th
              className={clsx('is-clickable', getSortClass('vsAverage'))}
              onClick={() => requestSort('vsAverage')}
            >
              {t('pages:classActivity.trendVsAverage')}
            </th>
            <th
              className={clsx('is-clickable', getSortClass('currentShare'))}
              onClick={() => requestSort('currentShare')}
            >
              % of pop
            </th>
            <th
              className={clsx('is-clickable', getSortClass('shareVsAverage'))}
              onClick={() => requestSort('shareVsAverage')}
            >
              Share vs avg
            </th>
          </tr>
        </thead>
        <tbody>
          {trendRows.map((row) => (
            <tr key={row.career}>
              <td>
                <img
                  alt={row.career}
                  height={20}
                  src={careerIcon(row.career)}
                  width={20}
                />{' '}
                {row.careerName}
              </td>
              <td
                className={
                  row.realm === REALM_ORDER
                    ? 'scenario-breakdown-order'
                    : 'scenario-breakdown-destruction'
                }
              >
                {row.realm === REALM_ORDER ? 'Order' : 'Destruction'}
              </td>
              <td>
                <TrendSparklineCell
                  barColorClass={`class-activity-sparkline-bar-${
                    row.realm === REALM_ORDER ? 'order' : 'destruction'
                  }`}
                  maxMonthly={row.maxMonthly}
                  monthly={row.monthly}
                  months={months}
                />
              </td>
              <td>{row.currentCount.toLocaleString()}</td>
              <td>{row.average === 0 ? '—' : row.average.toFixed(1)}</td>
              <td
                className={
                  row.vsAverage == null
                    ? undefined
                    : deltaClassName(row.vsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.vsAverage == null
                    ? '—'
                    : `${row.vsAverage > 0 ? '+' : ''}${row.vsAverage.toFixed(0)}%`}
              </td>
              <td>{row.currentShare.toFixed(1)}%</td>
              <td
                className={
                  row.shareVsAverage == null
                    ? undefined
                    : deltaClassName(row.shareVsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.shareVsAverage == null
                    ? '—'
                    : `${row.shareVsAverage > 0 ? '+' : ''}${row.shareVsAverage.toFixed(1)}pp`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="class-activity-trend-total-row">
            <td>All classes</td>
            <td>—</td>
            <td>
              <TrendSparklineCell
                barColorClass="class-activity-sparkline-bar-total"
                maxMonthly={totalRow.maxMonthly}
                monthly={totalRow.monthly}
                months={months}
              />
            </td>
            <td>{totalRow.currentCount.toLocaleString()}</td>
            <td>
              {totalRow.average === 0 ? '—' : totalRow.average.toFixed(1)}
            </td>
            <td
              className={
                totalRow.vsAverage == null
                  ? undefined
                  : deltaClassName(totalRow.vsAverage)
              }
            >
              {isEndMonthOngoing
                ? 'in progress'
                : totalRow.vsAverage == null
                  ? '—'
                  : `${totalRow.vsAverage > 0 ? '+' : ''}${totalRow.vsAverage.toFixed(0)}%`}
            </td>
            <td>100.0%</td>
            <td>—</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
};

// Separate tab from the per-class Trend view above - R1CH's original ask
// ("shouldn't that show percentage") turned out to mean something more
// specific once he clarified: he wanted to compare realm composition
// (Order vs Destruction share of the active population) over time, not
// per-class share. Same underlying data and math (reuses the same
// trend/share stat shapes as ClassActivityTrend), just aggregated by
// realm instead of by career, and with its own independent end-month
// picker rather than sharing state with the Trend tab.

const ROLE_ORDER = ['TANK', 'DPS', 'HEALER'] as const;
const ROLE_LABEL: Record<(typeof ROLE_ORDER)[number], string> = {
  TANK: 'Tank',
  DPS: 'DPS',
  HEALER: 'Healer',
};

// Tank/DPS/Healer split within each realm, over the same trailing window
// as everything else on this tab. This is the actual "is a DPS-specced
// healer counted as DPS" feature - role comes from the Worker having
// classified each Skirmish appearance by whether that character healed
// or dealt more damage in it (see the ROLE TRACKING note in the Worker
// source), not from a fixed career->role table, so a Zealot who nukes in
// most of their games shows up mostly under DPS here.
const RoleCompositionTable = ({
  months,
  endMonth,
  byRoleMonth,
  monthsWithRoleData,
  isEndMonthOngoing,
  realmMonthly,
}: {
  months: string[];
  endMonth: string;
  byRoleMonth: Record<string, ClassActivityRoleRangeResponse>;
  monthsWithRoleData: string[];
  isEndMonthOngoing: boolean;
  realmMonthly: Record<0 | 1, number[]>;
}): ReactElement => {
  const { t } = useTranslation(['pages']);

  const computeTrendStats = (
    monthly: number[],
  ): {
    monthly: number[];
    average: number;
    currentCount: number;
    vsAverage: number | null;
    maxMonthly: number;
  } => {
    const trackedCounts = months
      .map((month, index) => ({ month, count: monthly[index] }))
      .filter(({ month }) => monthsWithRoleData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ count }) => count);
    const average =
      trackedCounts.length === 0
        ? 0
        : trackedCounts.reduce((sum, count) => sum + count, 0) /
          trackedCounts.length;
    const currentCount = monthly.at(-1) ?? 0;
    const vsAverage =
      average === 0 || isEndMonthOngoing
        ? null
        : ((currentCount - average) / average) * 100;
    const maxMonthly = Math.max(1, ...monthly);
    return { monthly, average, currentCount, vsAverage, maxMonthly };
  };

  const computeShareStats = (
    monthly: number[],
    denominatorMonthly: number[],
  ): {
    currentShare: number;
    shareVsAverage: number | null;
  } => {
    const shareMonthly = monthly.map((count, index) =>
      denominatorMonthly[index] > 0
        ? (count / denominatorMonthly[index]) * 100
        : 0,
    );
    const trackedShares = months
      .map((month, index) => ({ month, share: shareMonthly[index] }))
      .filter(({ month }) => monthsWithRoleData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ share }) => share);
    const shareAverage =
      trackedShares.length === 0
        ? 0
        : trackedShares.reduce((sum, share) => sum + share, 0) /
          trackedShares.length;
    const currentShare = shareMonthly.at(-1) ?? 0;
    const shareVsAverage =
      trackedShares.length === 0 || isEndMonthOngoing
        ? null
        : currentShare - shareAverage;
    return { currentShare, shareVsAverage };
  };

  const rows = ([0, 1] as const).flatMap((realm) =>
    ROLE_ORDER.map((role) => {
      const monthly = months.map(
        (month) => byRoleMonth[month]?.byRealmRole[String(realm)]?.[role] ?? 0,
      );
      return {
        key: `${realm}-${role}`,
        realm,
        role,
        label: ROLE_LABEL[role],
        textClass:
          realm === REALM_ORDER
            ? 'scenario-breakdown-order'
            : 'scenario-breakdown-destruction',
        barColorClass:
          realm === REALM_ORDER
            ? 'class-activity-sparkline-bar-order'
            : 'class-activity-sparkline-bar-destruction',
        ...computeTrendStats(monthly),
        ...computeShareStats(monthly, realmMonthly[realm]),
      };
    }),
  );

  const isRoleFullyTracked = monthsWithRoleData.length === months.length;

  return (
    <>
      <h3 className="title is-6 class-activity-composition-title">
        Role composition (Tank / DPS / Healer)
      </h3>
      {!isRoleFullyTracked && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          Only {monthsWithRoleData.length} of {months.length} months have role
          data so far - role tracking (healing vs damage per Skirmish, so
          DPS-specced healers count as DPS) was added more recently than
          class/realm tracking and is still backfilling history.
        </p>
      )}
      <table className="table is-fullwidth class-activity-table">
        <thead>
          <tr>
            <th>Realm</th>
            <th>Role</th>
            <th>
              Trend (last 12 months)
              <div className="class-activity-sparkline-axis">
                <span>{monthShortLabelForKey(months[0])}</span>
                <span>{monthShortLabelForKey(months.at(-1) ?? endMonth)}</span>
              </div>
            </th>
            <th>{monthLabelForKey(endMonth)}</th>
            <th>{t('pages:classActivity.trendAverage')}</th>
            <th>{t('pages:classActivity.trendVsAverage')}</th>
            <th>% of realm</th>
            <th>Share vs avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className={row.textClass}>
                {row.realm === REALM_ORDER ? 'Order' : 'Destruction'}
              </td>
              <td>{row.label}</td>
              <td>
                <TrendSparklineCell
                  barColorClass={row.barColorClass}
                  maxMonthly={row.maxMonthly}
                  monthly={row.monthly}
                  months={months}
                />
              </td>
              <td>{row.currentCount.toLocaleString()}</td>
              <td>{row.average === 0 ? '—' : row.average.toFixed(1)}</td>
              <td
                className={
                  row.vsAverage == null
                    ? undefined
                    : deltaClassName(row.vsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.vsAverage == null
                    ? '—'
                    : `${row.vsAverage > 0 ? '+' : ''}${row.vsAverage.toFixed(0)}%`}
              </td>
              <td>{row.currentShare.toFixed(1)}%</td>
              <td
                className={
                  row.shareVsAverage == null
                    ? undefined
                    : deltaClassName(row.shareVsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.shareVsAverage == null
                    ? '—'
                    : `${row.shareVsAverage > 0 ? '+' : ''}${row.shareVsAverage.toFixed(1)}pp`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

const ClassActivityRealmTrend = ({
  currentMonth,
}: {
  currentMonth: string;
}): ReactElement => {
  const { t } = useTranslation(['pages']);
  const [endMonth, setEndMonth] = useState<string>(() =>
    previousMonthKey(currentMonth),
  );
  const months = trailingMonthKeys(endMonth, 12);
  const { loading, error, byMonth } = useClassActivityMonths(months);
  const { loading: roleLoading, byMonth: byRoleMonth } =
    useClassActivityRoleMonths(months);

  const monthsWithData = months.filter(
    (month) => (byMonth[month]?.monthsWithData.length ?? 0) > 0,
  );
  const monthsWithRoleData = months.filter(
    (month) => byRoleMonth[month]?.monthsWithRoleData.includes(month) ?? false,
  );
  const endMonthCoverageSince = byMonth[endMonth]?.coverageSince ?? null;
  const isEndMonthOngoing =
    endMonth === currentMonth && endMonthCoverageSince != null;
  const isFullyTracked = monthsWithData.length === months.length;

  const totalMonthly = months.map((month) => byMonth[month]?.total ?? 0);

  const computeTrendStats = (
    monthly: number[],
  ): {
    monthly: number[];
    average: number;
    currentCount: number;
    vsAverage: number | null;
    maxMonthly: number;
  } => {
    const trackedCounts = months
      .map((month, index) => ({ month, count: monthly[index] }))
      .filter(({ month }) => monthsWithData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ count }) => count);
    const average =
      trackedCounts.length === 0
        ? 0
        : trackedCounts.reduce((sum, count) => sum + count, 0) /
          trackedCounts.length;
    const currentCount = monthly.at(-1) ?? 0;
    const vsAverage =
      average === 0 || isEndMonthOngoing
        ? null
        : ((currentCount - average) / average) * 100;
    const maxMonthly = Math.max(1, ...monthly);
    return { monthly, average, currentCount, vsAverage, maxMonthly };
  };

  const computeShareStats = (
    monthly: number[],
  ): {
    shareAverage: number;
    currentShare: number;
    shareVsAverage: number | null;
  } => {
    const shareMonthly = monthly.map((count, index) =>
      totalMonthly[index] > 0 ? (count / totalMonthly[index]) * 100 : 0,
    );
    const trackedShares = months
      .map((month, index) => ({ month, share: shareMonthly[index] }))
      .filter(({ month }) => monthsWithData.includes(month))
      .filter(({ month }) => !(isEndMonthOngoing && month === endMonth))
      .map(({ share }) => share);
    const shareAverage =
      trackedShares.length === 0
        ? 0
        : trackedShares.reduce((sum, share) => sum + share, 0) /
          trackedShares.length;
    const currentShare = shareMonthly.at(-1) ?? 0;
    const shareVsAverage =
      trackedShares.length === 0 || isEndMonthOngoing
        ? null
        : currentShare - shareAverage;
    return { shareAverage, currentShare, shareVsAverage };
  };

  const monthlyForRealm = (
    realm: typeof REALM_ORDER | typeof REALM_DESTRUCTION,
  ): number[] =>
    months.map((month) =>
      CAREER_META.filter((meta) => meta.realm === realm).reduce(
        (sum, meta) =>
          sum + (byMonth[month]?.byCareer[meta.career]?.count ?? 0),
        0,
      ),
    );

  const orderMonthly = monthlyForRealm(REALM_ORDER);
  const destructionMonthly = monthlyForRealm(REALM_DESTRUCTION);

  const realmRows = [
    {
      key: 'order' as const,
      label: 'Order',
      textClass: 'scenario-breakdown-order',
      barColorClass: 'class-activity-sparkline-bar-order',
      ...computeTrendStats(orderMonthly),
      ...computeShareStats(orderMonthly),
    },
    {
      key: 'destruction' as const,
      label: 'Destruction',
      textClass: 'scenario-breakdown-destruction',
      barColorClass: 'class-activity-sparkline-bar-destruction',
      ...computeTrendStats(destructionMonthly),
      ...computeShareStats(destructionMonthly),
    },
  ];

  if (error) {
    return <ErrorMessage message={error.message} name={error.name} />;
  }

  if (loading) {
    return (
      <div className="scenario-window-loading">
        <progress className="progress is-small is-primary" />
        <strong>Loading last 12 months…</strong>
      </div>
    );
  }

  return (
    <>
      <label className="class-activity-trend-month-picker">
        <span>Average ending</span>
        <input
          max={currentMonth}
          onChange={(event) => {
            if (event.target.value) {
              setEndMonth(event.target.value);
            }
          }}
          type="month"
          value={endMonth}
        />
      </label>
      <p className="class-activity-trend-range">
        {monthLabelForKey(months[0])} &ndash;{' '}
        {monthLabelForKey(months.at(-1) ?? endMonth)}
      </p>
      {isEndMonthOngoing && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          {monthLabelForKey(endMonth)} is still in progress (counting through{' '}
          {new Date(endMonthCoverageSince).toLocaleString()} so far), so it's
          excluded from the 12-month average and its &quot;vs average&quot;
          below - comparing a partial month against 11 complete ones would
          always look like a big drop even when activity is normal.
        </p>
      )}
      {!isFullyTracked && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          Only {monthsWithData.length} of {months.length} months in this window
          have recorded data so far - the balance and trend likely undercount
          the full window.
        </p>
      )}
      <table className="table is-fullwidth class-activity-table">
        <thead>
          <tr>
            <th>Realm</th>
            <th>
              Trend (last 12 months)
              <div className="class-activity-sparkline-axis">
                <span>{monthShortLabelForKey(months[0])}</span>
                <span>{monthShortLabelForKey(months.at(-1) ?? endMonth)}</span>
              </div>
            </th>
            <th>{monthLabelForKey(endMonth)}</th>
            <th>{t('pages:classActivity.trendAverage')}</th>
            <th>{t('pages:classActivity.trendVsAverage')}</th>
            <th>% of pop</th>
            <th>Share vs avg</th>
          </tr>
        </thead>
        <tbody>
          {realmRows.map((row) => (
            <tr key={row.key}>
              <td className={row.textClass}>{row.label}</td>
              <td>
                <TrendSparklineCell
                  barColorClass={row.barColorClass}
                  maxMonthly={row.maxMonthly}
                  monthly={row.monthly}
                  months={months}
                />
              </td>
              <td>{row.currentCount.toLocaleString()}</td>
              <td>{row.average === 0 ? '—' : row.average.toFixed(1)}</td>
              <td
                className={
                  row.vsAverage == null
                    ? undefined
                    : deltaClassName(row.vsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.vsAverage == null
                    ? '—'
                    : `${row.vsAverage > 0 ? '+' : ''}${row.vsAverage.toFixed(0)}%`}
              </td>
              <td>{row.currentShare.toFixed(1)}%</td>
              <td
                className={
                  row.shareVsAverage == null
                    ? undefined
                    : deltaClassName(row.shareVsAverage)
                }
              >
                {isEndMonthOngoing
                  ? 'in progress'
                  : row.shareVsAverage == null
                    ? '—'
                    : `${row.shareVsAverage > 0 ? '+' : ''}${row.shareVsAverage.toFixed(1)}pp`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {roleLoading ? (
        <div className="scenario-window-loading">
          <progress className="progress is-small is-primary" />
          <strong>Loading role data…</strong>
        </div>
      ) : (
        <RoleCompositionTable
          byRoleMonth={byRoleMonth}
          endMonth={endMonth}
          isEndMonthOngoing={isEndMonthOngoing}
          months={months}
          monthsWithRoleData={monthsWithRoleData}
          realmMonthly={{ 0: orderMonthly, 1: destructionMonthly }}
        />
      )}
    </>
  );
};

// LIVE POP: raw per-realm counts from the population_snapshots table (see
// the Worker's insertPopulationSnapshot for what these numbers actually
// mean - distinct characters seen fighting in that ~5-minute polling
// window, not a literal "logged in" count, since the production API has
// no such field). v1 keeps this deliberately small: two fixed ranges (24
// hours, 7 days) and a raw point-per-tick line chart - no bucketing, no
// tier split, since the Worker endpoint already caps out well before that
// becomes necessary at these ranges.
interface PopulationSnapshotRow {
  polled_at: string;
  realm: 0 | 1;
  count: number;
}

interface PopulationSnapshotsResponse {
  hours: number;
  since: string;
  snapshots: PopulationSnapshotRow[];
}

interface PopulationPoint {
  time: string;
  order: number;
  destruction: number;
}

interface LivePopState {
  loading: boolean;
  error?: Error;
  points: PopulationPoint[];
}

const usePopulationSnapshots = (hours: number): LivePopState => {
  const [state, setState] = useState<LivePopState>({
    loading: true,
    points: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${CLASS_ACTIVITY_WORKER_URL}/population-snapshots?hours=${hours}`,
        );
        const data = (await response.json()) as PopulationSnapshotsResponse & {
          error?: string;
        };
        if (!response.ok || data.error || !data.snapshots) {
          throw new Error(
            data.error ??
              `Class Activity Worker responded with ${response.status}`,
          );
        }
        if (cancelled) {
          return;
        }

        // Each poll tick writes one row per realm sharing the same
        // polled_at timestamp - pivot those pairs back into one point per
        // tick with both realms side by side, which is what the chart
        // actually wants to plot.
        const byTime = new Map<string, PopulationPoint>();
        for (const snapshot of data.snapshots) {
          const point = byTime.get(snapshot.polled_at) ?? {
            time: snapshot.polled_at,
            order: 0,
            destruction: 0,
          };
          if (snapshot.realm === REALM_ORDER) {
            point.order = snapshot.count;
          } else {
            point.destruction = snapshot.count;
          }
          byTime.set(snapshot.polled_at, point);
        }
        const points = [...byTime.values()].sort((a, b) =>
          a.time.localeCompare(b.time),
        );

        setState({ loading: false, points });
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            points: [],
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [hours]);

  return state;
};

// Chart.js instance lives outside React state on purpose - re-creating the
// canvas on every data refresh causes a visible flash/reflow, so this
// mounts the chart once and pushes new data into the existing instance
// instead. Two effects, not one: the first runs only on mount/unmount (the
// canvas ref never changes), the second re-runs whenever `points` changes
// and just mutates the already-mounted chart's data in place.
const LivePopChart = ({
  points,
}: {
  points: PopulationPoint[];
}): ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Order',
            data: [],
            borderColor: 'rgb(72, 128, 255)',
            backgroundColor: 'rgba(72, 128, 255, 0.15)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'Destruction',
            data: [],
            borderColor: 'rgb(235, 70, 70)',
            backgroundColor: 'rgba(235, 70, 70, 0.15)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            ticks: { color: 'rgba(255, 255, 255, 0.6)', maxTicksLimit: 10 },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: 'rgba(255, 255, 255, 0.6)' },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
          },
        },
        plugins: {
          legend: { labels: { color: 'rgba(255, 255, 255, 0.85)' } },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.data.labels = points.map((point) =>
      format(new Date(point.time), 'MMM d, HH:mm'),
    );
    chart.data.datasets[0].data = points.map((point) => point.order);
    chart.data.datasets[1].data = points.map((point) => point.destruction);
    chart.update();
  }, [points]);

  return (
    <div className="class-activity-livepop-chart">
      <canvas ref={canvasRef} />
    </div>
  );
};

const LIVE_POP_RANGES: { key: string; label: string; hours: number }[] = [
  { key: '24h', label: 'Last 24 hours', hours: 24 },
  { key: '7d', label: 'Last 7 days', hours: 24 * 7 },
];

const ClassActivityLivePop = (): ReactElement => {
  const [rangeKey, setRangeKey] = useState<string>(
    LIVE_POP_RANGES[0]?.key ?? '24h',
  );
  const range =
    LIVE_POP_RANGES.find((candidate) => candidate.key === rangeKey) ??
    LIVE_POP_RANGES[0];
  const { loading, error, points } = usePopulationSnapshots(range?.hours ?? 24);
  const latest = points.at(-1);

  return (
    <>
      <div className="class-activity-subtabs class-activity-livepop-ranges">
        {LIVE_POP_RANGES.map((candidate) => (
          <button
            className={candidate.key === rangeKey ? 'is-active' : ''}
            key={candidate.key}
            onClick={() => {
              setRangeKey(candidate.key);
            }}
            type="button"
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <p className="class-activity-trend-range">
        Order vs Destruction characters active in RvR, sampled roughly every 5
        minutes.
      </p>
      {error && <ErrorMessage message={error.message} name={error.name} />}
      {loading && (
        <div className="scenario-window-loading">
          <progress className="progress is-small is-primary" />
          <strong>Loading population history…</strong>
        </div>
      )}
      {!loading && !error && points.length === 0 && (
        <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
          No population data yet for this window - tracking only just started,
          so give it a little time to fill in.
        </p>
      )}
      {!loading && !error && points.length > 0 && (
        <>
          {latest && (
            <p className="class-activity-trend-range">
              Right now:{' '}
              <span className="scenario-breakdown-order">
                {latest.order.toLocaleString()} Order
              </span>{' '}
              &middot;{' '}
              <span className="scenario-breakdown-destruction">
                {latest.destruction.toLocaleString()} Destruction
              </span>
            </p>
          )}
          <LivePopChart points={points} />
        </>
      )}
    </>
  );
};

export const ClassActivity = (): ReactElement => {
  const { t } = useTranslation(['pages']);
  const [subTab, setSubTab] = useState<
    'overview' | 'compare' | 'trend' | 'realms' | 'livepop'
  >('overview');
  const currentMonth = monthKeyForDate(new Date());

  return (
    <>
      <div className="class-activity-subtabs">
        <button
          className={subTab === 'overview' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setSubTab('overview');
          }}
        >
          {t('pages:classActivity.overview')}
        </button>
        <button
          className={subTab === 'compare' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setSubTab('compare');
          }}
        >
          {t('pages:classActivity.compare')}
        </button>
        <button
          className={subTab === 'trend' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setSubTab('trend');
          }}
        >
          {t('pages:classActivity.trend')}
        </button>
        <button
          className={subTab === 'realms' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setSubTab('realms');
          }}
        >
          Realms
        </button>
        <button
          className={subTab === 'livepop' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setSubTab('livepop');
          }}
        >
          Live Pop
        </button>
      </div>
      {subTab === 'overview' && (
        <ClassActivityOverview currentMonth={currentMonth} />
      )}
      {subTab === 'compare' && (
        <ClassActivityCompare currentMonth={currentMonth} />
      )}
      {subTab === 'trend' && <ClassActivityTrend currentMonth={currentMonth} />}
      {subTab === 'realms' && (
        <ClassActivityRealmTrend currentMonth={currentMonth} />
      )}
      {subTab === 'livepop' && <ClassActivityLivePop />}
    </>
  );
};
