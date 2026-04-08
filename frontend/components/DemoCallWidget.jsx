'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, Loader2, CheckCircle, Star, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient as api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export default function DemoCallWidget({ variant = 'full' }) {
  const { t, locale } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [callState, setCallState] = useState('idle');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [callId, setCallId] = useState(null);
  const [assistantId, setAssistantId] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  const conversationRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      endCall();
    };
  }, []);

  const startWebCall = async () => {
    setIsLoading(true);
    setCallState('connecting');

    try {
      const response = await api.demo.requestCall({
        language: locale.toUpperCase(),
        name: 'Demo User'
      });

      const { assistantId: newAssistantId, callId: newCallId } = response.data;

      if (newAssistantId) {
        setAssistantId(newAssistantId);
        setCallId(newCallId);

        // Get signed URL from backend for 11Labs
        const signedUrlResponse = await fetch(`${BACKEND_URL}/api/elevenlabs/signed-url/${newAssistantId}`);

        if (!signedUrlResponse.ok) {
          throw new Error('Failed to get signed URL');
        }

        const { signedUrl } = await signedUrlResponse.json();
        console.log('✅ Got signed URL for 11Labs conversation');

        // Initialize audio context
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

        // Connect to 11Labs WebSocket
        const ws = new WebSocket(signedUrl);
        conversationRef.current = ws;

        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          setCallState('active');
          setIsLoading(false);
          toast.success(t('callStarted'));

          // Start sending audio from microphone
          startMicrophoneCapture(ws);
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'audio') {
              await playAudio(data.audio);
            } else if (data.type === 'end') {
              console.log('🔴 Conversation ended by server');
              setCallState('ended');
              setShowFeedback(true);
            }
          } catch (error) {
            console.error('Error processing message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          toast.error(t('callError'));
          setCallState('idle');
          setIsLoading(false);
        };

        ws.onclose = () => {
          console.log('🔴 WebSocket closed');
          if (callState === 'active') {
            setCallState('ended');
            setShowFeedback(true);
          }
        };
      } else {
        // Phone call mode (if no web assistant available)
        setCallId(newCallId);
        setCallState('active');
        setIsLoading(false);
        toast.success(t('phoneWillRing'));
      }
    } catch (error) {
      console.error('Demo call error:', error);
      toast.error(t('demoCallFailed'));
      setCallState('idle');
      setIsLoading(false);
    }
  };

  const startMicrophoneCapture = async (ws) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            ws.send(JSON.stringify({
              type: 'audio',
              audio: base64
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start(100); // Send audio chunks every 100ms
    } catch (error) {
      console.error('Microphone error:', error);
      toast.error('Microphone access denied');
    }
  };

  const playAudio = async (base64Audio) => {
    try {
      if (!audioContextRef.current) return;

      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const endCall = () => {
    // Stop media recorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close WebSocket
    if (conversationRef.current) {
      if (conversationRef.current.readyState === WebSocket.OPEN) {
        conversationRef.current.close();
      }
      conversationRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (callState === 'active') {
      setCallState('ended');
      setShowFeedback(true);
    }
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // Toggle: if muted, enable; if not muted, disable
        setIsMuted(!isMuted);
      }
    }
  };

  const handleFeedback = async (rating) => {
    setFeedbackRating(rating);
    try {
      await api.demo.submitFeedback({ callId: callId || assistantId, rating, wouldRecommend: rating >= 4 });
      toast.success(t('thankYouFeedback'));
      setShowFeedback(false);
      resetWidget();
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };

  const resetWidget = () => {
    setCallState('idle');
    setCallId(null);
    setAssistantId(null);
    setIsMuted(false);
  };

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20 dark:border-primary-800/60">
        <div className="h-10 w-10 rounded-full bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center">
          <Phone className="h-5 w-5 text-primary-700 dark:text-primary-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{t('demoCallTitle')}</p>
          <p className="text-xs text-muted-foreground truncate">{t('demoCallDesc')}</p>
        </div>
        <Button size="sm" onClick={startWebCall} disabled={isLoading}>
          {t('tryDemo')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground border-0">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />

        <CardContent className="relative pt-8 pb-8">
          {callState === 'active' ? (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-white/20 mx-auto animate-pulse">
                <Phone className="h-10 w-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  {t('callInProgress')}
                </h3>
                <p className="text-primary-foreground/80">
                  {t('talkingWithDemo')}
                </p>
              </div>
              <div className="flex justify-center gap-4">
                <Button variant="secondary" size="lg" onClick={toggleMute} className="h-14 w-14 rounded-full">
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <Button variant="destructive" size="lg" onClick={endCall} className="h-14 w-14 rounded-full">
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </div>
            </div>
          ) : callState === 'ended' ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-white/20 mx-auto">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  {t('callCompleted')}
                </h3>
                <p className="text-primary-foreground/80">
                  {t('thanksForDemo')}
                </p>
              </div>
              <Button variant="secondary" onClick={resetWidget} className="mt-4">
                {t('tryAgain')}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-white/20 mb-4">
                  <Phone className="h-8 w-8" />
                </div>
                <h2 className="text-3xl font-bold mb-2">{t('demoCallTitle')}</h2>
                <p className="text-xl font-medium text-primary-foreground/90">
                  {t('tryNow')}
                </p>
                <p className="text-primary-foreground/70 mt-2">{t('demoCallDesc')}</p>
              </div>
              <Button
                size="lg"
                className="w-full h-14 text-lg bg-white text-primary hover:bg-white/90 gap-2"
                onClick={startWebCall}
                disabled={isLoading || callState === 'connecting'}
              >
                {isLoading || callState === 'connecting' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t('connecting')}
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    {t('talkNow')}
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-primary-foreground/60">{t('demoDisclaimer')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">{t('howWasDemo')}</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-center text-muted-foreground mb-4">{t('rateExperience')}</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => handleFeedback(star)} className="p-2 hover:scale-110 transition-transform">
                  <Star className={`h-8 w-8 ${star <= feedbackRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
