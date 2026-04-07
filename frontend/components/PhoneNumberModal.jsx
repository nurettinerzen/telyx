/**
 * PhoneNumberModal Component with Generic SIP Provider Support
 * Supports multiple SIP providers (NetGSM, Bulutfon, VoIP Telekom, etc.)
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Loader2, ExternalLink, Eye, EyeOff, Info, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PhoneNumberModal({ isOpen, onClose, onSuccess }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countries, setCountries] = useState([]);
  const [sipProviders, setSipProviders] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // SIP Form State - TCP is required for ElevenLabs
  const [sipForm, setSipForm] = useState({
    phoneNumber: '',
    sipServer: 'sip.netgsm.com.tr',
    sipUsername: '',
    sipPassword: '',
    sipPort: '5060',
    sipTransport: 'TCP'  // ElevenLabs only supports TCP/TLS
  });

  useEffect(() => {
    if (isOpen) {
      loadCountries();
    }
  }, [isOpen]);

  // Update SIP defaults when provider changes
  useEffect(() => {
    if (selectedProvider) {
      setSipForm(prev => ({
        ...prev,
        // Use provider's default, or clear if no default (user must enter manually)
        sipServer: selectedProvider.defaultServer || 'sip.netgsm.com.tr',
        sipPort: String(selectedProvider.defaultPort || 5060),
        // TCP is required for ElevenLabs (UDP not supported)
        sipTransport: selectedProvider.defaultTransport || 'TCP'
      }));
    }
  }, [selectedProvider]);

  const loadCountries = async () => {
    setLoadingCountries(true);
    try {
      const response = await apiClient.phoneNumbers.getCountries();
      const countryList = response.data.countries || [];
      const providerList = response.data.sipProviders || [];

      setCountries(countryList);
      setSipProviders(providerList);

      // Auto-select first country
      if (countryList.length > 0) {
        setSelectedCountry(countryList[0]);

        // Auto-select first provider for this country
        const countryProviders = countryList[0].sipProviders || providerList;
        if (countryProviders.length > 0) {
          setSelectedProvider(countryProviders[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load countries:', error);
      toast.error(t('dashboard.phoneNumbersPage.modal.failedToLoadCountries'));
    } finally {
      setLoadingCountries(false);
    }
  };

  const handleSipFormChange = (field, value) => {
    setSipForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImportSip = async () => {
    // Validate form
    if (!sipForm.phoneNumber) {
      toast.error(t('dashboard.phoneNumbersPage.modal.sipPhoneRequired'));
      return;
    }
    if (!sipForm.sipServer) {
      toast.error(t('dashboard.phoneNumbersPage.modal.sipServerRequired') || 'SIP sunucu adresi gerekli');
      return;
    }
    if (!sipForm.sipUsername) {
      toast.error(t('dashboard.phoneNumbersPage.modal.sipUsernameRequired'));
      return;
    }
    if (!sipForm.sipPassword) {
      toast.error(t('dashboard.phoneNumbersPage.modal.sipPasswordRequired'));
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.phoneNumbers.importSip({
        phoneNumber: sipForm.phoneNumber,
        sipServer: sipForm.sipServer,
        sipUsername: sipForm.sipUsername,
        sipPassword: sipForm.sipPassword,
        sipPort: parseInt(sipForm.sipPort) || 5060,
        sipTransport: sipForm.sipTransport,
        provider: selectedProvider?.id || 'other'
      });

      toast.success(response.data.message || t('dashboard.phoneNumbersPage.modal.numberProvisioned'));
      onSuccess && onSuccess();
      handleClose();
    } catch (error) {
      console.error('Import SIP error:', error);

      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          t('dashboard.phoneNumbersPage.modal.sipImportFailed');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedCountry(null);
    setSelectedProvider(null);
    setSipForm({
      phoneNumber: '',
      sipServer: '',
      sipUsername: '',
      sipPassword: '',
      sipPort: '5060',
      sipTransport: 'UDP'
    });
    setShowPassword(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t('dashboard.phoneNumbersPage.modal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('dashboard.phoneNumbersPage.modal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* NetGSM Info Banner */}
          <div className="bg-gradient-to-r from-primary-50 to-cyan-50 dark:from-primary-950 dark:to-cyan-950 border border-primary-200 dark:border-primary-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-900 rounded-lg">
                <Phone className="h-5 w-5 text-primary-600 dark:text-cyan-300" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-primary-900 dark:text-white mb-1">
                  NetGSM ile Bağlantı
                </h4>
                <p className="text-sm text-primary-700 dark:text-cyan-100 mb-3">
                  NetGSM 0850 numaranızı AI asistanınıza bağlamak için SIP bilgilerinizi girin.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://portal.netgsm.com.tr/satis_arayuzu/ses-paketler.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                  >
                    Ses Paketi Al <ExternalLink className="h-3 w-3" />
                  </a>
                  <Link
                    href="/dashboard/guides/netgsm-connection"
                    className="inline-flex items-center gap-1 text-xs bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-2 py-1 rounded hover:bg-teal-200 dark:hover:bg-teal-800"
                  >
                    <BookOpen className="h-3 w-3" /> Bağlantı Rehberi
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Country Selection - Auto-select Turkey */}
          <div className="hidden">
            {/* Hidden - auto-selecting Turkey for now */}
            {loadingCountries ? null : (
              countries.length > 0 && !selectedCountry && setSelectedCountry(countries.find(c => c.code === 'TR') || countries[0])
            )}
          </div>

          {/* SIP Form - Always show for NetGSM */}
          <div className="space-y-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              <h4 className="font-medium text-neutral-900 dark:text-white">
                NetGSM SIP Bilgileri
              </h4>
            </div>

            {/* Help Text */}
            <div className="text-sm text-neutral-600 dark:text-neutral-400 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span>NetGSM panelinden: <strong>Ses Hizmeti → Ayarlar → SIP Bilgileri</strong></span>
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <Label htmlFor="phoneNumber">Telefon Numarası</Label>
              <Input
                id="phoneNumber"
                placeholder="örn: 08501234567"
                value={sipForm.phoneNumber}
                onChange={(e) => handleSipFormChange('phoneNumber', e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-neutral-500 mt-1">NetGSM panelindeki telefon numaranız</p>
            </div>

            {/* SIP Username */}
            <div>
              <Label htmlFor="sipUsername">SIP Kullanıcı Adı</Label>
              <Input
                id="sipUsername"
                placeholder="örn: 8501234567"
                value={sipForm.sipUsername}
                onChange={(e) => handleSipFormChange('sipUsername', e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-neutral-500 mt-1">NetGSM SIP Bilgileri'ndeki Kullanıcı Adı</p>
            </div>

            {/* SIP Password */}
            <div>
              <Label htmlFor="sipPassword">SIP Şifresi</Label>
              <div className="relative mt-1">
                <Input
                  id="sipPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="NetGSM SIP şifreniz"
                  value={sipForm.sipPassword}
                  onChange={(e) => handleSipFormChange('sipPassword', e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">NetGSM SIP Bilgileri'ndeki Şifre (Şifreyi Göster butonuna tıklayın)</p>
            </div>

            {/* Hidden fields with defaults */}
            <input type="hidden" value={sipForm.sipServer} />
            <input type="hidden" value={sipForm.sipPort} />
            <input type="hidden" value={sipForm.sipTransport} />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleImportSip}
            disabled={loading || !sipForm.phoneNumber || !sipForm.sipUsername || !sipForm.sipPassword}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('dashboard.phoneNumbersPage.modal.processing')}
              </>
            ) : (
              <>
                <Phone className="mr-2 h-5 w-5" />
                Numarayı Ekle
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
