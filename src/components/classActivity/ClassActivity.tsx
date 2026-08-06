import { format } from 'date-fns';
import { useEffect, useState } from 'react';
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
  monthLabelForKey,
  monthShortLabelForKey,
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

const oneYearBeforeMonth = (month: string): Period => {
  const [year, monthNum] = month.split('-').map(Number);
  return buildMonthPeriod(`${year - 1}-${String(monthNum).padStart(2, '0')}`);
};

const ClassActivityCompare = ({
  currentMonth,
}: {
  currentMonth: string;
}): ReactElement => {
  const [periodA, setPeriodA] = useState<Period>(() =>
    buildMonthPeriod(currentMonth),
  );
  const [periodB, setPeriodB] = useState<Period>(() =>
    oneYearBeforeMonth(currentMonth),
  );

  const a = useClassActivityRange(periodA);
  const b = useClassActivityRange(periodB);

  if (a.error || b.error) {
    const err = (a.error ?? b.error) as Error;
    return <ErrorMessage message={err.message} name={err.name} />;
  }

  const rowsA = CAREER_META.map((meta) => ({
    career: meta.career,
    realm: meta.realm,
    count: a.rows.find((row) => row.career === meta.career)?.count ?? 0,
  }));
  const rowsB = CAREER_META.map((meta) => ({
    career: meta.career,
    realm: meta.realm,
    count: b.rows.find((row) => row.career === meta.career)?.count ?? 0,
  }));

  const loading = a.loading || b.loading;

  const orderA = rowsA
    .filter((r) => r.realm === REALM_ORDER)
    .toSorted((x, y) => y.count - x.count);
  const destA = rowsA
    .filter((r) => r.realm === REALM_DESTRUCTION)
    .toSorted((x, y) => y.count - x.count);
  const orderB = rowsB
    .filter((r) => r.realm === REALM_ORDER)
    .toSorted((x, y) => y.count - x.count);
  const destB = rowsB
    .filter((r) => r.realm === REALM_DESTRUCTION)
    .toSorted((x, y) => y.count - x.count);
  const maxCount = Math.max(
    1,
    ...rowsA.map((r) => r.count),
    ...rowsB.map((r) => r.count),
  );

  const deltaRows = CAREER_META.map((meta) => {
    const countA = rowsA.find((r) => r.career === meta.career)?.count ?? 0;
    const countB = rowsB.find((r) => r.career === meta.career)?.count ?? 0;
    const change = countA - countB;
    const changePercent = countB === 0 ? null : (change / countB) * 100;
    return {
      career: meta.career,
      realm: meta.realm,
      countA,
      countB,
      change,
      changePercent,
    };
  }).toSorted((x, y) => Math.abs(y.change) - Math.abs(x.change));

  return (
    <>
      <div className="class-activity-toolbar">
        <PeriodPicker
          currentMonth={currentMonth}
          idPrefix="period-a"
          value={periodA}
          onChange={setPeriodA}
        />
      </div>
      <div className="class-activity-toolbar mb-4">
        <PeriodPicker
          currentMonth={currentMonth}
          idPrefix="period-b"
          value={periodB}
          onChange={setPeriodB}
        />
      </div>
      {loading ? (
        <div className="scenario-window-loading">
          <progress className="progress is-small is-primary" />
          <strong>
            Loading {periodA.label} vs {periodB.label}…
          </strong>
        </div>
      ) : (
        <>
          <div className="compare-columns">
            <div>
              <div className="compare-period-heading">
                {periodA.label} — {a.total.toLocaleString()} active
                {a.monthsWithData.length === 0 && ' (no data recorded)'}
              </div>
              <div className="class-activity-grid">
                <RealmPanel
                  careers={orderA}
                  maxCount={maxCount}
                  realmName="Order"
                  total={orderA.reduce((sum, r) => sum + r.count, 0)}
                />
                <RealmPanel
                  careers={destA}
                  maxCount={maxCount}
                  realmName="Destruction"
                  total={destA.reduce((sum, r) => sum + r.count, 0)}
                />
              </div>
            </div>
            <div>
              <div className="compare-period-heading">
                {periodB.label} — {b.total.toLocaleString()} active
                {b.monthsWithData.length === 0 && ' (no data recorded)'}
              </div>
              <div className="class-activity-grid">
                <RealmPanel
                  careers={orderB}
                  maxCount={maxCount}
                  realmName="Order"
                  total={orderB.reduce((sum, r) => sum + r.count, 0)}
                />
                <RealmPanel
                  careers={destB}
                  maxCount={maxCount}
                  realmName="Destruction"
                  total={destB.reduce((sum, r) => sum + r.count, 0)}
                />
              </div>
            </div>
          </div>
          <table className="table is-fullwidth class-activity-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Realm</th>
                <th>{periodA.label}</th>
                <th>{periodB.label}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {deltaRows.map((row) => (
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
                  <td>{row.countA.toLocaleString()}</td>
                  <td>{row.countB.toLocaleString()}</td>
                  <td className={deltaClassName(row.change)}>
                    {row.change > 0 ? '+' : ''}
                    {row.change.toLocaleString()}
                    {row.changePercent != null && (
                      <>
                        {' '}
                        ({row.change > 0 ? '+' : ''}
                        {row.changePercent.toFixed(0)}%)
                      </>
                    )}
                  </td>
                </tr>
              ))}
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

  const unsortedTrendRows = CAREER_META.map((meta) => {
    const monthly = months.map(
      (month) => byMonth[month]?.byCareer[meta.career]?.count ?? 0,
    );
    return {
      career: meta.career,
      careerName: scenarioCareerName(meta.career),
      realm: meta.realm,
      ...computeTrendStats(monthly),
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

  // Uses the worker's own per-month `total` (distinct active characters),
  // not a sum of the per-career counts above - a character only has one
  // career, so the two agree in practice, but `total` is the source of
  // truth the Overview tab already uses for its own combined figure.
  const totalMonthly = months.map((month) => byMonth[month]?.total ?? 0);
  const totalRow = computeTrendStats(totalMonthly);

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
        <thead>
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
          </tr>
        </tfoot>
      </table>
    </>
  );
};

export const ClassActivity = (): ReactElement => {
  const { t } = useTranslation(['pages']);
  const [subTab, setSubTab] = useState<'overview' | 'compare' | 'trend'>(
    'overview',
  );
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
      </div>
      {subTab === 'overview' && (
        <ClassActivityOverview currentMonth={currentMonth} />
      )}
      {subTab === 'compare' && (
        <ClassActivityCompare currentMonth={currentMonth} />
      )}
      {subTab === 'trend' && <ClassActivityTrend currentMonth={currentMonth} />}
    </>
  );
};
