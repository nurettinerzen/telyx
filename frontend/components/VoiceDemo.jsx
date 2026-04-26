'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation } from '@elevenlabs/client';
import { useTheme } from 'next-themes';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;
const DEFAULT_PREVIEW_DURATION_SECONDS = 10 * 60;

const getElevenLabsWorkletPaths = () => {
  if (typeof window === 'undefined') {
    return {
      rawAudioProcessor: '/elevenlabs-rawAudioProcessor.js',
      audioConcatProcessor: '/elevenlabs-audioConcatProcessor.js',
    };
  }

  const origin = window.location.origin;
  return {
    rawAudioProcessor: `${origin}/elevenlabs-rawAudioProcessor.js`,
    audioConcatProcessor: `${origin}/elevenlabs-audioConcatProcessor.js`,
  };
};

const describeError = (error, fallback = 'Bilinmeyen hata') => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof CloseEvent !== 'undefined' && error instanceof CloseEvent) {
    return `Bağlantı beklenmedik şekilde kapandı (${error.code || 'n/a'})`;
  }
  if (error.message && String(error.message).trim()) return error.message;
  if (error.error && String(error.error).trim()) return error.error;
  if (error.response?.data?.error && String(error.response.data.error).trim()) {
    return error.response.data.error;
  }
  if (error.type === 'close' && typeof error.code !== 'undefined') {
    return `Bağlantı beklenmedik şekilde kapandı (${error.code || 'n/a'})`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
};

const formatRemainingSeconds = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

export default function VoiceDemo({
  assistantId,
  previewAccessToken = '',
  previewFirstMessage = '',
  previewMaxDurationSeconds = DEFAULT_PREVIEW_DURATION_SECONDS,
  previewAssistantName = '',
  onClose
}) {
  const { t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(previewMaxDurationSeconds || DEFAULT_PREVIEW_DURATION_SECONDS);

  const conversationRef = useRef(null);
  const previewConversationRegisteredRef = useRef(false);
  const previewConversationIdRef = useRef('');
  const pendingEndReasonRef = useRef('');
  const isDark = resolvedTheme === 'dark';
  const isPreviewMode = Boolean(previewAccessToken);
  const effectivePreviewDurationSeconds = previewMaxDurationSeconds || DEFAULT_PREVIEW_DURATION_SECONDS;

  useEffect(() => {
    if (!isPreviewMode) return;
    setRemainingSeconds(effectivePreviewDurationSeconds);
  }, [effectivePreviewDurationSeconds, isPreviewMode]);

  const stopMediaResources = useCallback(() => {
    // ElevenLabs SDK manages its own audio resources for signed-url websocket
    // preview sessions. We keep this hook for symmetry and future cleanup needs.
  }, []);

  // Explicit lifecycle end ONLY (user clicked Bitir, 10-min timeout, modal closed).
  // Never call from onDisconnect / pagehide / unmount — those would close the
  // preview session prematurely on transient disconnects and burn the token.
  const reportPreviewSessionEnd = useCallback(async (reason) => {
    if (!isPreviewMode || !previewAccessToken || !BACKEND_URL) return;
    try {
      await fetch(`${BACKEND_URL}/api/leads/preview/session/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewAccessToken,
          reason: reason || 'user_ended'
        })
      });
    } catch (error) {
      console.error('Failed to report preview session end:', error);
    }
  }, [isPreviewMode, previewAccessToken]);

  const registerPreviewConversation = useCallback(async (conversationId) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!isPreviewMode || !previewAccessToken || !normalizedConversationId || previewConversationRegisteredRef.current || !BACKEND_URL) {
      return;
    }

    previewConversationRegisteredRef.current = true;
    previewConversationIdRef.current = normalizedConversationId;

    try {
      const response = await fetch(`${BACKEND_URL}/api/leads/preview/session/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          previewAccessToken,
          conversationId: normalizedConversationId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Demo oturumu doğrulanamadı.');
      }
    } catch (error) {
      console.error('Failed to register preview conversation:', error);
    }
  }, [isPreviewMode, previewAccessToken]);

  const endCall = useCallback(async ({ reason = 'user_ended', finalStatus = '' } = {}) => {
    pendingEndReasonRef.current = reason;

    if (conversationRef.current) {
      try {
        await conversationRef.current.endSession();
      } catch (error) {
        console.error('Error ending session:', error);
      }
      conversationRef.current = null;
    }

    stopMediaResources();

    if (isPreviewMode) {
      await reportPreviewSessionEnd(reason);
    }

    setIsCallActive(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setCallStartedAt(null);
    setCallStatus(finalStatus || t('onboarding.voiceDemo.callStatus.ended'));
  }, [isPreviewMode, stopMediaResources, t]);

  useEffect(() => {
    if (!isPreviewMode || !callStartedAt || !isCallActive) {
      return undefined;
    }

    const updateCountdown = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
      const nextRemaining = Math.max(0, effectivePreviewDurationSeconds - elapsedSeconds);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining === 0) {
        pendingEndReasonRef.current = 'timeout';
        endCall({
          reason: 'timeout',
          finalStatus: '10 dakikalık demo süresi doldu. Görüşme kapatıldı.'
        });
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [callStartedAt, effectivePreviewDurationSeconds, endCall, isCallActive, isPreviewMode]);

  const startCall = async () => {
    try {
      console.log('🎯 Starting 11Labs call with assistantId:', assistantId);
      setIsConnecting(true);
      setCallStatus(t('onboarding.voiceDemo.callStatus.starting'));
      previewConversationRegisteredRef.current = false;
      previewConversationIdRef.current = '';
      pendingEndReasonRef.current = '';

      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());

      const previewHeaders = isPreviewMode
        ? { 'x-lead-preview-access': previewAccessToken }
        : undefined;

      if (isPreviewMode) {
        const signedUrlEndpoint = `${BACKEND_URL}/api/elevenlabs/signed-url/${assistantId}?preview=1`;
        console.log('🔗 Fetching signed URL from:', signedUrlEndpoint);
        const signedUrlResponse = await fetch(signedUrlEndpoint, {
          headers: previewHeaders,
        });

        if (!signedUrlResponse.ok) {
          const errorData = await signedUrlResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Signed URL request failed (${signedUrlResponse.status})`);
        }

        const { signedUrl } = await signedUrlResponse.json();
        if (!signedUrl) {
          throw new Error('Signed URL is empty');
        }

        const nextCallStartedAt = Date.now();
        const conversation = await Conversation.startSession({
          signedUrl,
          connectionType: 'websocket',
          workletPaths: getElevenLabsWorkletPaths(),
          overrides: previewFirstMessage
            ? {
                agent: {
                  firstMessage: previewFirstMessage,
                },
              }
            : undefined,
          onConnect: async () => {
            setIsCallActive(true);
            setIsConnecting(false);
            setCallStartedAt(nextCallStartedAt);
            setRemainingSeconds(effectivePreviewDurationSeconds);
            setCallStatus(t('onboarding.voiceDemo.callStatus.started'));
          },
          onDisconnect: async () => {
            setIsCallActive(false);
            setIsSpeaking(false);
            setIsConnecting(false);
            setCallStartedAt(null);

            setCallStatus(
              pendingEndReasonRef.current === 'timeout'
                ? '10 dakikalık demo süresi doldu. Görüşme kapatıldı.'
                : t('onboarding.voiceDemo.callStatus.ended')
            );
          },
          onError: async (error) => {
            console.error('11Labs preview websocket error:', error);
            setCallStatus('Bağlantı hatası: ' + describeError(error, 'Bağlantı kurulamadı'));
            setIsCallActive(false);
            setIsConnecting(false);
            setCallStartedAt(null);
          },
          onModeChange: (mode) => {
            if (mode.mode === 'speaking') {
              setIsSpeaking(true);
              setCallStatus(t('onboarding.voiceDemo.callStatus.speaking'));
            } else {
              setIsSpeaking(false);
              setCallStatus(t('onboarding.voiceDemo.callStatus.listening'));
            }
          },
          onMessage: (message) => {
            console.log('📝 Preview message:', message);
          }
        });

        conversationRef.current = conversation;

        const previewConversationId = conversation?.getId?.();
        if (previewConversationId && !previewConversationRegisteredRef.current) {
          previewConversationIdRef.current = previewConversationId;
          registerPreviewConversation(previewConversationId).catch((error) => {
            console.error('Preview conversation registration failed:', error);
          });
        }

        console.log('✅ Preview websocket conversation started through SDK');
        return;
      }

      const tokenUrl = `${BACKEND_URL}/api/elevenlabs/conversation-token/${assistantId}${isPreviewMode ? '?preview=1' : ''}`;
      console.log('🎟️ Fetching conversation token from:', tokenUrl);
      const tokenResponse = await fetch(tokenUrl, {
        headers: previewHeaders,
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Conversation token request failed (${tokenResponse.status})`);
      }

      const { conversationToken } = await tokenResponse.json();
      if (!conversationToken) {
        throw new Error('Conversation token is empty');
      }

      const sessionConfig = {
        conversationToken,
        connectionType: 'webrtc'
      };
      console.log('✅ Got conversation token for preview WebRTC session');

      const nextCallStartedAt = Date.now();

      const conversation = await Conversation.startSession({
        ...sessionConfig,
        workletPaths: getElevenLabsWorkletPaths(),
        overrides: isPreviewMode && previewFirstMessage
          ? {
              agent: {
                firstMessage: previewFirstMessage,
              },
            }
          : undefined,
        onConnect: async () => {
          setIsCallActive(true);
          setIsConnecting(false);
          setCallStartedAt(nextCallStartedAt);
          setRemainingSeconds(effectivePreviewDurationSeconds);
          setCallStatus(t('onboarding.voiceDemo.callStatus.started'));
        },
        onDisconnect: async () => {
          setIsCallActive(false);
          setIsSpeaking(false);
          setIsConnecting(false);
          setCallStartedAt(null);

            setCallStatus(
              pendingEndReasonRef.current === 'timeout'
                ? '10 dakikalık demo süresi doldu. Görüşme kapatıldı.'
              : t('onboarding.voiceDemo.callStatus.ended')
          );
        },
        onError: async (error) => {
          console.error('11Labs error:', error);
          setCallStatus('Bağlantı hatası: ' + describeError(error, 'Bağlantı kurulamadı'));
          setIsCallActive(false);
          setIsConnecting(false);
          setCallStartedAt(null);
        },
        onModeChange: (mode) => {
          if (mode.mode === 'speaking') {
            setIsSpeaking(true);
            setCallStatus(t('onboarding.voiceDemo.callStatus.speaking'));
          } else {
            setIsSpeaking(false);
            setCallStatus(t('onboarding.voiceDemo.callStatus.listening'));
          }
        },
        onMessage: (message) => {
          console.log('📝 Message:', message);
        }
      });

      conversationRef.current = conversation;

      if (isPreviewMode) {
        const immediateConversationId = conversation?.getId?.();
        if (immediateConversationId) {
          previewConversationIdRef.current = immediateConversationId;
          registerPreviewConversation(immediateConversationId).catch((error) => {
            console.error('Preview conversation early registration failed:', error);
          });
        }
      }

      console.log('✅ Conversation started');

    } catch (error) {
      console.error('Start call error:', error);
      setCallStatus('Bağlantı başlatılamadı: ' + describeError(error, 'Bağlantı kurulamadı'));
      setIsCallActive(false);
      setIsConnecting(false);
      setCallStartedAt(null);
      stopMediaResources();
    }
  };

  const handleClose = () => {
    if (isCallActive) {
      endCall();
    }
    if (onClose) {
      onClose();
    }
  };

  const isErrorStatus = callStatus.toLowerCase().includes('hata') || callStatus.toLowerCase().includes('başlatılamadı');
  const startDisabled = !assistantId || isConnecting;
  const startLabel = isConnecting
    ? 'Bağlanıyor...'
    : t('onboarding.voiceDemo.startVoiceTest');

  return (
    <div
      className={`relative rounded-[24px] px-5 py-6 text-center shadow-sm sm:px-7 ${
        isDark
          ? 'border border-[#21426f] bg-[#091529]'
          : 'border border-[#d7e2f0] bg-white'
      }`}
    >
      {onClose && (
        <button
          onClick={handleClose}
          className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            isDark
              ? 'border border-[#21426f] bg-[#0d1c36] text-[#c6d6ee] hover:text-white'
              : 'border border-[#d7e2f0] bg-white text-[#52637d] hover:border-[#051752]/20 hover:text-[#051752]'
          }`}
          aria-label="Kapat"
        >
          ×
        </button>
      )}

      <h3 className={`text-2xl font-semibold tracking-[-0.02em] ${isDark ? 'text-white' : 'text-[#051752]'}`}>
        AI sesi test edin
      </h3>
      <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${isDark ? 'text-[#c6d6ee]' : 'text-[#52637d]'}`}>
        {assistantId
          ? t('onboarding.voiceDemo.description')
          : t('onboarding.voiceDemo.createAssistantFirst')}
      </p>

      {isPreviewMode && isCallActive && remainingSeconds <= 60 && (
        <div
          className={`mt-5 flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs sm:text-sm ${
            isDark
              ? 'border-[#21426f] bg-[#0d1c36] text-[#c6d6ee]'
              : 'border-[#d7e2f0] bg-[#f7f9fc] text-[#52637d]'
          }`}
        >
          <span>Son 1 dakikadasınız. Görüşme süre dolunca otomatik kapanacak.</span>
          <span className={`ml-4 rounded-full px-3 py-1 font-semibold ${isDark ? 'bg-[#091529] text-white' : 'bg-white text-[#051752]'}`}>
            {formatRemainingSeconds(remainingSeconds)}
          </span>
        </div>
      )}

      {callStatus && (
        <div
          aria-live="polite"
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
            isErrorStatus
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300'
              : isCallActive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                : isDark
                  ? 'border-[#21426f] bg-[#0d1c36] text-[#c6d6ee]'
                  : 'border-[#d7e2f0] bg-[#f7f9fc] text-[#52637d]'
          }`}
        >
          {callStatus}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        {!isCallActive ? (
          <button
            onClick={startCall}
            disabled={startDisabled}
            className={`inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${
              !startDisabled
                ? 'bg-[#051752] text-white hover:bg-[#0a245f] dark:bg-[#051752] dark:text-white dark:hover:bg-[#10307c]'
                : 'cursor-not-allowed bg-[#d7e2f0] text-[#7b8da8] dark:bg-white/10 dark:text-[#7d8da5]'
            }`}
          >
            {startLabel}
          </button>
        ) : (
          <button
            onClick={() => endCall()}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
          >
            {t('onboarding.voiceDemo.endCall')}
          </button>
        )}
      </div>

      <p className={`mt-4 text-xs leading-6 ${isDark ? 'text-[#9bb2d3]' : 'text-[#71829c]'}`}>
        {t('onboarding.voiceDemo.allowMicrophone')}
      </p>
    </div>
  );
}
