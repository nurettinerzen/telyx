import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { loadMetaFacebookSdk } from '@/lib/meta-facebook-sdk';

const FINISH_EVENTS = new Set([
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

const CANCEL_EVENTS = new Set([
  'CANCEL',
  'CANCELLED',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMetaMessageOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();

    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

function isSameOriginMessage(origin) {
  if (typeof window === 'undefined' || !origin || typeof origin !== 'string') {
    return false;
  }

  return origin === window.location.origin;
}

function normalizeEmbeddedSignupPayload(payload = {}) {
  const rawPayload = isPlainObject(payload) ? payload : {};
  const rawData = isPlainObject(rawPayload.data) ? rawPayload.data : rawPayload;

  return {
    type: rawPayload.type || null,
    event: rawPayload.event || null,
    version: rawPayload.version || null,
    wabaId: rawData.waba_id || rawData.wabaId || null,
    phoneNumberId: rawData.phone_number_id || rawData.phoneNumberId || null,
    metaBusinessId: rawData.business_id || rawData.businessId || rawData.meta_business_id || rawData.metaBusinessId || null,
    displayPhoneNumber: rawData.display_phone_number || rawData.displayPhoneNumber || rawData.phone_number || rawData.phoneNumber || null,
    currentStep: rawData.current_step || rawData.currentStep || null,
    rawPayload,
  };
}

function extractAuthorizationCodeFromMessage(messageData) {
  if (typeof messageData !== 'string') {
    return null;
  }

  const trimmedValue = messageData.trim();
  if (!trimmedValue || !trimmedValue.includes('code=')) {
    return null;
  }

  const normalizedValue = trimmedValue.startsWith('?')
    ? trimmedValue.slice(1)
    : trimmedValue;
  const params = new URLSearchParams(normalizedValue);
  let code = params.get('code');

  if (!code) {
    const nestedData = params.get('data');
    if (nestedData) {
      const nestedParams = new URLSearchParams(nestedData);
      code = nestedParams.get('code');
    }
  }

  return code || null;
}

async function cancelEmbeddedSignupSession({ sessionId, reason, currentStep, eventPayload }) {
  if (!sessionId) {
    return;
  }

  try {
    await apiClient.post('/api/integrations/whatsapp/embedded-signup/cancel', {
      sessionId,
      reason,
      currentStep,
      eventPayload,
    });
  } catch (error) {
    // Session cancellation is best-effort. The backend also has TTL cleanup semantics.
  }
}

export function useWhatsAppEmbeddedSignup({
  onCancel,
  onError,
  onSuccess,
} = {}) {
  const queryClient = useQueryClient();
  const [flowState, setFlowState] = useState('idle');
  const [flowError, setFlowError] = useState(null);

  const listenerRef = useRef(null);
  const sessionRef = useRef(null);
  const codeRef = useRef(null);
  const eventPayloadRef = useRef(null);
  const completionStartedRef = useRef(false);
  const settledRef = useRef(false);

  const cleanupListener = useCallback(() => {
    if (listenerRef.current && typeof window !== 'undefined') {
      window.removeEventListener('message', listenerRef.current);
      listenerRef.current = null;
    }
  }, []);

  const resetFlow = useCallback(() => {
    cleanupListener();
    sessionRef.current = null;
    codeRef.current = null;
    eventPayloadRef.current = null;
    completionStartedRef.current = false;
    settledRef.current = false;
    setFlowError(null);
    setFlowState('idle');
  }, [cleanupListener]);

  const finalizeError = useCallback((error) => {
    settledRef.current = true;
    cleanupListener();
    setFlowError(error);
    setFlowState('error');
    onError?.(error);
  }, [cleanupListener, onError]);

  const finalizeCancel = useCallback(async (payload, reason = 'USER_CANCELLED') => {
    if (settledRef.current) {
      return;
    }

    settledRef.current = true;
    cleanupListener();
    setFlowError(null);
    setFlowState('cancelled');

    await cancelEmbeddedSignupSession({
      sessionId: sessionRef.current?.sessionId,
      reason,
      currentStep: payload?.currentStep || null,
      eventPayload: payload?.rawPayload || null,
    });

    onCancel?.(payload || null);
  }, [cleanupListener, onCancel]);

  const completeIfReady = useCallback(async () => {
    if (completionStartedRef.current || !sessionRef.current?.sessionId || !codeRef.current || !eventPayloadRef.current) {
      return;
    }

    completionStartedRef.current = true;
    setFlowError(null);
    setFlowState('completing');

    try {
      const response = await apiClient.post('/api/integrations/whatsapp/embedded-signup/complete', {
        sessionId: sessionRef.current.sessionId,
        code: codeRef.current,
        eventPayload: eventPayloadRef.current.rawPayload,
      });

      settledRef.current = true;
      cleanupListener();
      setFlowState('success');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['integrations'] }),
        queryClient.invalidateQueries({ queryKey: ['integrations', 'whatsapp', 'status'] }),
      ]);

      onSuccess?.(response.data?.connection || null);
    } catch (error) {
      completionStartedRef.current = false;
      finalizeError(error);
    }
  }, [cleanupListener, finalizeError, onSuccess, queryClient]);

  const startEmbeddedSignup = useCallback(async () => {
    if (flowState === 'preparing' || flowState === 'loading_sdk' || flowState === 'launching' || flowState === 'awaiting_completion' || flowState === 'completing') {
      return;
    }

    cleanupListener();
    sessionRef.current = null;
    codeRef.current = null;
    eventPayloadRef.current = null;
    completionStartedRef.current = false;
    settledRef.current = false;
    setFlowError(null);
    setFlowState('preparing');

    try {
      const redirectUri = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/meta/whatsapp-callback`
        : null;
      const sessionResponse = await apiClient.post('/api/integrations/whatsapp/embedded-signup/session', {
        redirectUri,
      });
      const sessionData = sessionResponse.data || {};

      sessionRef.current = sessionData;
      setFlowState('loading_sdk');

      const FB = await loadMetaFacebookSdk({
        appId: sessionData.appId,
        graphApiVersion: sessionData.graphApiVersion,
      });

      listenerRef.current = async (event) => {
        if (isSameOriginMessage(event.origin) && isPlainObject(event.data)) {
          if (event.data.type === 'TELYX_META_WHATSAPP_CODE' && event.data.code) {
            codeRef.current = event.data.code;
            setFlowState(eventPayloadRef.current ? 'completing' : 'awaiting_completion');
            await completeIfReady();
            return;
          }

          if (event.data.type === 'TELYX_META_WHATSAPP_ERROR') {
            const error = new Error(event.data.errorMessage || 'Meta WhatsApp onboarding did not return an authorization code.');
            finalizeError(error);
            return;
          }
        }

        if (!isMetaMessageOrigin(event.origin)) {
          return;
        }

        let parsedPayload = event.data;
        if (typeof parsedPayload === 'string') {
          try {
            parsedPayload = JSON.parse(parsedPayload);
          } catch {
            const authorizationCode = extractAuthorizationCodeFromMessage(parsedPayload);

            if (authorizationCode) {
              codeRef.current = authorizationCode;
              setFlowState(eventPayloadRef.current ? 'completing' : 'awaiting_completion');
              await completeIfReady();
            }

            return;
          }
        }

        if (!isPlainObject(parsedPayload) || parsedPayload.type !== 'WA_EMBEDDED_SIGNUP') {
          return;
        }

        const normalizedPayload = normalizeEmbeddedSignupPayload(parsedPayload);
        const normalizedEventName = String(normalizedPayload.event || '').toUpperCase();

        if (FINISH_EVENTS.has(normalizedEventName)) {
          eventPayloadRef.current = normalizedPayload;
          setFlowState(codeRef.current ? 'completing' : 'awaiting_completion');
          await completeIfReady();
          return;
        }

        if (CANCEL_EVENTS.has(normalizedEventName)) {
          await finalizeCancel(normalizedPayload, normalizedEventName || 'USER_CANCELLED');
          return;
        }

        const error = new Error('Meta WhatsApp onboarding returned an unexpected event.');
        error.metaEvent = normalizedPayload;
        finalizeError(error);
      };

      window.addEventListener('message', listenerRef.current);

      setFlowState('launching');
      FB.login((response) => {
        const code = response?.authResponse?.code;

        if (code) {
          codeRef.current = code;
          setFlowState(eventPayloadRef.current ? 'completing' : 'awaiting_completion');
          completeIfReady();
          return;
        }

        if (response?.authResponse?.accessToken && !response?.authResponse?.code) {
          const error = new Error('Meta returned an access token instead of an authorization code. Verify the Embedded Signup configuration.');
          finalizeError(error);
          return;
        }

        // Meta may invoke the callback before the hosted flow is actually completed.
        // We only treat explicit WA_EMBEDDED_SIGNUP CANCEL events as a user cancellation.
        setFlowState((currentState) => (
          currentState === 'launching' ? 'awaiting_completion' : currentState
        ));
      }, {
        config_id: sessionData.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: '3',
          version: 'v3',
          setup: {},
        },
        redirect_uri: sessionData.redirectUri || undefined,
        scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
      });
    } catch (error) {
      finalizeError(error);
    }
  }, [cleanupListener, completeIfReady, finalizeCancel, finalizeError, flowState]);

  useEffect(() => {
    return () => {
      cleanupListener();
    };
  }, [cleanupListener]);

  return {
    flowState,
    flowError,
    isBusy: ['preparing', 'loading_sdk', 'launching', 'awaiting_completion', 'completing'].includes(flowState),
    startEmbeddedSignup,
    resetFlow,
  };
}

export default useWhatsAppEmbeddedSignup;
