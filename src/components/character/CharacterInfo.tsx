import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { getUnixTime, startOfWeek } from 'date-fns';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Query } from '@/__generated__/graphql';
import { careerIcon } from '@/utils';
import { ErrorMessage } from '@/components/global/ErrorMessage';
import type { ReactElement } from 'react';

const CHARACTER_INFO = gql`
  query GetCharacterInfo($id: ID!) {
    character(id: $id) {
      name
      career
      level
      renownRank
      guildMembership {
        guild {
          id
          name
        }
      }
    }
  }
`;

export const CharacterInfo = ({
  id,
  onLoaded,
}: {
  id: number;
  // Optional - lets a caller that renders several CharacterInfo cards at
  // once (e.g. CharacterGroup) pick up each character's name as it loads,
  // without this component needing to know why the name is wanted or
  // duplicating its own query elsewhere. No-op for every other existing
  // call site since it's optional.
  onLoaded?: (character: { id: number; name: string }) => void;
}): ReactElement => {
  const { t } = useTranslation(['common', 'components', 'enums']);
  const { loading, error, data } = useQuery<Query>(CHARACTER_INFO, {
    variables: {
      id,
      startOfWeek: getUnixTime(startOfWeek(new Date(), { weekStartsOn: 1 })),
    },
  });

  useEffect(() => {
    if (data?.character?.name != null) {
      onLoaded?.({ id, name: data.character.name });
    }
    // onLoaded is intentionally not a dependency - callers typically pass
    // an inline arrow function, and including it would re-fire this
    // effect (and the parent state update it causes) every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.character?.name]);

  if (loading) {
    return <progress className="progress" />;
  }
  if (error) {
    return <ErrorMessage name={error.name} message={error.message} />;
  }

  if (data?.character == null) {
    return <ErrorMessage customText={t('common:notFound')} />;
  }

  return (
    <div className="card mb-5">
      <div className="card-content">
        <article className="media">
          <figure className="media-left">
            <figure className="image is-128x128">
              <img
                src="/images/corner_icons/ea_icon_corner_character.png"
                alt="Character"
              />
            </figure>
          </figure>
          <div className="media-content">
            <a
              className="is-size-4"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.returnofreckoning.com/armory/character/${id}`}
            >
              <strong>{data.character.name}</strong>
            </a>
            <p>
              <span className="icon-text">
                <strong>{`${t('components:characterInfo.career')} `}</strong>
                <span className="icon">
                  <img
                    src={careerIcon(data.character.career)}
                    alt={t(`enums:career.${data.character.career}`) ?? ''}
                  />
                </span>
                <span>{t(`enums:career.${data.character.career}`)}</span>
              </span>
            </p>
            <p>
              <strong>{`${t('components:characterInfo.level')} `}</strong>
              {data.character.level}
            </p>
            <p>
              <strong>{`${t('components:characterInfo.renownRank')} `}</strong>
              {data.character.renownRank}
            </p>

            {data.character.guildMembership?.guild != null && (
              <p>
                <strong>{`${t('components:characterInfo.guild')} `}</strong>
                <Link to={`/guild/${data.character.guildMembership.guild.id}`}>
                  {data.character.guildMembership.guild.name}
                </Link>
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
};
