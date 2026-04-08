/**
 * ChatWidget Component
 * Embeddable TEXT chat widget
 * Can be customized and embedded on any website
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { getChatWidgetFeedbackCopy } from '@/lib/chatWidgetFeedbackCopy';
import runtimeConfig from '@/lib/runtime-config';
import { publishLiveHandoffSync } from '@/lib/liveHandoffSync';

const API_URL = runtimeConfig.apiUrl;
const FEEDBACK_MIN_ASSISTANT_TURNS = 2;
const LIGHTWEIGHT_CHATTER_PATTERN = /^(selam|merhaba|nasılsın|iyi misin|teşekkürler|teşekkür ederim|sağ ol|sağ olun|günaydın|iyi akşamlar|görüşürüz|bye|hi|hello|hey|how are you|thanks|thank you|good morning|good evening)[!.?, ]*$/i;

function isMeaningfulUserMessage(message = '') {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  if (LIGHTWEIGHT_CHATTER_PATTERN.test(normalized)) return false;

  const hasDigits = /\d/.test(normalized);
  const hasQuestion = /[?？]/.test(normalized);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return hasDigits || hasQuestion || wordCount >= 2 || normalized.length >= 12;
}

function mapServerMessageToWidgetMessage(message = {}) {
  return {
    role: message?.role || 'assistant',
    content: String(message?.content || ''),
    timestamp: message?.timestamp ? new Date(message.timestamp) : null,
    traceId: message?.traceId || message?.metadata?.traceId || null,
    metadata: message?.metadata || null,
  };
}

function buildWidgetMessagesFromHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((message) => typeof message?.content === 'string' && message.content.trim().length > 0)
    .map(mapServerMessageToWidgetMessage);
}

function attachTraceToLatestAssistant(messages = [], traceId = null) {
  if (!traceId) return messages;

  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index]?.role === 'assistant') {
      nextMessages[index] = {
        ...nextMessages[index],
        traceId,
      };
      break;
    }
  }

  return nextMessages;
}

export default function ChatWidget({
  embedKey,           // NEW: Business-specific embed key (preferred)
  assistantId,        // LEGACY: Direct assistant ID (backward compatibility)
  position = 'bottom-right',
  primaryColor = '#051752',
  showBranding = true,
  buttonText,
  preview = false     // Dashboard preview mode — skip status check
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isWidgetEnabled, setIsWidgetEnabled] = useState(null); // null = loading, true/false = result
  const [allowReset, setAllowReset] = useState(false);
  const [latestAssistantTraceId, setLatestAssistantTraceId] = useState(null);
  const [feedbackChoice, setFeedbackChoice] = useState(null);
  const [feedbackReason, setFeedbackReason] = useState(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSubmittedByTrace, setFeedbackSubmittedByTrace] = useState({});
  const [widgetHandoff, setWidgetHandoff] = useState({ mode: 'AI' });
  const { t, locale } = useLanguage();
  const feedbackCopy = getChatWidgetFeedbackCopy(locale);
  const chatLiveHandoffEnabled = process.env.NEXT_PUBLIC_CHAT_LIVE_HANDOFF_V1 === 'true';

  // Check widget status on mount
  // In preview mode (dashboard), skip the public status check — always show widget
  useEffect(() => {
    if (preview) {
      setIsWidgetEnabled(true);
    }

    const checkWidgetStatus = async () => {
      try {
        let statusUrl;
        if (embedKey) {
          statusUrl = `${API_URL}/api/chat/widget/status/embed/${embedKey}`;
        } else if (assistantId) {
          statusUrl = `${API_URL}/api/chat/widget/status/${assistantId}`;
        } else {
          if (!preview) setIsWidgetEnabled(false);
          setAllowReset(false);
          return;
        }

        const response = await fetch(statusUrl);
        const data = await response.json();
        if (!preview) setIsWidgetEnabled(data.active === true);
        setAllowReset(data.allowReset === true);
      } catch (error) {
        console.error('Failed to check widget status:', error);
        if (!preview) setIsWidgetEnabled(false);
        setAllowReset(false);
      }
    };

    checkWidgetStatus();
  }, [embedKey, assistantId, preview]);

  // Generate or restore session ID on first open
  // Session expires after 30 minutes of inactivity → new conversation starts
  useEffect(() => {
    if (isOpen && !sessionId) {
      const baseKey = embedKey || assistantId || 'default';
      const idKey = `chatWidgetSessionId_${baseKey}`;
      const tsKey = `chatWidgetSessionTs_${baseKey}`;
      const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

      try {
        const storedId = localStorage.getItem(idKey);
        const storedTs = parseInt(localStorage.getItem(tsKey) || '0', 10);
        const isExpired = Date.now() - storedTs > SESSION_TTL_MS;

        if (storedId && !isExpired) {
          setSessionId(storedId);
        } else {
          // Expired or no session — start fresh
          const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem(idKey, newId);
          localStorage.setItem(tsKey, String(Date.now()));
          setSessionId(newId);
          setMessages([]);
          setConversationHistory([]);
        }
      } catch {
        setSessionId(`chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      }
    }
  }, [isOpen, sessionId, embedKey, assistantId]);

  // Use translated default if buttonText is not provided
  const displayButtonText = buttonText || t('dashboard.chatWidgetPage.defaultButtonText');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setFeedbackChoice(null);
    setFeedbackReason(null);
    setFeedbackComment('');
  }, [latestAssistantTraceId]);

  useEffect(() => {
    if (!chatLiveHandoffEnabled || !isOpen || !sessionId || (!embedKey && !assistantId)) {
      return undefined;
    }

    let cancelled = false;

    const syncSession = async () => {
      try {
        const params = new URLSearchParams({ sessionId });
        if (embedKey) {
          params.set('embedKey', embedKey);
        } else if (assistantId) {
          params.set('assistantId', assistantId);
        }

        const response = await fetch(`${API_URL}/api/chat/widget/session?${params.toString()}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (cancelled) return;

        setWidgetHandoff(data?.handoff || { mode: 'AI' });

        const syncedMessages = buildWidgetMessagesFromHistory(data?.history || []);
        if (syncedMessages.length > 0) {
          setMessages((prev) => {
            const previousSerialized = JSON.stringify(prev.map((message) => ({
              role: message.role,
              content: message.content,
              timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp || null,
            })));
            const nextSerialized = JSON.stringify(syncedMessages.map((message) => ({
              role: message.role,
              content: message.content,
              timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp || null,
            })));

            return previousSerialized === nextSerialized ? prev : syncedMessages;
          });
        }
      } catch (error) {
        console.error('Failed to sync widget session:', error);
      }
    };

    syncSession();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncSession();
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatLiveHandoffEnabled, isOpen, sessionId, embedKey, assistantId]);

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: t('dashboard.chatWidgetPage.defaultWelcomeMessage'),
        timestamp: new Date()
      }]);
    }
  }, [isOpen, messages.length, t]);

useEffect(() => {
  if (!isLoading && isOpen) {
    inputRef.current?.focus();
  }
}, [isLoading, isOpen]);

  const sendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    // Keep session alive — update last activity timestamp
    try {
      const tsKey = `chatWidgetSessionTs_${embedKey || assistantId || 'default'}`;
      localStorage.setItem(tsKey, String(Date.now()));
    } catch { /* ignore */ }

    // Add user message to UI
    const userMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Update conversation history
    const newHistory = [...conversationHistory, { role: 'user', content: text }];
    setConversationHistory(newHistory);

    try {
      // Build request body - prefer embedKey over assistantId
      const requestBody = {
        message: text,
        conversationHistory: newHistory,
        sessionId: sessionId
      };

      if (embedKey) {
        requestBody.embedKey = embedKey;
      } else if (assistantId) {
        requestBody.assistantId = assistantId;
      }

      // In preview mode, include dashboard session cookie so backend can allow preview bypasses
      const headers = { 'Content-Type': 'application/json' };

      const sendWidgetRequest = (credentialsMode) =>
        fetch(`${API_URL}/api/chat/widget`, {
          method: 'POST',
          credentials: credentialsMode,
          headers,
          body: JSON.stringify(requestBody)
        });

      let response;
      try {
        response = await sendWidgetRequest(preview ? 'include' : 'omit');
      } catch (initialError) {
        // Some edge/cors setups reject credentialed preview requests despite a valid dashboard session.
        // Retry once without credentials so preview can still work when widget is already publicly active.
        if (!preview) {
          throw initialError;
        }
        response = await sendWidgetRequest('omit');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Chat API error:', response.status, errorData);

        // Handle 503 Service Unavailable with Retry-After (P0)
        if (response.status === 503 && errorData.code === 'REQUEST_TIMEOUT') {
          const retryAfterMs = errorData.retryAfterMs || 2000;
          const retryAfterSec = Math.ceil(retryAfterMs / 1000);

          console.log(`⏱️ Service busy, retry after ${retryAfterSec}s (requestId: ${errorData.requestId})`);

          // Show user-friendly retry message
          const retryMessage = t('components.chatWidget.systemBusy', { seconds: retryAfterSec });

          setMessages(prev => [...prev, {
            role: 'system',
            content: retryMessage,
            timestamp: new Date()
          }]);

          setIsLoading(false);
          return; // Don't throw, just return
        }

        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data?.handoff) {
        setWidgetHandoff(data.handoff);
        if (preview && data.handoff.mode === 'REQUESTED') {
          publishLiveHandoffSync({
            type: 'handoff_requested',
            channel: 'CHAT',
            sessionId,
          });
        }
      }

      const historyMessages = attachTraceToLatestAssistant(
        buildWidgetMessagesFromHistory(data?.history || []),
        data?.traceId || null
      );
      if (historyMessages.length > 0) {
        setMessages(historyMessages);
      }

      if (data.reply) {
        if (historyMessages.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.reply,
            timestamp: new Date(),
            traceId: data.traceId || null
          }]);
        }
        setLatestAssistantTraceId(data.traceId || null);
        setConversationHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else if (!data?.suppressed && (!data?.handoff || data.handoff.mode === 'AI')) {
        console.warn('No reply in response:', data);
        setMessages(prev => [...prev, {
          role: 'system',
          content: t('components.chatWidget.genericError'),
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });

      let errorMessage = t('components.chatWidget.connectionError');
      if (error.message.includes('HTTP 500')) {
        errorMessage = t('components.chatWidget.serverError');
      } else if (error.message.includes('HTTP 403')) {
        errorMessage = t('components.chatWidget.serviceUnavailable');
      } else if (error.message.includes('HTTP 404')) {
        errorMessage = t('components.chatWidget.chatNotConfigured');
      }

      setMessages(prev => [...prev, {
        role: 'system',
        content: errorMessage,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      // Auto-focus input after sending
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    const baseKey = embedKey || assistantId || 'default';
    const idKey = `chatWidgetSessionId_${baseKey}`;
    const tsKey = `chatWidgetSessionTs_${baseKey}`;
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      localStorage.setItem(idKey, newId);
      localStorage.setItem(tsKey, String(Date.now()));
    } catch { /* ignore */ }

    setSessionId(newId);
    setMessages([]);
    setConversationHistory([]);
    setInputValue('');
    setLatestAssistantTraceId(null);
    setFeedbackChoice(null);
    setFeedbackReason(null);
    setFeedbackComment('');
    setFeedbackSubmittedByTrace({});
    setWidgetHandoff({ mode: 'AI' });
  };

  const tracedAssistantMessages = messages.filter((msg) => msg.role === 'assistant' && msg.traceId);
  const meaningfulUserMessages = messages.filter((msg) => msg.role === 'user' && isMeaningfulUserMessage(msg.content));
  const feedbackEligible = widgetHandoff?.mode === 'AI'
    && tracedAssistantMessages.length >= FEEDBACK_MIN_ASSISTANT_TURNS
    && meaningfulUserMessages.length >= 1;
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((msg) => msg.role === 'assistant' && msg.traceId);
  const activeFeedbackTraceId = feedbackEligible
    ? (latestAssistantMessage?.traceId || latestAssistantTraceId || null)
    : null;
  const feedbackAlreadySubmitted = activeFeedbackTraceId
    ? feedbackSubmittedByTrace[activeFeedbackTraceId] === true
    : false;

  const submitFeedback = async (sentiment, { reason = null, comment = '' } = {}) => {
    if (!activeFeedbackTraceId || feedbackSending) return;

    setFeedbackSending(true);
    try {
      const response = await fetch(`${API_URL}/api/chat/widget/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: activeFeedbackTraceId,
          sessionId,
          sentiment,
          reason,
          comment: comment || null,
          source: preview ? 'dashboard_preview_widget' : 'embedded_widget',
          assistantReplyPreview: latestAssistantMessage?.content || null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setFeedbackSubmittedByTrace(prev => ({
        ...prev,
        [activeFeedbackTraceId]: true
      }));
      setFeedbackChoice(null);
      setFeedbackReason(null);
      setFeedbackComment('');
    } catch (error) {
      console.error('Failed to submit widget feedback:', error);
    } finally {
      setFeedbackSending(false);
    }
  };

  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  };

  // Don't render if widget is disabled or still loading
  if (isWidgetEnabled !== true) {
    return null;
  }

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      {/* Chat Window */}
      {isOpen && (
        <div
          className="mb-4 w-80 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 overflow-hidden flex flex-col"
          style={{ height: '620px' }}
        >
          {/* Header */}
          <div 
            className="p-4 text-white flex items-center justify-between shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <span className="font-semibold">{displayButtonText}</span>
            </div>
            <div className="flex items-center gap-1">
              {allowReset && (
                <button
                  onClick={startNewChat}
                  className="hover:bg-white/20 rounded p-1 transition-colors"
                  title={t('dashboard.chatWidgetPage.newChat') || 'Yeni sohbet'}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 rounded p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-neutral-950 space-y-3">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === 'user'
                    ? 'justify-end'
                    : msg.role === 'system'
                      ? 'justify-center'
                      : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-md'
                      : msg.role === 'human_agent'
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-bl-md shadow-sm'
                      : msg.role === 'assistant'
                      ? 'bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-neutral-700 rounded-bl-md shadow-sm'
                      : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700'
                  }`}
                  style={msg.role === 'user' ? { backgroundColor: primaryColor } : {}}
                >
                  {msg.role === 'human_agent' && (
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      {t('dashboard.chatWidgetPage.liveAgentLabel')}
                    </div>
                  )}
                  {msg.role === 'system' && (
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
                      {t('dashboard.chatWidgetPage.systemLabel')}
                    </div>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-neutral-800 text-gray-500 px-4 py-2 rounded-2xl rounded-bl-md border border-gray-200 dark:border-neutral-700 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shrink-0">
            {feedbackEligible && activeFeedbackTraceId && !feedbackAlreadySubmitted && (
              <div className="mb-3 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-950 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {feedbackCopy.triggerLabel}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => submitFeedback('positive', { reason: 'HELPFUL' })}
                      disabled={feedbackSending}
                      aria-label={feedbackCopy.positiveAriaLabel}
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant={feedbackChoice === 'negative' ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() => setFeedbackChoice(feedbackChoice === 'negative' ? null : 'negative')}
                      disabled={feedbackSending}
                      aria-label={feedbackCopy.negativeAriaLabel}
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {feedbackChoice === 'negative' && (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1">
                    <div className="flex flex-wrap gap-2">
                      {feedbackCopy.reasons.map((reason) => (
                        <Button
                          key={reason.code}
                          type="button"
                          size="sm"
                          variant={feedbackReason === reason.code ? 'default' : 'outline'}
                          onClick={() => setFeedbackReason(reason.code)}
                          disabled={feedbackSending}
                        >
                          {reason.label}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder={feedbackCopy.commentPlaceholder}
                      className="min-h-[80px] text-sm"
                      disabled={feedbackSending}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => submitFeedback('negative', { reason: feedbackReason, comment: feedbackComment })}
                        disabled={feedbackSending || (!feedbackReason && !feedbackComment.trim())}
                      >
                        {feedbackSending ? feedbackCopy.typingLabel : feedbackCopy.submitLabel}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {feedbackAlreadySubmitted && activeFeedbackTraceId && (
              <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                {feedbackCopy.thankYouLabel}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('dashboard.chatWidgetPage.defaultPlaceholder')}
                disabled={isLoading}
                className="flex-1 rounded-full border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white focus:border-primary-500"
              />
              <Button
                type="button"
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                size="icon"
                className="rounded-full shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Branding */}
          {showBranding && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 text-center shrink-0">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Powered by <a href={runtimeConfig.siteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-gray-600 dark:hover:text-gray-400" style={{ color: primaryColor }}>Telyx.ai</a>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full p-4 text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
        style={{ backgroundColor: primaryColor }}
        aria-label={displayButtonText}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
