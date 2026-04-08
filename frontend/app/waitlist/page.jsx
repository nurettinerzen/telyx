'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, User, Building2, Briefcase, MessageSquare, Loader2, CheckCircle } from 'lucide-react';
import { TelyxLogoFull } from '@/components/TelyxLogo';
import { apiClient } from '@/lib/api';
import { toast, Toaster } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';

export default function WaitlistPage() {
  const { t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    businessType: '',
    message: '',
  });

  const businessTypes = [
    { value: 'ecommerce', label: t('contact.form.types.ecommerce') },
    { value: 'restaurant', label: t('contact.form.types.restaurant') },
    { value: 'salon', label: t('contact.form.types.salon') },
    { value: 'service', label: t('contact.form.types.service') },
    { value: 'other', label: t('contact.form.types.other') },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.name || !formData.email) {
        toast.error(t('auth.pleaseFillAllFields'));
        setLoading(false);
        return;
      }

      await apiClient.post('/api/waitlist', formData);
      setSubmitted(true);
      toast.success(t('waitlist.success'));
    } catch (error) {
      console.error('Waitlist submission error:', error);
      if (error.response?.data?.code === 'ALREADY_APPLIED') {
        toast.error(t('waitlist.alreadyApplied'));
      } else {
        toast.error(error.response?.data?.error || t('contact.errorMessage'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex justify-between items-center mb-8">
            <Link href="/">
              <TelyxLogoFull width={148} height={42} darkMode={mounted && resolvedTheme === 'dark'} />
            </Link>
            <LanguageSwitcher />
          </div>

          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl dark:border dark:border-neutral-700 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-medium text-gray-900 dark:text-white mb-4">
              {t('waitlist.success')}
            </h1>
            <p className="text-gray-600 dark:text-neutral-400 mb-8">
              {t('waitlist.success')}
            </p>
            <Link href="/">
              <Button variant="outline" className="w-full">
                {t('common.back')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center p-4">
      <Toaster position="top-right" />

      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <Link href="/">
            <TelyxLogoFull width={148} height={42} darkMode={mounted && resolvedTheme === 'dark'} />
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl dark:border dark:border-neutral-700 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-normal tracking-tight text-gray-900 dark:text-white mb-2">
              {t('waitlist.title')}
            </h1>
            <p className="text-gray-600 dark:text-neutral-400">{t('waitlist.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="name">{t('waitlist.name')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  placeholder={t('contact.form.namePlaceholder')}
                  className="pl-10"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">{t('waitlist.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('contact.form.emailPlaceholder')}
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="company">{t('waitlist.company')}</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="company"
                  type="text"
                  placeholder={t('contact.form.companyPlaceholder')}
                  className="pl-10"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="businessType">{t('waitlist.businessType')}</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
                <select
                  id="businessType"
                  className="w-full pl-11 pr-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-neutral-700 dark:text-white appearance-none"
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                >
                  <option value="">{t('contact.form.selectType')}</option>
                  {businessTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="message">{t('waitlist.message')}</Label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                <textarea
                  id="message"
                  placeholder={t('contact.form.messagePlaceholder')}
                  className="w-full pl-11 pr-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[100px] resize-none bg-white dark:bg-neutral-700 dark:text-white placeholder-gray-400 dark:placeholder-neutral-400"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('waitlist.submit')
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-neutral-400">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link href="/login" className="text-primary-700 dark:text-primary-300 hover:underline font-medium">
              {t('common.signIn')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
