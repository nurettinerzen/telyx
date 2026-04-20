'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Mail, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';

function getSafeReturnTo(value) {
  if (typeof value !== 'string') {
    return '/dashboard/admin';
  }

  if (!value.startsWith('/dashboard/admin')) {
    return '/dashboard/admin';
  }

  return value;
}

export default function AdminAuthPage() {
  const { locale } = useLanguage();
  const isTr = locale === 'tr';
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => getSafeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [code, setCode] = useState('');

  const copy = useMemo(() => ({
    verifyAccessFailed: isTr ? 'Admin erişimi doğrulanamadı.' : 'Failed to verify admin access.',
    challengeSent: isTr ? 'MFA kodu admin e-postasına gönderildi.' : 'The MFA code was sent to the admin email.',
    challengeFailed: isTr ? 'MFA kodu gönderilemedi.' : 'Failed to send the MFA code.',
    challengeRequired: isTr ? 'Challenge ID ve doğrulama kodu gerekli.' : 'Challenge ID and verification code are required.',
    verifySuccess: isTr ? 'Admin MFA doğrulandı.' : 'Admin MFA verified.',
    invalidCode: isTr ? 'Geçersiz MFA kodu.' : 'Invalid MFA code.',
    accessDenied: isTr ? 'Erişim Engellendi' : 'Access Denied',
    accessDeniedDesc: isTr ? 'Bu alan yalnızca admin kullanıcılar içindir.' : 'This area is for admin users only.',
    title: isTr ? 'Admin MFA Gerekli' : 'Admin MFA Required',
    description: isTr ? 'Devam etmek için e-posta tek kullanımlık kodunuzu doğrulayın.' : 'Verify your one-time email code to continue.',
    sending: isTr ? 'Kod gönderiliyor...' : 'Sending code...',
    send: isTr ? 'Doğrulama Kodu Gönder' : 'Send Verification Code',
    challengeId: 'Challenge ID',
    challengePlaceholder: isTr ? 'Challenge ID yapıştırın' : 'Paste the challenge ID',
    codeLabel: isTr ? '6 haneli kod' : '6-digit code',
    expiresAt: isTr ? 'Son kullanma' : 'Expires at',
    verifying: isTr ? 'Doğrulanıyor...' : 'Verifying...',
    verifyContinue: isTr ? 'Doğrula ve Devam Et' : 'Verify and Continue',
  }), [isTr]);

  useEffect(() => {
    checkRouteAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo]);

  const redirectToTarget = () => {
    window.location.replace(returnTo);
  };

  const checkRouteAccess = async () => {
    setLoading(true);
    setForbidden(false);

    try {
      const response = await apiClient.auth.adminRouteState({
        validateStatus: () => true,
        suppressExpected403: true,
      });

      if (response.status === 204 || response.status === 200) {
        redirectToTarget();
        return;
      }

      if (response.status === 401) {
        window.location.replace('/login');
        return;
      }

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (response.status !== 428) {
        toast.error(copy.verifyAccessFailed);
      }
    } catch (error) {
      console.error('Failed to check admin route access:', error);
      toast.error(copy.verifyAccessFailed);
    } finally {
      setLoading(false);
    }
  };

  const requestChallenge = async () => {
    try {
      setSendingCode(true);
      const response = await apiClient.auth.adminMfaChallenge();
      setChallengeId(response.data?.challengeId || '');
      setExpiresAt(response.data?.expiresAt || null);
      toast.success(copy.challengeSent);
    } catch (error) {
      const message = error.response?.data?.error || copy.challengeFailed;
      toast.error(message);
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();

    if (!challengeId || !code) {
      toast.error(copy.challengeRequired);
      return;
    }

    try {
      setVerifying(true);
      await apiClient.auth.adminMfaVerify(challengeId, code.trim());
      toast.success(copy.verifySuccess);
      setCode('');
      redirectToTarget();
    } catch (error) {
      const message = error.response?.data?.error || copy.invalidCode;
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center dark:border-white/10 dark:bg-[#081224]/95">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{copy.accessDenied}</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {copy.accessDeniedDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-neutral-200 bg-white p-6 dark:border-white/10 dark:bg-[#081224]/95">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{copy.title}</h2>
      </div>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {copy.description}
      </p>

      <Button
        type="button"
        onClick={requestChallenge}
        disabled={sendingCode}
        className="mb-4 w-full"
      >
        {sendingCode ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {copy.sending}
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            {copy.send}
          </>
        )}
      </Button>

      <form onSubmit={verifyCode} className="space-y-3">
        <div>
          <Label htmlFor="challenge-id">{copy.challengeId}</Label>
          <Input
            id="challenge-id"
            value={challengeId}
            onChange={(event) => setChallengeId(event.target.value)}
            placeholder={copy.challengePlaceholder}
            required
          />
        </div>
        <div>
          <Label htmlFor="mfa-code">{copy.codeLabel}</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            required
          />
        </div>
        {expiresAt && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {copy.expiresAt}: {new Date(expiresAt).toLocaleString(isTr ? 'tr-TR' : 'en-US')}.
          </p>
        )}
        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {copy.verifying}
            </>
          ) : (
            copy.verifyContinue
          )}
        </Button>
      </form>
    </div>
  );
}
