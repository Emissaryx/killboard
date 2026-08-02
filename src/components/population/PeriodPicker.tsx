import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import {
  type Granularity,
  type Period,
  availableYears,
  buildHalfYearPeriod,
  buildMonthPeriod,
  buildQuarterPeriod,
  buildTrailing12Period,
  buildYearPeriod,
  monthKey,
  parseMonthKey,
} from './periodUtils';

const QUARTERS = [1, 2, 3, 4];
const HALVES = [1, 2];

export const PeriodPicker = ({
  value,
  onChange,
  currentMonth,
  idPrefix,
}: {
  value: Period;
  onChange: (period: Period) => void;
  currentMonth: string;
  idPrefix: string;
}): ReactElement => {
  const { t } = useTranslation(['pages']);
  const years = availableYears(parseMonthKey(currentMonth).year);

  const onGranularityChange = (granularity: Granularity): void => {
    switch (granularity) {
      case 'month': {
        onChange(buildMonthPeriod(currentMonth));
        return;
      }
      case 'quarter': {
        onChange(buildQuarterPeriod(value.year, value.segment || 1, currentMonth));
        return;
      }
      case 'halfYear': {
        onChange(buildHalfYearPeriod(value.year, value.segment || 1, currentMonth));
        return;
      }
      case 'year': {
        onChange(buildYearPeriod(value.year, currentMonth));
        return;
      }
      case 'trailing12': {
        onChange(buildTrailing12Period(currentMonth));
      }
    }
  };

  return (
    <div className="period-picker">
      <label>
        <span>{t('pages:classActivity.granularity')}</span>
        <div className="select">
          <select
            id={`${idPrefix}-granularity`}
            value={value.granularity}
            onChange={(event) => {
              onGranularityChange(event.target.value as Granularity);
            }}
          >
            <option value="month">{t('pages:classActivity.month')}</option>
            <option value="quarter">{t('pages:classActivity.quarter')}</option>
            <option value="halfYear">{t('pages:classActivity.halfYear')}</option>
            <option value="year">{t('pages:classActivity.year')}</option>
            <option value="trailing12">
              {t('pages:classActivity.trailing12Months')}
            </option>
          </select>
        </div>
      </label>

      {value.granularity === 'month' && (
        <label>
          <span>{t('pages:classActivity.month')}</span>
          <input
            max={currentMonth}
            type="month"
            value={value.from}
            onChange={(event) => {
              if (event.target.value) {
                onChange(buildMonthPeriod(event.target.value));
              }
            }}
          />
        </label>
      )}

      {value.granularity === 'quarter' && (
        <>
          <label>
            <span>Year</span>
            <div className="select">
              <select
                value={value.year}
                onChange={(event) => {
                  onChange(
                    buildQuarterPeriod(Number(event.target.value), value.segment || 1, currentMonth),
                  );
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            <span>{t('pages:classActivity.quarter')}</span>
            <div className="select">
              <select
                value={value.segment}
                onChange={(event) => {
                  onChange(buildQuarterPeriod(value.year, Number(event.target.value), currentMonth));
                }}
              >
                {QUARTERS.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    Q{quarter}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </>
      )}

      {value.granularity === 'halfYear' && (
        <>
          <label>
            <span>Year</span>
            <div className="select">
              <select
                value={value.year}
                onChange={(event) => {
                  onChange(
                    buildHalfYearPeriod(Number(event.target.value), value.segment || 1, currentMonth),
                  );
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            <span>{t('pages:classActivity.halfYear')}</span>
            <div className="select">
              <select
                value={value.segment}
                onChange={(event) => {
                  onChange(buildHalfYearPeriod(value.year, Number(event.target.value), currentMonth));
                }}
              >
                {HALVES.map((half) => (
                  <option key={half} value={half}>
                    H{half}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </>
      )}

      {value.granularity === 'year' && (
        <label>
          <span>Year</span>
          <div className="select">
            <select
              value={value.year}
              onChange={(event) => {
                onChange(buildYearPeriod(Number(event.target.value), currentMonth));
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </label>
      )}
    </div>
  );
};

// Re-exported so callers that just need "what month key is 'now'" don't
// have to import date-fns directly for it.
export const monthKeyForDate = (date: Date): string => monthKey(date.getFullYear(), date.getMonth() + 1);
