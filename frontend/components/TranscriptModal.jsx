/**
 * TranscriptModal Component
 * Enhanced modal for displaying call transcript with audio player, search, and analysis
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Phone,
  Clock,
  Calendar,
  Download,
  Search,
  Play,
  Pause,
  Volume2,
  FileText,
  Lightbulb,
  CheckCircle,
  PhoneOff,
} from 'lucide-react';
import { formatDate, formatDuration } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

const BRACKETED_SPEECH_DIRECTION_REGEX = /\[(?:[a-z]+(?:[\s-][a-z]+)*)\]/gi;
const MULTI_SPACE_REGEX = /\s{2,}/g;
const SPACE_BEFORE_PUNCTUATION_REGEX = /\s+([,.;!?])/g;

function cleanTranscriptText(text) {
  if (text === null || text === undefined) return '';

  return String(text)
    .replace(BRACKETED_SPEECH_DIRECTION_REGEX, ' ')
    .replace(SPACE_BEFORE_PUNCTUATION_REGEX, '$1')
    .replace(MULTI_SPACE_REGEX, ' ')
    .trim();
}

function coerceFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue;
}

function getTranscriptTimeInCallSeconds(message = {}) {
  const explicitSeconds = coerceFiniteNumber(
    message.timeInCallSecs ?? message.time_in_call_secs ?? null
  );

  if (explicitSeconds !== null && explicitSeconds >= 0) {
    return Math.floor(explicitSeconds);
  }

  const numericTimestamp = coerceFiniteNumber(message.timestamp);
  if (numericTimestamp !== null && numericTimestamp >= 0 && numericTimestamp < 24 * 60 * 60) {
    return Math.floor(numericTimestamp);
  }

  return null;
}

function normalizeTranscriptMessage(message = {}) {
  const speaker = message.speaker || (message.role === 'agent' ? 'assistant' : 'user');
  const normalizedSpeaker = speaker === 'assistant' || speaker === 'agent' ? 'assistant' : 'user';
  const normalizedText = cleanTranscriptText(message.text || message.message || message.content || '');
  const timeInCallSecs = getTranscriptTimeInCallSeconds(message);

  const normalizedMessage = {
    ...message,
    speaker: normalizedSpeaker,
    text: normalizedText,
  };

  if (timeInCallSecs !== null) {
    normalizedMessage.timeInCallSecs = timeInCallSecs;
    normalizedMessage.time_in_call_secs = timeInCallSecs;
  }

  const absoluteTimestamp = timeInCallSecs === null && message.timestamp
    ? new Date(message.timestamp)
    : null;

  if (absoluteTimestamp && !Number.isNaN(absoluteTimestamp.getTime())) {
    normalizedMessage.timestamp = absoluteTimestamp.toISOString();
  } else if (timeInCallSecs !== null) {
    delete normalizedMessage.timestamp;
  }

  return normalizedMessage;
}

function normalizeCallDetail(callData) {
  if (!callData) return callData;

  const normalizedTranscript = Array.isArray(callData.transcript)
    ? callData.transcript.map(normalizeTranscriptMessage).filter((message) => message.text)
    : callData.transcript;
  const normalizedTranscriptText = typeof callData.transcriptText === 'string'
    ? cleanTranscriptText(callData.transcriptText)
    : callData.transcriptText;

  return {
    ...callData,
    transcript: Array.isArray(normalizedTranscript) && normalizedTranscript.length === 0
      ? null
      : normalizedTranscript,
    transcriptText: normalizedTranscriptText,
  };
}

function formatTranscriptTime(message, locale) {
  const timeInCallSecs = getTranscriptTimeInCallSeconds(message);

  if (timeInCallSecs !== null) {
    const minutes = Math.floor(timeInCallSecs / 60);
    const seconds = Math.floor(timeInCallSecs % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  if (message?.timestamp) {
    const date = new Date(message.timestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-US');
    }
  }

  return '';
}

export default function TranscriptModal({ callId, isOpen, onClose }) {
  const { locale } = useLanguage();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const loadCallDetails = async () => {
      setLoading(true);
      try {
        const response = await apiClient.calls.getById(callId);
        const normalizedCall = normalizeCallDetail(response.data);
        setCall(normalizedCall);
        // Set duration from DB immediately
        if (normalizedCall?.duration && normalizedCall.duration > 0) {
          setDuration(normalizedCall.duration);
        }
      } catch (error) {
        toast.error('Failed to load call details');
        console.error('Load call details error:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && callId) {
      loadCallDetails();
    }
    // Reset audio state when modal closes
    if (!isOpen) {
      setCurrentTime(0);
      setIsPlaying(false);
      setAudioError(false);
    }
  }, [isOpen, callId]);

  // Set duration from call data when loaded
  useEffect(() => {
    if (call?.duration && call.duration > 0) {
      setDuration(call.duration);
    }
  }, [call]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      // Only update if audio duration is valid and better than DB duration
      if (audioDuration && isFinite(audioDuration) && audioDuration > 0) {
        setDuration(audioDuration);
      }
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleDownloadRecording = () => {
    if (call?.id) {
      const audioUrl = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/call-logs/${call.id}/audio`;
      window.open(audioUrl, '_blank');
      toast.success('Kayıt indiriliyor...');
    }
  };

  const handleDownloadTranscript = () => {
    if (!call) return;

    let transcriptText = '';

    if (call.transcript && Array.isArray(call.transcript)) {
      // Format structured transcript
      transcriptText = `Arama Transkripti - ${formatDate(call.createdAt, 'long', locale)}\n`;
      transcriptText += `Telefon: ${call.phoneNumber || call.callerId || 'Bilinmiyor'}\n`;
      transcriptText += `Süre: ${formatDuration(call.duration)}\n`;
      transcriptText += `\n${'='.repeat(60)}\n\n`;

      call.transcript.forEach((msg) => {
        // Handle both formats: speaker/role and text/message
        const speaker = msg.speaker || (msg.role === 'agent' ? 'assistant' : 'user');
        const isAssistant = speaker === 'assistant' || speaker === 'agent';
        const speakerName = isAssistant ? 'Asistan' : 'Müşteri';
        const messageText = cleanTranscriptText(msg.text || msg.message || '');
        const timeStr = formatTranscriptTime(msg, locale);
        const header = timeStr ? `[${timeStr}] ${speakerName}` : speakerName;

        transcriptText += `${header}:\n${messageText}\n\n`;
      });
    } else if (call.transcriptText) {
      transcriptText = call.transcriptText;
    } else {
      toast.error('Transkript bulunamadı');
      return;
    }

    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcript-${call.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transcript downloaded');
  };

  const highlightText = (text) => {
    if (!searchQuery.trim()) return text;

    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-neutral-900">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const filteredMessages = call?.transcript?.filter((msg) => {
    const messageText = cleanTranscriptText(msg.text || msg.message || '');
    return searchQuery ? messageText.toLowerCase().includes(searchQuery.toLowerCase()) : true;
  });

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] !overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-primary-600" />
            Arama Detayları ve Transkript
          </DialogTitle>
          <DialogDescription>
            {call?.phoneNumber || call?.callerId || 'Bilinmiyor'} • {formatDate(call?.createdAt, 'long', locale)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : !call ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <p className="text-neutral-500">Arama bulunamadı</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6">
            {/* Audio Player */}
            {call.id && (
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Arama Kaydı</h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadRecording}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    İndir
                  </Button>
                </div>

                <audio
                  ref={audioRef}
                  src={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/call-logs/${call.id}/audio`}
                  preload="metadata"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => setAudioError(true)}
                  onCanPlay={() => setAudioError(false)}
                />

                {audioError ? (
                  <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Ses kaydı bulunamadı veya henüz hazır değil.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePlayPause}
                        className="w-20"
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="h-3 w-3 mr-1" />
                            Durdur
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Oynat
                          </>
                        )}
                      </Button>

                      <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />

                      <div className="text-xs text-neutral-600 dark:text-neutral-400 w-28 text-right">
                        {formatDuration(Math.floor(currentTime))} /{' '}
                        {formatDuration(Math.floor(duration || call?.duration || 0))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">Hız:</span>
                      {[0.5, 1, 1.5, 2].map((speed) => (
                        <Button
                          key={speed}
                          variant={playbackSpeed === speed ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleSpeedChange(speed)}
                          className="h-7 px-2 text-xs"
                        >
                          {speed}x
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Call Info - End Reason */}
            <div className="bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <PhoneOff className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Görüşme Sonlanma</h4>
              </div>
              <Badge variant="outline" className="text-xs">
                {call.endReason === 'client_ended' || call.endReason === 'client ended' ? 'Müşteri kapattı' :
                 call.endReason === 'agent_ended' || call.endReason === 'agent ended' ? 'Asistan kapattı' :
                 call.endReason === 'system_timeout' ? 'Zaman aşımı' :
                 call.endReason === 'no_answer' ? 'Cevap verilmedi' :
                 call.endReason === 'call_ended' || call.endReason === 'call ended' ? 'Görüşme tamamlandı' :
                 call.endReason === 'completed' ? 'Tamamlandı' :
                 call.endReason === 'error' ? 'Hata' :
                 call.endReason || 'Bilinmiyor'}
              </Badge>
            </div>

            {/* Call Summary */}
            {call.summary && (
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">Arama Özeti</h4>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">{call.summary}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Key Topics */}
              {call.keyTopics && call.keyTopics.length > 0 && (
                <div className="bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Ana Konular</h4>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {call.keyTopics.map((topic, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {call.actionItems && call.actionItems.length > 0 && (
                <div className="bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Yapılacaklar</h4>
                  </div>
                  <ul className="space-y-1">
                    {call.actionItems.map((item, index) => (
                      <li key={index} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1">
                        <span className="text-neutral-400 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Separator />

            {/* Transcript Section */}
            {(call.transcript || call.transcriptText) && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Transkript</h4>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTranscript}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    İndir
                  </Button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    placeholder="Transkript içinde ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Messages */}
                <div className="space-y-3 max-h-96 overflow-y-auto bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                  {call.transcript && Array.isArray(call.transcript) ? (
                    filteredMessages && filteredMessages.length > 0 ? (
                      filteredMessages.map((msg, index) => {
                        // Determine speaker - handle both formats
                        const speaker = msg.speaker || (msg.role === 'agent' ? 'assistant' : 'user');
                        const isAssistant = speaker === 'assistant' || speaker === 'agent';
                        const messageText = cleanTranscriptText(msg.text || msg.message || '');
                        const messageTime = formatTranscriptTime(msg, locale);

                        return (
                          <div
                            key={index}
                            className={`flex ${isAssistant ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                isAssistant
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200'
                                  : 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium">
                                  {isAssistant ? 'Asistan' : 'Müşteri'}
                                </span>
                                {messageTime && (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {messageTime}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm">{highlightText(messageText)}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center text-neutral-500 dark:text-neutral-400 py-4">
                        Aramanızla eşleşen mesaj bulunamadı
                      </p>
                    )
                  ) : call.transcriptText ? (
                    <pre className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap font-sans">
                      {highlightText(call.transcriptText)}
                    </pre>
                  ) : (
                    <p className="text-center text-neutral-500 dark:text-neutral-400 py-4">
                      Transkript bulunamadı
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Call Info */}
            <div className="grid grid-cols-2 gap-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Tarih ve Saat</p>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {formatDate(call.createdAt, 'long', locale)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Süre</p>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {formatDuration(call.duration)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
