import { gql } from '@apollo/client';
import { useState } from 'react';
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
  const { ids } = useParams();

  const characterIds = (ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  // Picked up from each CharacterInfo card as it loads (see the onLoaded
  // callback below) so the feud links can show names instead of bare
  // IDs. The feud page itself only needs the IDs (they're right there in
  // the URL - /character/:id1/feud/:id2), so a name that hasn't loaded
  // yet just means the link falls back to showing the ID.
  const [characterNames, setCharacterNames] = useState<Record<string, string>>(
    {},
  );

  // Every unique pair in the group - for a 2-character trading flag
  // that's just the one pair; for a larger farming clique it's every
  // combination, since the feud page itself only ever compares two
  // characters at a time.
  const pairs: [string, string][] = [];
  for (let i = 0; i < characterIds.length; i++) {
    for (let j = i + 1; j < characterIds.length; j++) {
      pairs.push([characterIds[i], characterIds[j]]);
    }
  }

  return (
    <div className="container is-max-widescreen mt-2">
      <nav className="breadcrumb" aria-label="breadcrumbs">
        <ul>
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
            {/* CharacterInfo's own name link intentionally points at the
                external armory (that's correct on the single-character
                page it was built for) - on this page we want an internal
                link back into the site instead, so it's added separately
                rather than changing the shared component's behavior. */}
            <Link to={`/character/${id}`} className="is-size-7">
              View character page
            </Link>
            <CharacterInfo
              id={Number(id)}
              onLoaded={(character) =>
                setCharacterNames((prev) => ({
                  ...prev,
                  [String(character.id)]: character.name,
                }))
              }
            />
          </div>
        ))}
      </div>

      {pairs.length > 0 && (
        <div className="box mb-5">
          <p className="has-text-weight-semibold mb-2">
            {pairs.length === 1
              ? 'Feud between these two characters'
              : 'Feuds between each pair in this group'}
          </p>
          {/* TEMP: the second (live site) link per pair is a stopgap so
              GMs have something clickable today, since this preview
              deploy's own /character/:id1/feud/:id2 route isn't the one
              they'd normally use. REMOVE this second link (and this
              comment) once this page actually ships to Dalen - the
              internal link above it is the real, permanent one. */}
          <div className="tags">
            {pairs.map(([id1, id2]) => (
              <span key={`${id1}-${id2}`} className="tags has-addons mr-2 mb-2">
                <Link
                  to={`/character/${id1}/feud/${id2}`}
                  className="tag is-link is-light"
                >
                  {characterNames[id1] ?? id1} vs {characterNames[id2] ?? id2}
                </Link>
                <a
                  href={`https://killboard.returnofreckoning.com/character/${id1}/feud/${id2}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tag is-warning is-light"
                  title="Temporary: live killboard.returnofreckoning.com feud page - remove before shipping to Dalen"
                >
                  live site
                </a>
              </span>
            ))}
          </div>
        </div>
      )}

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
