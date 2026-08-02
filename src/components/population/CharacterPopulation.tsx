import { gql } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ReactElement } from 'react';
import { Career } from '@/__generated__/graphql';
import { assetUrl, careerIcon } from '@/utils';
import { scenarioCareerName } from '@/components/scenario/scenarioRoles';
import { ErrorMessage } from '@/components/global/ErrorMessage';

// A full-month activeCharactersStats(from, to, career) call is an expensive
// aggregate scan on its own. Aliasing all 24 careers plus the overall total
// into a single query made the server resolve them one after another inside
// one request, which blew past its 1-minute timeout for any month with more
// than a few hours of data. Firing 25 separate requests instead lets the
// browser run them concurrently, so each one only has to clear its own
// timeout window rather than sharing one across all 25.
const ACTIVE_CHARACTER_STAT = gql`
  query GetActiveCharacterStat(
    $from: DateTime!
    $to: DateTime!
    $career: Career
  ) {
    activeCharactersStats(from: $from, to: $to, career: $career)
  }
`;

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
  const client = useApolloClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthParam = searchParams.get('month') ?? '';
  const month = monthPattern.test(monthParam) ? monthParam : currentMonth;

  const [rows, setRows] = useState<PopulationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const [year, monthIndex] = month.split('-').map(Number);
    const from = new Date(year, monthIndex - 1, 1);
    // Upper bound is the first moment of the *next* month, so the query
    // covers the entire selected month regardless of whether the API
    // treats `to` as inclusive or exclusive.
    const to = new Date(year, monthIndex, 1);
    const variables = { from: from.toISOString(), to: to.toISOString() };

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const loadAll = async (): Promise<void> => {
      try {
        const [totalResult, ...careerResults] = await Promise.all([
          client.query<{ activeCharactersStats: number | null }>({
            fetchPolicy: 'cache-first',
            query: ACTIVE_CHARACTER_STAT,
            variables,
          }),
          ...CAREER_META.map((meta) =>
            client.query<{ activeCharactersStats: number | null }>({
              fetchPolicy: 'cache-first',
              query: ACTIVE_CHARACTER_STAT,
              variables: { ...variables, career: meta.career },
            }),
          ),
        ]);
        if (cancelled) {
          return;
        }
        setTotal(totalResult.data?.activeCharactersStats ?? 0);
        setRows(
          CAREER_META.map((meta, index) => ({
            career: meta.career,
            realm: meta.realm,
            count: careerResults[index]?.data?.activeCharactersStats ?? 0,
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

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [client, month]);

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
    // A full calendar month is an expensive aggregate scan on the API side
    // — even split into 25 separate requests, a busy month can still clear
    // the API's own 1-minute-per-request timeout. This isn't fixable from
    // here; surface it plainly rather than showing a raw GraphQL error.
    if (error.message.toLowerCase().includes('timeout')) {
      return (
        <div className="notification is-warning">
          <p>
            <strong>{monthLabel}</strong> has too much activity for the API to
            total up within its own time limit. This isn&apos;t something the
            page can retry its way around — try a more recent month (it only has
            to scan what&apos;s happened so far), or ask about widening the
            timeout on the API side for a full month.
          </p>
        </div>
      );
    }
    return <ErrorMessage message={error.message} name={error.name} />;
  }

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
      {loading ? (
        <div className="scenario-window-loading">
          <progress className="progress is-small is-primary" />
          <strong>Gathering population for {monthLabel}…</strong>
          <span>
            Fetching each class separately so a busy full month doesn&apos;t
            time out the whole page.
          </span>
        </div>
      ) : (
        <>
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
      )}
    </>
  );
};
