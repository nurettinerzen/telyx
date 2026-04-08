'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, User } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export const LiveDemoSection = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Call the demo outbound call endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/request-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: formData.phone,
          name: formData.name,
          language: 'TR'
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('landing.demo.successMessage'));
        setFormData({ name: '', email: '', phone: '' });
      } else {
        toast.error(data.error || t('landing.demo.errorMessage'));
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('landing.demo.errorMessage'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <section id="live-demo" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-gray-50 dark:from-neutral-950 dark:to-neutral-900">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground dark:text-white mb-4">
            {t('landing.demo.title')}
          </h2>
          <p className="text-xl text-muted-foreground dark:text-neutral-400 max-w-2xl mx-auto">
            {t('landing.demo.subtitle')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <Card className="max-w-2xl mx-auto border-2 border-primary/20 dark:border-primary/30 shadow-blue-lg bg-card dark:bg-neutral-800">
            <div className="p-8 sm:p-12">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center">
                  <Phone className="w-8 h-8 text-primary-700 dark:text-primary-300" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-center text-foreground dark:text-white mb-2">
                {t('landing.demo.formTitle')}
              </h3>
              <p className="text-center text-muted-foreground dark:text-neutral-400 mb-8">
                {t('landing.demo.formSubtitle')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground dark:text-white flex items-center">
                    <User className="w-4 h-4 mr-2 text-muted-foreground dark:text-neutral-400" />
                    {t('landing.demo.nameLabel')}
                  </label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder={t('landing.demo.namePlaceholder')}
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="h-12 border-border dark:border-neutral-600 dark:bg-neutral-700 dark:text-white focus:border-primary focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground dark:text-white flex items-center">
                    <Mail className="w-4 h-4 mr-2 text-muted-foreground dark:text-neutral-400" />
                    {t('landing.demo.emailLabel')}
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t('landing.demo.emailPlaceholder')}
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="h-12 border-border dark:border-neutral-600 dark:bg-neutral-700 dark:text-white focus:border-primary focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-foreground dark:text-white flex items-center">
                    <Phone className="w-4 h-4 mr-2 text-muted-foreground dark:text-neutral-400" />
                    {t('landing.demo.phoneLabel')}
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder={t('landing.demo.phonePlaceholder')}
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="h-12 border-border dark:border-neutral-600 dark:bg-neutral-700 dark:text-white focus:border-primary focus:ring-primary"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-blue h-12 text-base font-semibold"
                >
                  {loading ? t('common.loading') : t('landing.demo.submitButton')}
                </Button>

                <p className="text-xs text-center text-muted-foreground dark:text-neutral-500 mt-4">
                  {t('landing.demo.consent')}
                </p>
              </form>
            </div>
          </Card>
        </motion.div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid md:grid-cols-3 gap-6 mt-16"
        >
          {[
            { titleKey: 'landing.demo.feature1.title', descKey: 'landing.demo.feature1.desc' },
            { titleKey: 'landing.demo.feature2.title', descKey: 'landing.demo.feature2.desc' },
            { titleKey: 'landing.demo.feature3.title', descKey: 'landing.demo.feature3.desc' },
          ].map((feature, index) => (
            <Card key={index} className="p-6 hover:shadow-lg transition-shadow bg-card dark:bg-neutral-800 border-border dark:border-neutral-700">
              <h4 className="font-semibold text-foreground dark:text-white mb-2">{t(feature.titleKey)}</h4>
              <p className="text-sm text-muted-foreground dark:text-neutral-400">{t(feature.descKey)}</p>
            </Card>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
