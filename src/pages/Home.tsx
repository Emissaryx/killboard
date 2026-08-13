import { LatestKills } from '@/components/kill/LatestKills';
import { WeeklyLeaderboard } from '@/components/kill/WeeklyLeaderboard';
import { SearchBox } from '@/components/global/SearchBox';
import { MonthlyLeaderboard } from '@/components/kill/MonthlyLeaderboard';
import { MonthlyGuildLeaderboard } from '@/components/kill/MonthlyLeaderboard.Guild';
import { WeeklyLeaderboardGuild } from '@/components/kill/WeeklyLeaderboardGuild';
import { ScenarioList } from '@/components/scenario/ScenarioList';
import { LatestSkirmishes } from '@/components/skirmish/LatestSkirmishes';
import { ClassActivity } from '@/components/classActivity/ClassActivity';
import { TopSkirmishes } from '@/components/skirmish/TopSkirmishes';
import type { ReactElement } from 'react';

export const Home = ({
  tab,
}: {
  tab: 'players' | 'guilds' | 'scenarios' | 'skirmishes' | 'classActivity';
}): ReactElement => {
  return (
    <div className="container is-max-widescreen mt-2">
      {tab === 'scenarios' && <ScenarioList loadMore perPage={10} />}
      {tab === 'classActivity' && <ClassActivity />}
      {tab === 'players' && (
        <>
          <section className="database-search-panel mb-5">
            <h1 className="title is-4 mb-2">Search the RoR database</h1>
            <p className="subtitle is-6 mb-3">
              Find players, guilds, items, quests, creatures, and more.
            </p>
            <SearchBox
              isPlayer
              navigateOnSubmit
              placeholder="Search players, guilds, items, quests, creatures..."
            />
          </section>
          <div className="columns">
            <div className="column is-6">
              <MonthlyLeaderboard />
            </div>
            <div className="column is-6">
              <WeeklyLeaderboard />
            </div>
          </div>
          <LatestKills />
        </>
      )}
      {tab === 'guilds' && (
        <>
          <SearchBox isPlayer={false} navigateOnSubmit />
          <div className="columns">
            <div className="column is-6">
              <MonthlyGuildLeaderboard />
            </div>
            <div className="column is-6">
              <WeeklyLeaderboardGuild />
            </div>
          </div>
          <LatestKills />
        </>
      )}
      {tab === 'skirmishes' && (
        <>
          <TopSkirmishes />
          <LatestSkirmishes />
        </>
      )}
    </div>
  );
};
