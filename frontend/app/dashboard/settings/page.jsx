/**
 * Settings Page
 * User profile and account settings
 * UPDATE EXISTING FILE: frontend/app/dashboard/settings/page.jsx
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SecurePasswordInput } from '@/components/ui/secure-password-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  AlertTriangle,
  Globe,
  Mail,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';

import {
  useProfile,
  useEmailSignature,
  useEmailPairStats,
  useUpdateProfile,
  useUpdateEmailSignature,
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
} from '@/hooks/useSettings';

export default function SettingsPage() {
  const router = useRouter();
  const { t, locale, changeLocale } = useLanguage();
  const { can } = usePermissions();
  const pageHelp = getPageHelp('settings', locale);

  // React Query hooks
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const { data: signatureData, isLoading: signatureLoading } = useEmailSignature();
  const { data: pairStats } = useEmailPairStats();

  const updateProfile = useUpdateProfile();
  const updateEmailSignature = useUpdateEmailSignature();
  const changePassword = useChangePassword();
  const changeEmail = useChangeEmail();
  const deleteAccount = useDeleteAccount();

  const loading = profileLoading || signatureLoading;

  // Local state for form inputs
  const [profile, setProfile] = useState({ name: '', email: '', company: '' });
  const [region, setRegion] = useState({ language: 'TR', country: 'TR', timezone: 'Europe/Istanbul' });
  const [emailSignature, setEmailSignature] = useState({
    signature: '',
    signatureType: 'PLAIN',
  });
  const [passwordInputNonce, setPasswordInputNonce] = useState(0);
  const [emailInputNonce, setEmailInputNonce] = useState(0);
  const [deleteInputNonce, setDeleteInputNonce] = useState(0);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [hasDeletePassword, setHasDeletePassword] = useState(false);
  const [emailChange, setEmailChange] = useState({ newEmail: '' });

  // Password values stored in refs to avoid React DevTools exposure
  const passwordValues = useRef({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const emailPasswordRef = useRef('');
  const deletePasswordRef = useRef('');

  const deleteConfirmationPhrase = locale === 'tr' ? 'hesabımı sil' : 'delete my account';
  const isOwner = profileData?.user?.role === 'OWNER';

  // Update local state when data is loaded
  useEffect(() => {
    if (profileData) {
      setProfile({
        name: profileData.name,
        email: profileData.email,
        company: profileData.company,
      });
      const bizData = profileData.business || {};
      setRegion({
        language: bizData.language || 'TR',
        country: bizData.country || 'TR',
        timezone: bizData.timezone || 'Europe/Istanbul',
      });
    }
  }, [profileData]);

  useEffect(() => {
    if (signatureData) {
      setEmailSignature(signatureData);
    }
  }, [signatureData]);

  const getApiErrorMessage = (error, fallback) => {
    return error?.response?.data?.error
      || error?.response?.data?.message
      || error?.message
      || fallback;
  };

  const normalizeConfirmation = (value) => {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  const dispatchUserRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('telyx:user-updated'));
    }
  };

  const runToastAction = async (promiseFactory, messages) => {
    const toastId = toast.loading(messages.loading);

    try {
      const result = await promiseFactory();
      toast.dismiss(toastId);
      toast.success(messages.success);
      return result;
    } catch (error) {
      toast.dismiss(toastId);
      toast.error(getApiErrorMessage(error, messages.error));
      throw error;
    }
  };

  const handleSaveProfile = async () => {
    try {
      await runToastAction(
        () => updateProfile.mutateAsync(profile),
        {
          loading: t('dashboard.settingsPage.savingProfile'),
          success: t('dashboard.settingsPage.profileUpdatedSuccess'),
          error: t('dashboard.settingsPage.profileUpdateFailed'),
        }
      );
      dispatchUserRefresh();
    } catch {}
  };

  const handleSaveRegion = async () => {
    try {
      await runToastAction(
        () => updateProfile.mutateAsync(region),
        {
          loading: t('dashboard.settingsPage.savingRegion'),
          success: t('dashboard.settingsPage.regionUpdated'),
          error: t('dashboard.settingsPage.regionUpdateFailed'),
        }
      );
      dispatchUserRefresh();
    } catch (error) {
      console.error('Update region error:', error);
    }
  };

  const handleSaveSignature = async () => {
    try {
      await updateEmailSignature.mutateAsync({
        emailSignature: emailSignature.signature,
        signatureType: emailSignature.signatureType,
      });
      toast.success(t('dashboard.settingsPage.signatureSaved'));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('dashboard.settingsPage.signatureFailed')));
    }
  };

  const handleChangeEmail = async () => {
    const nextEmail = String(emailChange.newEmail || '').trim().toLowerCase();
    const currentEmail = String(profile.email || '').trim().toLowerCase();

    if (!nextEmail || !emailPasswordRef.current) {
      toast.error(t('dashboard.settingsPage.emailFieldsRequired'));
      return;
    }

    if (nextEmail === currentEmail) {
      toast.error(t('dashboard.settingsPage.emailMustBeDifferent'));
      return;
    }

    try {
      const result = await runToastAction(
        async () => {
          await apiClient.auth.reauthenticate(emailPasswordRef.current);
          return changeEmail.mutateAsync({
            newEmail: nextEmail,
            password: emailPasswordRef.current,
          });
        },
        {
          loading: t('dashboard.settingsPage.changingEmail'),
          success: t('auth.emailChanged'),
          error: t('auth.emailChangeFailed'),
        }
      );

      emailPasswordRef.current = '';
      setEmailChange({ newEmail: '' });
      setEmailInputNonce((current) => current + 1);
      setProfile((current) => ({ ...current, email: result?.data?.email || nextEmail }));
      dispatchUserRefresh();
      router.push('/auth/email-pending');
    } catch {}
  };

  const handleChangePassword = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordValues.current;

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('dashboard.settingsPage.passwordFieldsRequired'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('dashboard.settingsPage.passwordsDoNotMatch'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('errors.passwordTooShort'));
      return;
    }

    try {
      await runToastAction(
        async () => {
          await apiClient.auth.reauthenticate(currentPassword);
          return changePassword.mutateAsync({
            currentPassword,
            newPassword,
          });
        },
        {
          loading: t('dashboard.settingsPage.changingPassword'),
          success: t('dashboard.settingsPage.passwordChangedSuccess'),
          error: t('dashboard.settingsPage.passwordChangeFailed'),
        }
      );
      passwordValues.current = { currentPassword: '', newPassword: '', confirmPassword: '' };
      setPasswordInputNonce((current) => current + 1);
      dispatchUserRefresh();
    } catch {}
  };

  const handleDeleteAccount = async () => {
    if (!deletePasswordRef.current) {
      toast.error(t('dashboard.settingsPage.deleteAccountPasswordRequired'));
      return;
    }

    if (normalizeConfirmation(deleteConfirmationText) !== normalizeConfirmation(deleteConfirmationPhrase)) {
      toast.error(t('dashboard.settingsPage.deleteAccountConfirmationMismatch'));
      return;
    }

    try {
      const result = await runToastAction(
        async () => {
          await apiClient.auth.reauthenticate(deletePasswordRef.current);
          return deleteAccount.mutateAsync({
            currentPassword: deletePasswordRef.current,
            confirmationText: deleteConfirmationText,
          });
        },
        {
          loading: t('dashboard.settingsPage.deletingAccount'),
          success: isOwner
            ? t('dashboard.settingsPage.workspaceDeletedSuccess')
            : t('dashboard.settingsPage.accountDeletedSuccess'),
          error: t('dashboard.settingsPage.deleteAccountFailed'),
        }
      );

      deletePasswordRef.current = '';
      setDeleteConfirmationText('');
      setHasDeletePassword(false);
      setDeleteInputNonce((current) => current + 1);
      window.location.href = '/login';
      return result;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <PageIntro
        title={pageHelp?.title || t('dashboard.settingsPage.title')}
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      {/* Profile Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg">
            <User className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{t('dashboard.settingsPage.profileInformation')}</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('dashboard.settingsPage.updatePersonalDetails')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <Label htmlFor="name">{t('dashboard.settingsPage.fullNameLabel')}</Label>
            <Input
              id="name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email">{t('dashboard.settingsPage.emailAddressLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              readOnly
              disabled
              className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t('dashboard.settingsPage.emailChangeHint')}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50 xl:col-span-2">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  {t('auth.changeEmailAddress')}
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('dashboard.settingsPage.emailChangeVerificationHint')}
                </p>
              </div>

              <div>
                <Label htmlFor="newEmailAddress">{t('auth.newEmailAddress')}</Label>
                <Input
                  id="newEmailAddress"
                  type="email"
                  autoComplete="email"
                  value={emailChange.newEmail}
                  onChange={(e) => setEmailChange({ newEmail: e.target.value })}
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <Label htmlFor="emailChangePassword">{t('dashboard.settingsPage.emailChangePasswordLabel')}</Label>
                <SecurePasswordInput
                  key={`email-change-password-${emailInputNonce}`}
                  id="emailChangePassword"
                  autoComplete="current-password"
                  onValueChange={(value) => {
                    emailPasswordRef.current = value;
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleChangeEmail} disabled={changeEmail.isPending}>
                {changeEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.changeEmail')}
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="company">{t('dashboard.settingsPage.companyNameOptional')}</Label>
            <Input
              id="company"
              value={profile.company || ''}
              onChange={(e) => setProfile({ ...profile, company: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            <span className="font-medium text-neutral-900 dark:text-white">{t('dashboard.settingsPage.profileImpactTitle')}</span>{' '}
            {t('dashboard.settingsPage.profileImpactDescription')}
          </p>
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleSaveProfile} disabled={updateProfile.isPending}>
            {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('dashboard.settingsPage.saveChangesBtn')}
          </Button>
        </div>
      </div>

      {/* Business Identity — moved to Assistant wizard */}

      {/* Business Type Section - Removed
         Business type is now set during onboarding and cannot be changed afterwards.
         This prevents confusion and ensures integrations remain consistent. */}

      {/* Region & Language Section */}
      {can('settings:edit') && (
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg">
            <Globe className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{t('dashboard.settingsPage.regionSettings')}</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('dashboard.settingsPage.regionDescription')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="language">{t('dashboard.settingsPage.language')}</Label>
            <Select value={region.language} onValueChange={(val) => {
              setRegion({...region, language: val});
              changeLocale(val.toLowerCase());
            }}>
              <SelectTrigger id="language" className="w-full">
                <SelectValue placeholder={t('dashboard.settingsPage.selectLanguage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TR">Türkçe</SelectItem>
                <SelectItem value="EN">English</SelectItem>
                <SelectItem value="DE">Deutsch</SelectItem>
                <SelectItem value="ES">Español</SelectItem>
                <SelectItem value="FR">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="country">{t('dashboard.settingsPage.country')}</Label>
            <Select value={region.country} onValueChange={(val) => setRegion({...region, country: val})}>
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder={t('dashboard.settingsPage.selectCountry')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TR">Türkiye</SelectItem>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="GB">United Kingdom</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                <SelectItem value="ES">Spain</SelectItem>
                <SelectItem value="NL">Netherlands</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="timezone">{t('dashboard.settingsPage.timezone')}</Label>
            <Select value={region.timezone} onValueChange={(val) => setRegion({...region, timezone: val})}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder={t('dashboard.settingsPage.selectTimezone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Istanbul">(UTC+3) Istanbul</SelectItem>
                <SelectItem value="Europe/London">(UTC+0) London</SelectItem>
                <SelectItem value="Europe/Paris">(UTC+1) Paris</SelectItem>
                <SelectItem value="Europe/Berlin">(UTC+1) Berlin</SelectItem>
                <SelectItem value="America/New_York">(UTC-5) New York</SelectItem>
                <SelectItem value="America/Los_Angeles">(UTC-8) Los Angeles</SelectItem>
                <SelectItem value="Asia/Dubai">(UTC+4) Dubai</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleSaveRegion}>{t('dashboard.settingsPage.saveRegion')}</Button>
        </div>
      </div>
      )}

      {/* Email Signature Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg">
            <Mail className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t('dashboard.settingsPage.emailSignatureTitle')}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('dashboard.settingsPage.emailSignatureDescription')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="signatureType">
              {t('dashboard.settingsPage.signatureTypeLabel')}
            </Label>
            <Select
              value={emailSignature.signatureType}
              onValueChange={(val) => setEmailSignature({...emailSignature, signatureType: val})}
            >
              <SelectTrigger id="signatureType" className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PLAIN">{t('dashboard.settingsPage.signatureTypePlain')}</SelectItem>
                <SelectItem value="HTML">{t('dashboard.settingsPage.signatureTypeHtml')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="emailSignature">
              {t('dashboard.settingsPage.signatureLabel')}
            </Label>
            <Textarea
              id="emailSignature"
              rows={6}
              placeholder={emailSignature.signatureType === 'HTML'
                ? t('dashboard.settingsPage.signaturePlaceholderHtml')
                : t('dashboard.settingsPage.signaturePlaceholderPlain')
              }
              value={emailSignature.signature}
              onChange={(e) => setEmailSignature({...emailSignature, signature: e.target.value})}
              className="font-mono text-sm"
            />
            {!emailSignature.signature && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('dashboard.settingsPage.signatureWarning')}
              </p>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {emailSignature.signatureType === 'HTML'
                ? t('dashboard.settingsPage.signatureHelpHtml')
                : t('dashboard.settingsPage.signatureHelpPlain')
              }
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {t('dashboard.settingsPage.signatureOverrideNote')}
            </p>
          </div>

          {/* Pair Stats */}
          {pairStats && pairStats.total > 0 && (
            <div className="mt-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                <span className="font-semibold text-neutral-900 dark:text-white">{pairStats.total}</span> {t('dashboard.settingsPage.learnedEmailExamples')}
                {pairStats.byLanguage && pairStats.byLanguage.length > 0 && (
                  <span className="ml-2">
                    ({pairStats.byLanguage.map(l => `${l._count._all} ${l.language}`).join(', ')})
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {t('dashboard.settingsPage.learnedEmailExamplesHelp')}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleSaveSignature} disabled={updateEmailSignature.isPending}>
            {updateEmailSignature.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('dashboard.settingsPage.saveSignatureBtn')}
          </Button>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{t('dashboard.settingsPage.securityTitle')}</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('dashboard.settingsPage.managePasswordLabel')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div>
            <Label htmlFor="currentPassword">{t('dashboard.settingsPage.currentPasswordLabel')}</Label>
            <SecurePasswordInput
              key={`current-password-${passwordInputNonce}`}
              id="currentPassword"
              autoComplete="current-password"
              onValueChange={(val) => passwordValues.current.currentPassword = val}
            />
          </div>
          <div>
            <Label htmlFor="newPassword">{t('dashboard.settingsPage.newPasswordLabel')}</Label>
            <SecurePasswordInput
              key={`new-password-${passwordInputNonce}`}
              id="newPassword"
              autoComplete="new-password"
              showToggle
              onValueChange={(val) => passwordValues.current.newPassword = val}
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">{t('dashboard.settingsPage.confirmNewPassword')}</Label>
            <SecurePasswordInput
              key={`confirm-password-${passwordInputNonce}`}
              id="confirmPassword"
              autoComplete="new-password"
              onValueChange={(val) => passwordValues.current.confirmPassword = val}
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t('dashboard.settingsPage.passwordRecentAuthHint')}
        </p>

        <div className="flex justify-end mt-6">
          <Button onClick={handleChangePassword} disabled={changePassword.isPending}>
            {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('dashboard.settingsPage.changePasswordBtn')}
          </Button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <h2 className="text-base font-semibold text-red-900 dark:text-red-300">{t('dashboard.settingsPage.dangerZoneTitle')}</h2>
        </div>
        <p className="text-sm text-red-700 dark:text-red-400 mb-4">
          {t('dashboard.settingsPage.deleteAccountWarning')}
        </p>

        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-white/70 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            {isOwner
              ? t('dashboard.settingsPage.deleteWorkspaceOwnerWarning')
              : t('dashboard.settingsPage.deleteAccountMemberWarning')}
          </div>

          <div>
            <Label htmlFor="deleteAccountPassword">{t('dashboard.settingsPage.deleteAccountPasswordLabel')}</Label>
            <SecurePasswordInput
              key={`delete-password-${deleteInputNonce}`}
              id="deleteAccountPassword"
              autoComplete="current-password"
              onValueChange={(value) => {
                deletePasswordRef.current = value;
                setHasDeletePassword(Boolean(value));
              }}
            />
          </div>

          <div>
            <Label htmlFor="deleteAccountPhrase">{t('dashboard.settingsPage.deleteAccountConfirmationLabel')}</Label>
            <Input
              id="deleteAccountPhrase"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder={deleteConfirmationPhrase}
            />
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">
              {t('dashboard.settingsPage.deleteAccountConfirmationHelp', { phrase: deleteConfirmationPhrase })}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={
              deleteAccount.isPending
              || !hasDeletePassword
              || normalizeConfirmation(deleteConfirmationText) !== normalizeConfirmation(deleteConfirmationPhrase)
            }
          >
            {deleteAccount.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {isOwner
              ? t('dashboard.settingsPage.deleteWorkspaceBtn')
              : t('dashboard.settingsPage.deleteAccountBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
