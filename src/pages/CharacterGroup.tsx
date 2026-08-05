import { gql } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { ReactElement } from 'react';
import { CharacterInfo } from '@/components/character/CharacterInfo';
import { KillsFilters } from '@/components/kill/KillsFilters';
import { KillsList } from '@/components/kill/KillsList';

// Companion page to /kill-trading: given a flagged group's character IDs
// (comma-joined in the URL), shows the combined kill feed across all of
// them - every kill where any of these characters was killer OR victim,
// interleaved chronologically, so a reviewer can see the actual
// back-and-forth (or one-sided farming) pattern in context instead of
// piecing it together from separate single-character pages. Reached only
// via a link from /kill-trading's rows - not linked from MainNav, same
// "direct URL only" pattern as /kill-trading and /ranked-leaderboard.
const GROUP_KILLS = gql`
  query GetCharacterGroupKills(
    $ids: [ID!]
    $first: Int
    $last: Int
    $before: String
    $after: String
    $time: DateTimeOperationFilterInput
    $soloOnly: Boolean
  ) {
    kills(
      where: {
        or: [
          { killerCharacterId: { in: $ids } }
          { victimCharacterId: { in: $ids } }
        ]
        time: $time
      }
      first: $first
      last: $last
      before: $before
      after: $after
      soloOnly: $soloOnly
    ) {
      totalCount
      nodes {
        id
        time
        position {
          zoneId
        }
        scenario {
          id
        }
        victim {
          level
          renownRank
          character {
            id
            career
            name
          }
          guild {
            id
            name
          }
        }
        attackers {
          level
          renownRank
          damagePercent
          character {
            id
            career
            name
          }
          guild {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
        hasPreviousPage
        startCursor
      }
    }
  }
`;

export const CharacterGroup = (): ReactElement => {
  const { t } = useTranslation(['common']);
  const { ids } = useParams();

  const characterIds = (ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return (
    <div className="container is-max-widescreen mt-2">
      <nav className="breadcrumb" aria-label="breadcrumbs">
        <ul>
          <li>
            <Link to="/">{t('common:home')}</Link>
          </li>
          <li>
            <Link to="/kill-trading">Kill trading review</Link>
          </li>
          <li className="is-active">
            <Link to={`/character-group/${ids ?? ''}`}>Character group</Link>
          </li>
        </ul>
      </nav>

      <p className="subtitle is-6">
        Not linked anywhere in the site nav - reached from the kill-trading
        review page. Combined kill feed for {characterIds.length} character
        {characterIds.length === 1 ? '' : 's'}: every kill where any of them was
        the killer or the victim, in one timeline.
      </p>

      <div className="columns is-multiline">
        {characterIds.map((id) => (
          <div className="column is-one-third" key={id}>
            <CharacterInfo id={Number(id)} />
          </div>
        ))}
      </div>

      <KillsFilters />
      <KillsList
        query={GROUP_KILLS}
        queryOptions={{ variables: { ids: characterIds, time: {} } }}
        perPage={25}
        title="Combined kills"
      />
    </div>
  );
};
