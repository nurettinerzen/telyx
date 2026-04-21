/**
 * VoiceCard Component
 * Voice selection card with play button for 11Labs voices
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';

export default function VoiceCard({ voice, onSelect, isSelected, compact = false }) {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const handlePlayPause = useCallback(async (e) => {
    e.stopPropagation();

    if (!voice.sampleUrl) return;
    if (isLoading) return;

    const audio = audioRef.current;
    if (!audio) return;

    // If playing, just pause
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Pause all other audio elements on page
    document.querySelectorAll('audio').forEach(a => {
      if (a !== audio) {
        a.pause();
        a.currentTime = 0;
      }
    });

    // If we already have a blob URL loaded, replay
    if (blobUrlRef.current) {
      try {
        audio.currentTime = 0;
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Audio replay failed:', err);
        setHasError(true);
      }
      return;
    }

    // Fetch audio as blob (handles slow TTS endpoints)
    setIsLoading(true);
    setHasError(false);
    try {
      // Use relative URL to go through Next.js proxy (avoids CORS/CSP)
      const sampleUrl = voice.sampleUrl.includes('/api/voices/preview/')
        ? '/api/voices/preview/' + voice.sampleUrl.split('/api/voices/preview/')[1]
        : voice.sampleUrl;
      const response = await fetch(sampleUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error('Empty audio response');

      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Set src and wait for it to be playable
      audio.src = url;
      await new Promise((resolve, reject) => {
        const onCanPlay = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Audio load error')); };
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', onCanPlay);
          audio.removeEventListener('error', onError);
        };
        audio.addEventListener('canplaythrough', onCanPlay, { once: true });
        audio.addEventListener('error', onError, { once: true });
        audio.load();
      });

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to load voice preview:', err);
      setHasError(true);
      // Cleanup failed blob
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    } finally {
      setIsLoading(false);
    }
  }, [voice.sampleUrl, isPlaying, isLoading]);

  const handleAudioEnd = () => {
    setIsPlaying(false);
  };

  const handleAudioError = () => {
    setIsPlaying(false);
    setIsLoading(false);
  };

  return (
    <div
      className={`relative bg-white dark:bg-neutral-900 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
        compact ? 'p-3' : 'p-6'
      } ${
        isSelected ? 'border-primary-600 ring-2 ring-primary-100 dark:ring-primary-900' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
      onClick={() => onSelect(voice)}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className={`absolute ${compact ? 'top-2 right-2' : 'top-4 right-4'} bg-primary-600 rounded-full p-1`}>
          <Check className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Voice info */}
      <div className={compact ? 'mb-2' : 'mb-4'}>
        <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-neutral-900 dark:text-white ${compact ? 'mb-1' : 'mb-2'}`}>{voice.name}</h3>

        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge
            variant="secondary"
            className="text-xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
          >
            {t(`dashboard.voicesPage.genders.${voice.gender?.toLowerCase()}`) || voice.gender}
          </Badge>
          {!compact && (
            <Badge variant="outline" className="text-xs">
              {t(`dashboard.voicesPage.accents.${voice.accent}`) || voice.accent}
            </Badge>
          )}
          {!compact && voice.language && (
            <Badge variant="outline" className="text-xs">
              {voice.language}
            </Badge>
          )}
        </div>

        {voice.description && !compact && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">{voice.description}</p>
        )}
        {voice.description && compact && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{voice.description}</p>
        )}
      </div>

      {/* Play button */}
      {voice.sampleUrl ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePlayPause}
            disabled={isLoading}
            className={`w-full ${hasError ? 'border-red-300 text-red-500' : ''}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('dashboard.voicesPage.loadingSample')}
              </>
            ) : hasError ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t('dashboard.voicesPage.playSampleError')}
              </>
            ) : isPlaying ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                {t('dashboard.voicesPage.pauseSample')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t('dashboard.voicesPage.playSample')}
              </>
            )}
          </Button>

          <audio
            ref={audioRef}
            onEnded={handleAudioEnd}
            onError={handleAudioError}
            preload="none"
            className="hidden"
          />
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled
          className="w-full opacity-50"
        >
          <Play className="h-4 w-4 mr-2" />
          {t('dashboard.voicesPage.sampleNotAvailable')}
        </Button>
      )}
    </div>
  );
}
