'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Conversation } from '@elevenlabs/client';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export default function VoiceDemo({ assistantId, onClose }) {
  const { t } = useLanguage();
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const conversationRef = useRef(null);

  const endCall = useCallback(async () => {
    if (conversationRef.current) {
      try {
        await conversationRef.current.endSession();
      } catch (error) {
        console.error('Error ending session:', error);
      }
      conversationRef.current = null;
    }
    setIsCallActive(false);
    setIsSpeaking(false);
    setCallStatus(t('onboarding.voiceDemo.callStatus.ended'));
  }, [t]);

  useEffect(() => {
    return () => {
      if (conversationRef.current) {
        endCall();
      }
    };
  }, [endCall]);

  const startCall = async () => {
    try {
      console.log('🎯 Starting 11Labs call with assistantId:', assistantId);
      setIsConnecting(true);
      setCallStatus(t('onboarding.voiceDemo.callStatus.starting'));

      let sessionConfig = null;

      try {
        const tokenUrl = `${BACKEND_URL}/api/elevenlabs/conversation-token/${assistantId}`;
        console.log('🎟️ Fetching conversation token from:', tokenUrl);
        const tokenResponse = await fetch(tokenUrl);

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get conversation token');
        }

        const { conversationToken } = await tokenResponse.json();
        if (!conversationToken) {
          throw new Error('Conversation token is empty');
        }

        sessionConfig = {
          conversationToken,
          connectionType: 'webrtc'
        };
        console.log('✅ Got conversation token for WebRTC session');
      } catch (tokenError) {
        console.warn('⚠️ WebRTC token flow failed, falling back to signed URL:', tokenError.message);

        const signedUrlEndpoint = `${BACKEND_URL}/api/elevenlabs/signed-url/${assistantId}`;
        console.log('🔗 Fetching signed URL from:', signedUrlEndpoint);
        const response = await fetch(signedUrlEndpoint);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ Signed URL error:', response.status, errorData);
          throw new Error(errorData.error || 'Failed to get signed URL');
        }

        const { signedUrl } = await response.json();
        if (!signedUrl) {
          throw new Error('Signed URL is empty');
        }

        sessionConfig = { signedUrl };
        console.log('✅ Got signed URL for fallback session');
      }

      // Start conversation using official SDK
      const conversation = await Conversation.startSession({
        ...sessionConfig,
        onConnect: () => {
          console.log('✅ Connected to 11Labs');
          setIsCallActive(true);
          setIsConnecting(false);
          setCallStatus(t('onboarding.voiceDemo.callStatus.started'));
        },
        onDisconnect: () => {
          console.log('🔴 Disconnected from 11Labs');
          setIsCallActive(false);
          setIsSpeaking(false);
          setCallStatus(t('onboarding.voiceDemo.callStatus.ended'));
        },
        onError: (error) => {
          console.error('11Labs error:', error);
          setCallStatus('Error: ' + (error.message || 'Connection failed'));
          setIsCallActive(false);
          setIsConnecting(false);
        },
        onModeChange: (mode) => {
          console.log('📢 Mode changed:', mode.mode);
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
      console.log('✅ Conversation started');

    } catch (error) {
      console.error('Start call error:', error);
      setCallStatus('Failed to start call: ' + error.message);
      setIsCallActive(false);
      setIsConnecting(false);
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

  console.log('VoiceDemo rendered with assistantId:', assistantId);

  return (
    <div style={{
      padding: '30px',
      background: '#f0f4ff',
      borderRadius: '10px',
      border: '2px solid #4f46e5',
      textAlign: 'center',
      position: 'relative'
    }}>
      {/* Close Button */}
      {onClose && (
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          x
        </button>
      )}

      <h3 style={{ marginBottom: '15px' }}>🎤 {t('onboarding.voiceDemo.title')}</h3>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
        {assistantId
          ? t('onboarding.voiceDemo.description')
          : t('onboarding.voiceDemo.createAssistantFirst')}
      </p>

      {callStatus && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          background: isCallActive ? '#d4edda' : '#fff3cd',
          borderRadius: '5px',
          fontSize: '14px'
        }}>
          {callStatus}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {!isCallActive ? (
          <button
            onClick={startCall}
            disabled={!assistantId || isConnecting}
            style={{
              padding: '15px 30px',
              background: assistantId && !isConnecting ? '#4f46e5' : '#e5e7eb',
              color: assistantId && !isConnecting ? 'white' : '#999',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: assistantId && !isConnecting ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            {isConnecting ? 'Bağlanıyor...' : t('onboarding.voiceDemo.startVoiceTest')}
          </button>
        ) : (
          <button
            onClick={endCall}
            style={{
              padding: '15px 30px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            🔴 {t('onboarding.voiceDemo.endCall')}
          </button>
        )}
      </div>

      <p style={{ fontSize: '12px', color: '#999', marginTop: '15px' }}>
        {t('onboarding.voiceDemo.allowMicrophone')}
      </p>
    </div>
  );
}
