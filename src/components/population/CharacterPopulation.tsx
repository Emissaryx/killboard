import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router';
import type { ReactElement } from 'react';
import { Career } from '@/__generated__/graphql';
import { assetUrl, careerIcon } from '@/utils';
import { scenarioCareerName } from '@/components/scenario/scenarioRoles';
import { ErrorMessage } from '@/components/global/ErrorMessage';

// One activeCharactersStats(from, to, career) call per career plus an
// overall total, folded into a single request via aliases so a full
// per-class population breakdown is one round trip instead of 25.
const ACTIVE_CHARACTER_POPULATION = gql`
  query GetActiveCharacterPopulation($from: DateTime!, $to: DateTime!) {
    total: activeCharactersStats(from: $from, to: $to)
    archmage: activeCharactersStats(from: $from, to: $to, career: ARCHMAGE)
    blackGuard: activeCharactersStats(from: $from, to: $to, career: BLACK_GUARD)
    blackOrc: activeCharactersStats(from: $from, to: $to, career: BLACK_ORC)
    brightWizard: activeCharactersStats(
      from: $from
      to: $to
      career: BRIGHT_WIZARD
    )
    choppa: activeCharactersStats(from: $from, to: $to, career: CHOPPA)
    chosen: activeCharactersStats(from: $from, to: $to, career: CHOSEN)
    discipleOfKhaine: activeCharactersStats(
      from: $from
      to: $to
      career: DISCIPLE_OF_KHAINE
    )
    engineer: activeCharactersStats(from: $from, to: $to, career: ENGINEER)
    ironBreaker: activeCharactersStats(
      from: $from
      to: $to
      career: IRON_BREAKER
    )
    knightOfTheBlazingSun: activeCharactersStats(
      from: $from
      to: $to
      career: KNIGHT_OF_THE_BLAZING_SUN
    )
    magus: activeCharactersStats(from: $from, to: $to, career: MAGUS)
    marauder: activeCharactersStats(from: $from, to: $to, career: MARAUDER)
    runePriest: activeCharactersStats(from: $from, to: $to, career: RUNE_PRIEST)
    shadowWarrior: activeCharactersStats(
      from: $from
      to: $to
      career: SHADOW_WARRIOR
    )
    shaman: activeCharactersStats(from: $from, to: $to, career: SHAMAN)
    slayer: activeCharactersStats(from: $from, to: $to, career: SLAYER)
    sorcerer: activeCharactersStats(from: $from, to: $to, career: SORCERER)
    squigHerder: activeCharactersStats(
      from: $from
      to: $to
      career: SQUIG_HERDER
    )
    swordMaster: activeCharactersStats(
      from: $from
      to: $to
      career: SWORD_MASTER
    )
    warriorPriest: activeCharactersStats(
      from: $from
      to: $to
      career: WARRIOR_PRIEST
    )
    whiteLion: activeCharactersStats(from: $from, to: $to, career: WHITE_LION)
    witchElf: activeCharactersStats(from: $from, to: $to, career: WITCH_ELF)
    witchHunter: activeCharactersStats(
      from: $from
      to: $to
      career: WITCH_HUNTER
    )
    zealot: activeCharactersStats(from: $from, to: $to, career: ZEALOT)
  }
`;

type CareerCountKey =
  | 'archmage'
  | 'blackGuard'
  | 'blackOrc'
  | 'brightWizard'
  | 'choppa'
  | 'chosen'
  | 'discipleOfKhaine'
  | 'engineer'
  | 'ironBreaker'
  | 'knightOfTheBlazingSun'
  | 'magus'
  | 'marauder'
  | 'runePriest'
  | 'shadowWarrior'
  | 'shaman'
  | 'slayer'
  | 'sorcerer'
  | 'squigHerder'
  | 'swordMaster'
  | 'warriorPriest'
  | 'whiteLion'
  | 'witchElf'
  | 'witchHunter'
  | 'zealot';

// This environment can't reach production-api.waremu.com to run
// `npm run codegen`, so this type is hand-written to match the query above
// instead of generated. It should match exactly what codegen would produce
// for this operation (activeCharactersStats returns a nullable Int) — run
// `npm run codegen` locally to replace it with the real generated type next
// time this query changes.
type ActiveCharacterPopulationData = {
  total: number | null | undefined;
} & Record<CareerCountKey, number | null | undefined>;

const REALM_ORDER = 0;
const REALM_DESTRUCTION = 1;

const CAREER_META: {
  alias: CareerCountKey;
  career: Career;
  realm: typeof REALM_ORDER | typeof REALM_DESTRUCTION;
}[] = [
  { alias: 'archmage', career: Career.Archmage, realm: REALM_ORDER },
  { alias: 'brightWizard', career: Career.BrightWizard, realm: REALM_ORDER },
  { alias: 'engineer', career: Career.Engineer, realm: REALM_ORDER },
  { alias: 'ironBreaker', career: Career.IronBreaker, realm: REALM_ORDER },
  {
    alias: 'knightOfTheBlazingSun',
    career: Career.KnightOfTheBlazingSun,
    realm: REALM_ORDER,
  },
  { alias: 'runePriest', career: Career.RunePriest, realm: REALM_ORDER },
  { alias: 'shadowWarrior', career: Career.ShadowWarrior, realm: REALM_ORDER },
  { alias: 'slayer', career: Career.Slayer, realm: REALM_ORDER },
  { alias: 'swordMaster', career: Career.SwordMaster, realm: REALM_ORDER },
  { alias: 'warriorPriest', career: Career.WarriorPriest, realm: REALM_ORDER },
  { alias: 'whiteLion', career: Career.WhiteLion, realm: REALM_ORDER },
  { alias: 'witchHunter', career: Career.WitchHunter, realm: REALM_ORDER },
  { alias: 'blackGuard', career: Career.BlackGuard, realm: REALM_DESTRUCTION },
  { alias: 'blackOrc', career: Career.BlackOrc, realm: REALM_DESTRUCTION },
  { alias: 'choppa', career: Career.Choppa, realm: REALM_DESTRUCTION },
  { alias: 'chosen', career: Career.Chosen, realm: REALM_DESTRUCTION },
  {
    alias: 'discipleOfKhaine',
    career: Career.DiscipleOfKhaine,
    realm: REALM_DESTRUCTION,
  },
  { alias: 'magus', career: Career.Magus, realm: REALM_DESTRUCTION },
  { alias: 'marauder', career: Career.Marauder, realm: REALM_DESTRUCTION },
  { alias: 'shaman', career: Career.Shaman, realm: REALM_DESTRUCTION },
  { alias: 'sorcerer', career: Career.Sorcerer, realm: REALM_DESTRUCTION },
  {
    alias: 'squigHerder',
    career: Career.SquigHerder,
    realm: REALM_DESTRUCTION,
  },
  { alias: 'witchElf', career: Career.WitchElf, realm: REALM_DESTRUCTION },
  { alias: 'zealot', career: Career.Zealot, realm: REALM_DESTRUCTION },
];

const monthPattern = /^\d{4}-\d{2}$/;

const RealmPanel = ({
  careers,
  maxCount,
  realmName,
  total,
}: {
  careers: { alias: CareerCountKey; career: Career; count: number }[];
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
      {careers.map(({ alias, career, count }) => (
        <li key={alias}>
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
  const [year, monthIndex] = month.split('-').map(Number);
  // Upper bound is the first moment of the *next* month, so the query
  // covers the entire selected month regardless of whether the API treats
  // `to` as inclusive or exclusive.
  const from = new Date(year, monthIndex - 1, 1);
  const to = new Date(year, monthIndex, 1);

  const { data, error, loading } = useQuery<ActiveCharacterPopulationData>(
    ACTIVE_CHARACTER_POPULATION,
    {
      variables: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    },
  );

  const onMonthChange = (value: string): void => {
    const next = new URLSearchParams(searchParams);
    if (monthPattern.test(value) && value !== currentMonth) {
      next.set('month', value);
    } else {
      next.delete('month');
    }
    setSearchParams(next, { replace: true });
  };

  if (error) {
    return <ErrorMessage message={error.message} name={error.name} />;
  }

  const rows = CAREER_META.map((meta) => ({
    ...meta,
    count: data?.[meta.alias] ?? 0,
  }));
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
  const total = data?.total ?? orderTotal + destructionTotal;
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
          <span>active characters in {format(from, 'MMMM yyyy')}</span>
        </div>
      </div>
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
            const share = realmTotal === 0 ? 0 : (row.count / realmTotal) * 100;
            return (
              <tr key={row.alias}>
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
};
