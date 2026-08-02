import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ReactElement } from 'react';
import { Career } from '@/__generated__/graphql';
import { assetUrl, careerIcon } from '@/utils';
import { scenarioCareerName } from '@/components/scenario/scenarioRoles';
import { ErrorMessage } from '@/components/global/ErrorMessage';

// This page used to ask production-api.waremu.com's activeCharactersStats
// for a full month directly, which is an expensive live aggregate scan —
// busy months reliably blew past the API's own ~60s timeout even split
// into 25 per-career requests. Instead, a small Cloudflare Worker
// (killboard-population) polls Skirmishes every 5 minutes and keeps a
// running de-duplicated ledger in D1. This page just reads the
// pre-aggregated totals from that Worker, so a month's numbers come back
// instantly regardless of how much activity happened.
const POPULATION_WORKER_URL = 'https://killboard-population.tcates79.workers.dev';

// The Worker started polling on 2026-08-02. Months before that have no
// live-polled data. January 2026 is the one exception — it was backfilled
// once, directly in the Worker's database, from a scenario-participation
// sweep (so it's a same-ballpark estimate, not Skirmish-complete). Every
// other month before the launch month genuinely has nothing recorded, and
// that's different from "zero people played" — worth saying so rather than
// silently showing a 0.
const POLLER_LAUNCH_MONTH = '2026-08';
const BACKFILLED_MONTHS = new Set(['2026-01']);

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

const monthPattern = /^\d{4}-\d{2}$/;

interface PopulationRow {
  career: Career;
  realm: 0 | 1;
  count: number;
}

interface PopulationResponse {
  month: string;
  total: number;
  byCareer: Record<string, { realm: 0 | 1; count: number }>;
  coverageSince: string | null;
}

const RealmPanel = ({
  careers,
  maxCount,
  realmName,
  total,
}: {
  careers: PopulationRow[];
  maxCount: number;
  realmName: 'Order' | 'Destruction';
  total: number;
}): ReactElement => (
  <div className="population-panel">
    <header className="population-panel-header">
      <img
        alt={realmName}
        height={28}
        src={assetUrl(`/images/icons/scenario/${realmName.toLowerCase()}.png`)}
        width={28}
      />
      <h2>{realmName} population</h2>
      <span>{total.toLocaleString()} active</span>
    </header>
    <ul className="population-bars">
      {careers.map(({ career, count }) => (
        <li key={career}>
          <img alt={career} height={20} src={careerIcon(career)} width={20} />
          <span className="population-bar-name">
            {scenarioCareerName(career)}
          </span>
          <div className="population-bar-track">
            <span
              className={`population-bar-fill population-bar-fill-${
                realmName === 'Order' ? 'order' : 'destruction'
              }`}
              style={{
                width: `${maxCount === 0 ? 0 : (count / maxCount) * 100}%`,
              }}
            />
          </div>
          <strong className="population-bar-count">
            {count.toLocaleString()}
          </strong>
        </li>
      ))}
    </ul>
  </div>
);

export const CharacterPopulation = (): ReactElement => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthParam = searchParams.get('month') ?? '';
  const month = monthPattern.test(monthParam) ? monthParam : currentMonth;

  const [rows, setRows] = useState<PopulationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [coverageSince, setCoverageSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const loadPopulation = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${POPULATION_WORKER_URL}/population?month=${month}`,
        );
        if (!response.ok) {
          throw new Error(
            `Population Worker responded with ${response.status}`,
          );
        }
        const data = (await response.json()) as PopulationResponse;
        if (cancelled) {
          return;
        }
        setTotal(data.total);
        setCoverageSince(data.coverageSince);
        setRows(
          CAREER_META.map((meta) => ({
            career: meta.career,
            realm: meta.realm,
            count: data.byCareer[meta.career]?.count ?? 0,
          })),
        );
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError
              : new Error('Unable to load character population.'),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPopulation();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const onMonthChange = (value: string): void => {
    const next = new URLSearchParams(searchParams);
    if (monthPattern.test(value) && value !== currentMonth) {
      next.set('month', value);
    } else {
      next.delete('month');
    }
    setSearchParams(next, { replace: true });
  };

  const [labelYear, labelMonthIndex] = month.split('-').map(Number);
  const monthLabel = format(
    new Date(labelYear, labelMonthIndex - 1, 1),
    'MMMM yyyy',
  );

  if (error) {
    return <ErrorMessage message={error.message} name={error.name} />;
  }

  // Months before the poller existed (and that weren't separately
  // backfilled) genuinely have no data — that's different from "nobody
  // played," so say so instead of quietly showing a 0.
  const isUntrackedMonth =
    !loading &&
    total === 0 &&
    month < POLLER_LAUNCH_MONTH &&
    !BACKFILLED_MONTHS.has(month);

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
      <div className="population-toolbar">
        <label>
          <span>Month</span>
          <input
            max={currentMonth}
            type="month"
            value={month}
            onChange={(event) => {
              onMonthChange(event.target.value);
            }}
          />
        </label>
        <div className="population-total">
          <strong>{loading ? '…' : total.toLocaleString()}</strong>
          <span>active characters in {monthLabel}</span>
        </div>
      </div>
      {(() => {
        if (loading) {
          return (
            <div className="scenario-window-loading">
              <progress className="progress is-small is-primary" />
              <strong>Loading population for {monthLabel}…</strong>
            </div>
          );
        }
        if (isUntrackedMonth) {
          return (
            <div className="notification is-warning">
              <p>
                <strong>{monthLabel}</strong> is before this page started
                tracking population (August 2026), so there&apos;s no data
                recorded for it — that&apos;s not the same as zero players.
              </p>
            </div>
          );
        }
        return (
        <>
          {month === currentMonth && coverageSince != null && (
            <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
              Counting through {format(new Date(coverageSince), 'PPp')} so
              far this month.
            </p>
          )}
          {BACKFILLED_MONTHS.has(month) && (
            <p className="scenario-window-loading" style={{ opacity: 0.7 }}>
              This month was backfilled from scenario participation only, so
              it likely undercounts players who never queued for a
              scenario.
            </p>
          )}
          <div className="scenario-win-balance mb-4">
            <div className="scenario-win-balance-totals">
              <span>
                <strong>{orderTotal.toLocaleString()}</strong> Order
              </span>
              <span>
                <strong>{destructionTotal.toLocaleString()}</strong> Destruction
              </span>
            </div>
            <div className="scenario-win-balance-bar">
              <span style={{ width: `${orderSharePercent}%` }} />
            </div>
          </div>
          <div className="population-grid mb-4">
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
          <table className="table is-fullwidth population-table">
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
