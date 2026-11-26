'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { MODERATION_NOTE_MAX_LENGTH, type AccountStatus, type AccountType } from '@/lib/domain/equipment';
import {
  SELLER_LIMIT_OVERRIDE_MAX,
  SELLER_LIMIT_OVERRIDE_MIN,
  type SellerActionState,
} from './sellers';

type BoundSellerAction = (state: SellerActionState, form: FormData) => Promise<SellerActionState>;

export function SellerAccountTypeForm({
  currentType,
  individualDefault,
  businessDefault,
  overrideLimit,
  usedCount,
  action,
}: {
  currentType: AccountType;
  individualDefault: number;
  businessDefault: number;
  overrideLimit: number | null;
  usedCount: number;
  action: BoundSellerAction;
}) {
  const t = useTranslations('admin.sellers');
  const p = useTranslations('account');
  const [state, submit, busy] = useActionState(action, {});
  const targetType: AccountType = currentType === 'individual' ? 'business' : 'individual';
  const resultingDefault = targetType === 'business' ? businessDefault : individualDefault;
  const resultingEffective = overrideLimit ?? resultingDefault;
  const stale = state.message === 'conflict';

  return (
    <form action={submit} className="account-form seller-admin-form">
      <input type="hidden" name="accountType" value={targetType} />
      {state.message && (
        <p role="alert" className="admin-alert">
          {t(`errors.${state.message}`)}
        </p>
      )}
      {stale && (
        <a href="" className="text-link">
          {t('reloadSeller')}
        </a>
      )}
      <p className="field-hint">
        {t('accountTypeSummary', {
          current: p(currentType),
          target: p(targetType),
          resultingLimit: resultingEffective,
          used: usedCount,
        })}
      </p>
      <p className="form-notice">{t('businessDisclaimer')}</p>
      <label htmlFor="seller-account-type-reason">{t('reasonLabel')}</label>
      <textarea
        id="seller-account-type-reason"
        name="reason"
        defaultValue={state.reason}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        rows={2}
        required
      />
      <div className="seller-form-actions">
        <button type="submit" className="button primary" disabled={busy || stale}>
          {targetType === 'business' ? t('switchToBusiness') : t('switchToPersonal')}
        </button>
      </div>
    </form>
  );
}

export function SellerAllowanceForm({
  defaultLimit,
  overrideLimit,
  effectiveLimit,
  usedCount,
  remainingCount,
  action,
}: {
  defaultLimit: number;
  overrideLimit: number | null;
  effectiveLimit: number;
  usedCount: number;
  remainingCount: number;
  action: BoundSellerAction;
}) {
  const t = useTranslations('admin.sellers');
  const [state, submit, busy] = useActionState(action, {});
  const stale = state.message === 'conflict';

  return (
    <form action={submit} className="account-form seller-admin-form">
      {state.message && (
        <p role="alert" className="admin-alert">
          {t(`errors.${state.message}`)}
        </p>
      )}
      {stale && (
        <a href="" className="text-link">
          {t('reloadSeller')}
        </a>
      )}
      <p className="field-hint">
        {t('allowanceHint', {
          defaultLimit,
          effectiveLimit,
          used: usedCount,
          remaining: remainingCount,
          min: SELLER_LIMIT_OVERRIDE_MIN,
          max: SELLER_LIMIT_OVERRIDE_MAX,
        })}
      </p>
      <label htmlFor="seller-limit-override">{t('customAllowanceLabel')}</label>
      <input
        id="seller-limit-override"
        name="limitOverride"
        type="number"
        inputMode="numeric"
        min={SELLER_LIMIT_OVERRIDE_MIN}
        max={SELLER_LIMIT_OVERRIDE_MAX}
        step={1}
        defaultValue={state.limitInput ?? (overrideLimit === null ? '' : String(overrideLimit))}
        placeholder={t('customAllowancePlaceholder', { min: SELLER_LIMIT_OVERRIDE_MIN, max: SELLER_LIMIT_OVERRIDE_MAX })}
      />
      <label htmlFor="seller-allowance-reason">{t('reasonLabel')}</label>
      <textarea
        id="seller-allowance-reason"
        name="reason"
        defaultValue={state.reason}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        rows={2}
        required
      />
      <div className="seller-form-actions">
        <button
          type="submit"
          name="intent"
          value="set"
          className="button primary"
          disabled={busy || stale}
        >
          {t('saveAllowance')}
        </button>
        {overrideLimit !== null && (
          <button
            type="submit"
            name="intent"
            value="reset"
            className="button secondary"
            disabled={busy || stale}
          >
            {t('resetAllowance', { defaultLimit })}
          </button>
        )}
      </div>
    </form>
  );
}

export function SellerModerationForm({
  currentStatus,
  action,
}: {
  currentStatus: AccountStatus;
  action: BoundSellerAction;
}) {
  const t = useTranslations('admin.sellers');
  const [state, submit, busy] = useActionState(action, {});
  const stale = state.message === 'conflict';

  if (currentStatus === 'suspended') {
    return (
      <div className="seller-moderation-locked">
        <p className="form-notice">{t('suspendedLockedNotice')}</p>
        <p className="field-hint">{t('restorationDeferredNotice')}</p>
      </div>
    );
  }

  return (
    <form action={submit} className="account-form seller-admin-form">
      {state.message && (
        <p role="alert" className="admin-alert">
          {t(`errors.${state.message}`)}
        </p>
      )}
      {stale && (
        <a href="" className="text-link">
          {t('reloadSeller')}
        </a>
      )}
      <div className="seller-consequence-box">
        <p><strong>{t('moderationConsequencesTitle')}</strong></p>
        <p>{t('moderationConsequencesBody')}</p>
        <p className="field-hint">{t('restorationDeferredNotice')}</p>
      </div>

      {currentStatus === 'active' ? (
        <fieldset className="seller-moderation-choices">
          <legend>{t('moderationActionLegend')}</legend>
          <label className="seller-choice-row">
            <input
              type="radio"
              name="targetStatus"
              value="hidden"
              defaultChecked={state.targetStatus !== 'suspended'}
            />
            <span>
              <strong>{t('hideSellerAction')}</strong>
              <small>{t('hideSellerHint')}</small>
            </span>
          </label>
          <label className="seller-choice-row">
            <input
              type="radio"
              name="targetStatus"
              value="suspended"
              defaultChecked={state.targetStatus === 'suspended'}
            />
            <span>
              <strong>{t('suspendSellerAction')}</strong>
              <small>{t('suspendSellerHint')}</small>
            </span>
          </label>
        </fieldset>
      ) : (
        <>
          <p className="form-notice">{t('hiddenEscalateNotice')}</p>
          <input type="hidden" name="targetStatus" value="suspended" />
        </>
      )}

      <label htmlFor="seller-moderation-reason">{t('moderationReasonLabel')}</label>
      <textarea
        id="seller-moderation-reason"
        name="reason"
        defaultValue={state.reason}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        rows={3}
        required
      />

      <label className="seller-confirm-check">
        <input type="checkbox" name="confirmModeration" value="yes" required />
        <span>{t('moderationConfirmCheckbox')}</span>
      </label>

      <div className="seller-form-actions">
        <button type="submit" className="button seller-danger-button" disabled={busy || stale}>
          {currentStatus === 'hidden' ? t('confirmSuspendAction') : t('confirmModerationAction')}
        </button>
      </div>
    </form>
  );
}
