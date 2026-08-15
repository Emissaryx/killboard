import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { ReactElement } from 'react';

// Persistent top nav, rendered on every page (see App.tsx). The reference/
// lookup tools (Items, Creatures, Quests, Instances, Storylines) are
// grouped into a single "Database" dropdown -- mirrors the nav grouping
// shipped on theemissary.dev's own router-level nav (nwdb.info-style).
// Everything else stays a top-level tab, alphabetical by label. The
// ranked leaderboard page intentionally isn't added here.
export const MainNav = (): ReactElement => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isDatabaseActive =
    pathname.startsWith('/creature') ||
    pathname.startsWith('/instance') ||
    pathname.startsWith('/item') ||
    pathname.startsWith('/quest') ||
    pathname.startsWith('/storylines');

  return (
    <div className="container is-max-widescreen mt-2">
      <div className="tabs is-fullwidth">
        <li className={clsx({ 'is-active': pathname === '/class-activity' })}>
          <Link to="/class-activity">{t('pages:home.showClassActivity')}</Link>
        </li>
        <li className={clsx({ 'is-active': pathname === '/events' })}>
          <Link to="/events">{t('common:events')}</Link>
        </li>
        <li className={clsx({ 'is-active': pathname === '/guilds' })}>
          <Link to="/guilds">{t('pages:home.showGuildLeaderboard')}</Link>
        </li>
        <li className={clsx({ 'is-active': pathname === '/' })}>
          <Link to="/">{t('pages:home.showPlayerLeaderboard')}</Link>
        </li>
        <li className={clsx({ 'is-active': pathname === '/scenarios' })}>
          <Link to="/scenarios">{t('pages:home.showScenarios')}</Link>
        </li>
        <li className={clsx({ 'is-active': pathname === '/skirmishes' })}>
          <Link to="/skirmishes">{t('pages:home.showSkirmishes')}</Link>
        </li>
        <li
          className={clsx('nav-database', { 'is-active': isDatabaseActive })}
        >
          <details className="nav-database-dropdown">
            <summary>{t('pages:home.showDatabase')}</summary>
            <div className="nav-database-menu">
              <Link to="/creatures">{t('pages:home.showCreatures')}</Link>
              <Link to="/instances">{t('pages:home.showInstances')}</Link>
              <Link to="/items">{t('pages:home.showItems')}</Link>
              <Link to="/quests">{t('pages:home.showQuests')}</Link>
              <Link to="/storylines">{t('pages:home.showStorylines')}</Link>
            </div>
          </details>
        </li>
      </div>
    </div>
  );
};
