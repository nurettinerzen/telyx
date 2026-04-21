'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import VoiceCard from '@/components/VoiceCard';
import EmptyState from '@/components/EmptyState';
import { Mic, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

// Language code to accent name mapping
const LANGUAGE_TO_ACCENT = {
  'TR': 'Turkish',
  'EN': 'American',
  'PT': 'Portuguese', // Portuguese
  'DE': 'German',
  'FR': 'French',
  'ES': 'Spanish',
  'IT': 'Italian',
  'PT': 'Portuguese',
  'RU': 'Russian',
  'AR': 'Arabic',
  'JA': 'Japanese',
  'KO': 'Korean',
  'ZH': 'Chinese',
  'HI': 'Hindi',
  'NL': 'Dutch',
  'PL': 'Polish',
  'SV': 'Swedish',
};

export default function VoicesPage() {
  const { t, locale } = useLanguage();
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [businessLanguage, setBusinessLanguage] = useState('TR');

  // Prevent multiple API calls
  const hasFetchedRef = useRef(false);

  // Load business language - memoized to prevent recreation
  const loadBusinessLanguage = useCallback(async () => {
    try {
      const response = await apiClient.auth.me();
      const language = response.data?.business?.language || response.data?.language || 'TR';
      setBusinessLanguage(language);
    } catch (error) {
      console.error('Failed to load business language:', error);
    }
  }, []);

  // Load voices - memoized to prevent recreation
  const loadVoices = useCallback(async () => {
    try {
      // Request voices with sample URLs from 11Labs
      const response = await apiClient.voices.getAll({ withSamples: 'true' });
      // Backend returns { voices: { tr: [...], en: [...], de: [...], ... } }
      const voicesData = response.data.voices || {};
      const allVoices = [];

      // Flatten all language voices into single array
      Object.keys(voicesData).forEach(lang => {
        if (Array.isArray(voicesData[lang])) {
          allVoices.push(...voicesData[lang].map(v => ({ ...v, language: lang })));
        }
      });

      console.log('🎤 Loaded voices:', allVoices.length, 'from', Object.keys(voicesData).length, 'languages');
      // Debug: log first voice to check sampleUrl
      if (allVoices.length > 0) {
        console.log('🎤 First voice sample:', allVoices[0].name, 'sampleUrl:', allVoices[0].sampleUrl);
      }
      setVoices(allVoices);
    } catch (error) {
      console.error('Failed to load voices:', error);
      toast.error(t('dashboard.voicesPage.failedToLoadVoices'));
    }
  }, [t]);

  // Single useEffect for initial data loading - runs only once
  useEffect(() => {
    // Prevent duplicate calls in strict mode or hot reload
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load both in parallel
        await Promise.all([
          loadBusinessLanguage(),
          loadVoices()
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [loadBusinessLanguage, loadVoices]);

  const handleSelectVoice = (voice) => {
    setSelectedVoice(voice);
    toast.success(`${t('dashboard.voicesPage.selected')}: ${voice.name}`);
  };

  // Get the preferred accent based on business language
  const preferredAccent = LANGUAGE_TO_ACCENT[businessLanguage] || 'Turkish';
  const preferredLanguage = businessLanguage?.toLowerCase();

  // Filter voices - ONLY show voices matching business language
  const filteredVoices = voices.filter((voice) => {
    // Always filter by business language - no "all" option for language
    const voiceLanguage = voice.language?.toLowerCase();
    const matchesLanguage = voiceLanguage
      ? voiceLanguage === preferredLanguage
      : voice.accent === preferredAccent;
    const matchesSearch =
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGender = genderFilter === 'all' || voice.gender.toLowerCase() === genderFilter;
    return matchesLanguage && matchesSearch && matchesGender;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{t('dashboard.voicesPage.title')}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          {t('dashboard.voicesPage.description')}
        </p>
        {/* Business language indicator */}
        {businessLanguage && (
          <p className="text-sm text-primary-600 dark:text-primary-400 mt-2">
            {t('dashboard.voicesPage.businessLanguage')}: {
              businessLanguage === 'TR' ? 'Türkçe' :
              businessLanguage === 'PT' ? 'Português' :
              businessLanguage === 'EN' ? 'English' :
              businessLanguage
            }
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={t('dashboard.voicesPage.searchVoices')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dashboard.voicesPage.allGenders')}</SelectItem>
            <SelectItem value="male">{t('dashboard.voicesPage.male')}</SelectItem>
            <SelectItem value="female">{t('dashboard.voicesPage.female')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Voices grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 animate-pulse"
            >
              <div className="h-6 w-32 bg-neutral-200 dark:bg-neutral-700 rounded mb-3"></div>
              <div className="h-4 w-full bg-neutral-200 dark:bg-neutral-700 rounded mb-2"></div>
              <div className="h-4 w-2/3 bg-neutral-200 dark:bg-neutral-700 rounded mb-4"></div>
              <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredVoices.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredVoices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                onSelect={handleSelectVoice}
                isSelected={selectedVoice?.id === voice.id}
                locale={locale}
              />
            ))}
          </div>

          <div className="text-center text-sm text-neutral-500">
            {t('dashboard.voicesPage.showing')} {filteredVoices.length} {t(`dashboard.voicesPage.accents.${preferredAccent}`)} {t('dashboard.sidebar.voices')}
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-8">
          <EmptyState
            icon={Mic}
            title={t('dashboard.voicesPage.noVoicesFound')}
            description={t('dashboard.voicesPage.tryAdjustingFilters')}
          />
        </div>
      )}

      {/* Info banner */}
      <div className="bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-primary-900 dark:text-primary-100 mb-2">
          {t('dashboard.voicesPage.aboutVoiceSelection')}
        </h3>
        <p className="text-sm text-primary-700 dark:text-primary-300">
          {t('dashboard.voicesPage.voiceSelectionInfo')}
        </p>
      </div>
    </div>
  );
}
