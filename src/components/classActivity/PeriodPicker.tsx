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
  buildYtdPeriod,
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

  // value.segment means something different per granularity (month
  // 1-12, quarter 1-4, half 1-2) - it is NOT safe to carry the old
  // granularity's segment straight into a different granularity's
  // builder (e.g. reusing August's "8" as a quarter number produces a
  // nonexistent "quarter 8", which built an out-of-range month string
  // and crashed the page). So switching granularity always computes a
  // fresh, sensible default (the quarter/half/year containing
  // currentMonth) instead of reusing value.segment. Only the dedicated
  // quarter/half/year <select> controls below (which only ever pass a
  // segment value that's valid for their own granularity) reuse
  // value.segment or value.year.
  const onGranularityChange = (granularity: Granularity): void => {
    const { year, month } = parseMonthKey(currentMonth);
    switch (granularity) {
      case 'month': {
        onChange(buildMonthPeriod(currentMonth));
        return;
      }
      case 'quarter': {
        const currentQuarter = Math.ceil(month / 3);
        onChange(buildQuarterPeriod(year, currentQuarter, currentMonth));
        return;
      }
      case 'halfYear': {
        const currentHalf = month <= 6 ? 1 : 2;
        onChange(buildHalfYearPeriod(year, currentHalf, currentMonth));
        return;
      }
      case 'year': {
        onChange(buildYearPeriod(year, currentMonth));
        return;
      }
      case 'trailing12': {
        onChange(buildTrailing12Period(currentMonth));
        return;
      }
      case 'ytd': {
        onChange(buildYtdPeriod(year, currentMonth));
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
            <option value="halfYear">
              {t('pages:classActivity.halfYear')}
            </option>
            <option value="year">{t('pages:classActivity.year')}</option>
            <option value="trailing12">
              {t('pages:classActivity.trailing12Months')}
            </option>
            <option value="ytd">{t('pages:classActivity.ytd')}</option>
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
                    buildQuarterPeriod(
                      Number(event.target.value),
                      value.segment || 1,
                      currentMonth,
                    ),
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
                  onChange(
                    buildQuarterPeriod(
                      value.year,
                      Number(event.target.value),
                      currentMonth,
                    ),
                  );
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
                    buildHalfYearPeriod(
                      Number(event.target.value),
                      value.segment || 1,
                      currentMonth,
                    ),
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
                  onChange(
                    buildHalfYearPeriod(
                      value.year,
                      Number(event.target.value),
                      currentMonth,
                    ),
                  );
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
                onChange(
                  buildYearPeriod(Number(event.target.value), currentMonth),
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
      )}

      {value.granularity === 'ytd' && (
        <label>
          <span>Year</span>
          <div className="select">
            <select
              value={value.year}
              onChange={(event) => {
                onChange(
                  buildYtdPeriod(Number(event.target.value), currentMonth),
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
      )}
    </div>
  );
};

// Re-exported so callers that just need "what month key is 'now'" don't
// have to import date-fns directly for it.
export const monthKeyForDate = (date: Date): string =>
  monthKey(date.getFullYear(), date.getMonth() + 1);
