import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { ReactElement } from 'react';

export const MainNav = (): ReactElement => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <div className="container is-max-widescreen mt-2">
      <div className="tabs main-nav-tabs is-fullwidth">
        <ul>
          <li
            className={clsx({
              'is-active':
                pathname === '/' ||
                pathname.startsWith('/kill/') ||
                pathname === '/kills',
            })}
          >
            <Link to="/">Killboard</Link>
          </li>
          <li
            className={clsx({
              'is-active':
                pathname === '/skirmishes' || pathname.startsWith('/skirmish/'),
            })}
          >
            <Link to="/skirmishes">{t('pages:home.showSkirmishes')}</Link>
          </li>
          <li
            className={clsx({
              'is-active':
                pathname === '/scenarios' || pathname.startsWith('/scenario/'),
            })}
          >
            <Link to="/scenarios">{t('pages:home.showScenarios')}</Link>
          </li>
          <li className={clsx({ 'is-active': pathname === '/events' })}>
            <Link to="/events">{t('common:events')}</Link>
          </li>
          <li className="main-nav-database">
            <details>
              <summary>Database</summary>
              <div className="main-nav-database-menu">
                <Link to="/items">{t('pages:home.showItems')}</Link>
                <Link to="/creatures">{t('pages:home.showCreatures')}</Link>
                <Link to="/quests">{t('pages:home.showQuests')}</Link>
                <Link to="/instances">{t('pages:home.showInstances')}</Link>
                <Link to="/storylines">{t('pages:home.showStorylines')}</Link>
                <Link to="/guilds">{t('pages:home.showGuildLeaderboard')}</Link>
                <Link to="/class-activity">
                  {t('pages:home.showClassActivity')}
                </Link>
              </div>
            </details>
          </li>
        </ul>
      </div>
    </div>
  );
};
