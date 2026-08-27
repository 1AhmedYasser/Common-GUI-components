import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { MdFilterList } from 'react-icons/md';

import { ClearFiltersButton } from '../../../../../ui-components';
import { FilterTag } from '../FilterTag';

import './SelectedFilterTags.scss';

type SelectedFilterTagsProps = {
  readonly csaFilterTagValues: string[];
  readonly getCsaFilterTagLabel: (value: string) => string;
  readonly showAuthenticatedPerson?: boolean;
  readonly showTestFilter: boolean;
  readonly isTestFilter?: boolean;
  readonly isPreserveFilter?: boolean;
  readonly hasCommentFilter?: boolean;
  readonly hasFeedbackFilter?: boolean;
  readonly domains: string[];
  readonly feedbackRatings: string[];
  readonly status: string[];
  readonly theme: string[];
  readonly responseQuality: string[];
  readonly followUpStatus: string[];
  readonly onRemove: (filter: SelectedFilterTagFilter, value: SelectedFilterTagValue) => void;
  readonly onClearFiltersClick: () => void;
};

type SelectedFilterTagFilter =
  | 'csaIdCodesFilter'
  | 'showAuthenticatedPerson'
  | 'isTestFilter'
  | 'isPreserveFilter'
  | 'hasCommentFilter'
  | 'hasFeedbackFilter'
  | 'domains'
  | 'feedbackRatings'
  | 'status'
  | 'theme'
  | 'responseQuality'
  | 'followUpStatus';

type SelectedFilterTagValue = string | boolean;

const SelectedFilterTags: FC<SelectedFilterTagsProps> = ({
  csaFilterTagValues,
  getCsaFilterTagLabel,
  showAuthenticatedPerson,
  showTestFilter,
  isTestFilter,
  isPreserveFilter,
  hasCommentFilter,
  hasFeedbackFilter,
  domains,
  feedbackRatings,
  status,
  theme,
  responseQuality,
  followUpStatus,
  onRemove,
  onClearFiltersClick,
}) => {
  const { t } = useTranslation();
  const hasSelectedFilterTags =
    csaFilterTagValues.length !== 0 ||
    showAuthenticatedPerson !== undefined ||
    (showTestFilter && isTestFilter !== undefined) ||
    isPreserveFilter !== undefined ||
    hasCommentFilter !== undefined ||
    hasFeedbackFilter !== undefined ||
    domains.length !== 0 ||
    feedbackRatings.length !== 0 ||
    status.length !== 0 ||
    theme.length !== 0 ||
    responseQuality.length !== 0 ||
    followUpStatus.length !== 0;

  if (!hasSelectedFilterTags) {
    return null;
  }

  return (
    <div className="selected-filters__container">
      <MdFilterList size="24" color="#878A97" style={{ width: '24px' }} />
      <div className="selected-filters">
        {csaFilterTagValues.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.csaName')}:</p>
            <div className="selected-filters__items">
              {csaFilterTagValues.map((item, index) => (
                <FilterTag
                  key={index}
                  text={getCsaFilterTagLabel(item)}
                  onClick={() => onRemove('csaIdCodesFilter', item)}
                />
              ))}
            </div>
          </>
        )}

        {showAuthenticatedPerson !== undefined && (
          <>
            <p className="selected-filters__label">{t('chat.history.authenticatedPerson')}:</p>
            <div className="selected-filters__items">
              <FilterTag
                text={showAuthenticatedPerson ? t('global.yes') : t('global.no')}
                onClick={() => onRemove('showAuthenticatedPerson', showAuthenticatedPerson)}
              />
            </div>
          </>
        )}

        {showTestFilter && isTestFilter !== undefined && (
          <>
            <p className="selected-filters__label">{t('global.test')}:</p>
            <div className="selected-filters__items">
              <FilterTag
                text={isTestFilter ? t('global.yes') : t('global.no')}
                onClick={() => onRemove('isTestFilter', isTestFilter)}
              />
            </div>
          </>
        )}

        {isPreserveFilter !== undefined && (
          <>
            <p className="selected-filters__label">{t('global.preserve')}:</p>
            <div className="selected-filters__items">
              <FilterTag
                text={isPreserveFilter ? t('global.yes') : t('global.no')}
                onClick={() => onRemove('isPreserveFilter', isPreserveFilter)}
              />
            </div>
          </>
        )}

        {hasCommentFilter !== undefined && (
          <>
            <p className="selected-filters__label">{t('chat.history.comment')}:</p>
            <div className="selected-filters__items">
              <FilterTag
                text={hasCommentFilter ? t('global.yes') : t('global.no')}
                onClick={() => onRemove('hasCommentFilter', hasCommentFilter)}
              />
            </div>
          </>
        )}

        {hasFeedbackFilter !== undefined && (
          <>
            <p className="selected-filters__label">{t('chat.history.feedback')}:</p>
            <div className="selected-filters__items">
              <FilterTag
                text={hasFeedbackFilter ? t('global.yes') : t('global.no')}
                onClick={() => onRemove('hasFeedbackFilter', hasFeedbackFilter)}
              />
            </div>
          </>
        )}

        {domains.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.www')}:</p>
            <div className="selected-filters__items">
              {domains.map((item, index) => (
                <FilterTag
                  key={index}
                  text={item}
                  onClick={() => onRemove('domains', item)}
                />
              ))}
            </div>
          </>
        )}

        {feedbackRatings.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.rating')}:</p>
            <div className="selected-filters__items">
              {feedbackRatings.map((item, index) => (
                <FilterTag
                  key={index}
                  text={item}
                  onClick={() => onRemove('feedbackRatings', item)}
                />
              ))}
            </div>
          </>
        )}

        {status.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('global.status')}:</p>
            <div className="selected-filters__items">
              {status.map((item, index) => (
                <FilterTag
                  key={index}
                  text={t(`chat.plainEvents.${item}`)}
                  onClick={() => onRemove('status', item)}
                />
              ))}
            </div>
          </>
        )}

        {theme.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.theme')}:</p>
            <div className="selected-filters__items">
              {theme.map((item, index) => (
                <FilterTag
                  key={index}
                  text={item}
                  onClick={() => onRemove('theme', item)}
                />
              ))}
            </div>
          </>
        )}

        {responseQuality.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.responseQuality')}:</p>
            <div className="selected-filters__items">
              {responseQuality.map((item, index) => (
                <FilterTag
                  key={index}
                  text={item}
                  onClick={() => onRemove('responseQuality', item)}
                />
              ))}
            </div>
          </>
        )}

        {followUpStatus.length !== 0 && (
          <>
            <p className="selected-filters__label">{t('chat.history.followUpStatus')}:</p>
            <div className="selected-filters__items">
              {followUpStatus.map((item, index) => (
                <FilterTag
                  key={index}
                  text={item}
                  onClick={() => onRemove('followUpStatus', item)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <ClearFiltersButton onClick={onClearFiltersClick} />
    </div>
  );
};

export { SelectedFilterTags };
