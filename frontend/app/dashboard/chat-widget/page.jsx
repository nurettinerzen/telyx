/**
 * Chat Widget Settings Page
 * Configure and generate embed code for chat widget
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Code, Eye, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import ChatWidget from '@/components/ChatWidget';
import { useChatWidgetSettings, useChatStats, useUpdateChatWidget } from '@/hooks/useChatWidget';
import { useAssistants } from '@/hooks/useAssistants';
import { useSubscription } from '@/hooks/useSubscription';


export default function ChatWidgetPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('chatWidget', locale);

  // React Query hooks
  const { data: widgetSettings, isLoading: widgetLoading } = useChatWidgetSettings();
  const { data: chatStats = { totalChats: 0, totalMessages: 0, avgMessagesPerChat: 0, activeChats: 0 } } = useChatStats();
  const { data: assistantsData, isLoading: assistantsLoading } = useAssistants();
  const { data: subscription } = useSubscription();
  const { mutateAsync: updateWidget } = useUpdateChatWidget();

  const loading = widgetLoading || assistantsLoading;
  const embedKey = widgetSettings?.embedKey || '';
  const assistants = assistantsData?.data?.assistants || [];
  const chatCapableAssistants = useMemo(
    () => assistants.filter((assistant) =>
      Array.isArray(assistant.channelCapabilities) &&
      assistant.channelCapabilities.includes('chat')
    ),
    [assistants]
  );
  const isPro = ['PRO', 'ENTERPRISE'].includes(subscription?.plan?.toUpperCase() || '');

  // Local UI state
  const [isEnabled, setIsEnabled] = useState(false);
  const [position, setPosition] = useState('bottom-right');
  const [primaryColor, setPrimaryColor] = useState('#00A2B3');
  const [showBranding, setShowBranding] = useState(true);
  const [buttonText, setButtonText] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [placeholderText, setPlaceholderText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);
  const [chatAssistantId, setChatAssistantId] = useState('');

  // Update isEnabled when widgetSettings loads
  useEffect(() => {
    if (widgetSettings) {
      setIsEnabled(widgetSettings.enabled);
    }
  }, [widgetSettings]);

  // Set default texts based on current locale
  useEffect(() => {
    if (!buttonText) {
      setButtonText(t('dashboard.chatWidgetPage.defaultButtonText'));
    }
    if (!welcomeMessage) {
      setWelcomeMessage(t('dashboard.chatWidgetPage.defaultWelcomeMessage'));
    }
    if (!placeholderText) {
      setPlaceholderText(t('dashboard.chatWidgetPage.defaultPlaceholder'));
    }
  }, [locale]);

  // Resolve selected chat assistant from backend config + available chat-capable assistants
  useEffect(() => {
    if (chatCapableAssistants.length === 0) {
      setChatAssistantId('');
      return;
    }

    const configuredId = widgetSettings?.chatAssistantId;
    const hasConfigured = configuredId && chatCapableAssistants.some((assistant) => assistant.id === configuredId);

    if (hasConfigured) {
      setChatAssistantId(configuredId);
    } else {
      setChatAssistantId(chatCapableAssistants[0].id);
    }
  }, [chatCapableAssistants, widgetSettings?.chatAssistantId]);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chatWidgetSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      setPosition(settings.position || 'bottom-right');
      setPrimaryColor(settings.primaryColor || '#00A2B3');
      setShowBranding(settings.showBranding !== undefined ? settings.showBranding : true);
      if (settings.buttonText) setButtonText(settings.buttonText);
      if (settings.welcomeMessage) setWelcomeMessage(settings.welcomeMessage);
      if (settings.placeholderText) setPlaceholderText(settings.placeholderText);
    }
  }, []);

  const saveSettings = async () => {
    try {
      // Save enabled state to backend using mutation
      await updateWidget({
        enabled: isEnabled,
        chatAssistantId: chatAssistantId || null
      });

      // Save other settings to localStorage (these are UI preferences)
      const settings = {
        position,
        primaryColor,
        showBranding: isPro ? showBranding : true,
        buttonText,
        welcomeMessage,
        placeholderText
      };
      localStorage.setItem('chatWidgetSettings', JSON.stringify(settings));
      toast.success(t('dashboard.chatWidgetPage.settingsSaved'));
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(t('dashboard.chatWidgetPage.settingsSaveError'));
    }
  };

  // Handle enable toggle change
  const handleEnableChange = async (enabled) => {
    setIsEnabled(enabled);
    try {
      await updateWidget({ enabled });
      toast.success(enabled
        ? t('dashboard.chatWidgetPage.widgetEnabled')
        : t('dashboard.chatWidgetPage.widgetDisabled')
      );
    } catch (error) {
      console.error('Failed to update widget status:', error);
      setIsEnabled(!enabled); // Revert on error
      toast.error(t('dashboard.chatWidgetPage.statusUpdateError'));
    }
  };

  const generateEmbedCode = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const positionMap = {
    'bottom-right': 'bottom: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'top-right': 'top: 20px; right: 20px;',
    'top-left': 'top: 20px; left: 20px;'
  };

  // Use actual values or fallback to translated defaults
  const actualButtonText = buttonText || t('dashboard.chatWidgetPage.defaultButtonText');
  const actualWelcomeMessage = welcomeMessage || t('dashboard.chatWidgetPage.defaultWelcomeMessage');
  const actualPlaceholder = placeholderText || t('dashboard.chatWidgetPage.defaultPlaceholder');
  // Free users can't disable branding
  const actualShowBranding = isPro ? showBranding : true;

  return `<!-- Telyx.ai Chat Widget -->
<script>
(function() {
  var CONFIG = {
    embedKey: '${embedKey}',
    apiUrl: '${apiUrl}',
    position: '${positionMap[position] || positionMap['bottom-right']}',
    primaryColor: '${primaryColor}',
    buttonText: '${actualButtonText}',
    welcomeMessage: '${actualWelcomeMessage}',
    placeholderText: '${actualPlaceholder}',
    showBranding: ${actualShowBranding}
  };

  // Styles
  var style = document.createElement('style');
  style.textContent = \`
    #telyx-widget-container * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    #telyx-widget-btn {
      position: fixed; \${CONFIG.position}
      width: 60px; height: 60px; border-radius: 50%;
      background: \${CONFIG.primaryColor}; border: none; cursor: pointer;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 99999; transition: all 0.3s ease;
      display: flex; align-items: center; justify-content: center;
    }
    #telyx-widget-btn:hover { transform: scale(1.1); }
    #telyx-widget-btn svg { width: 28px; height: 28px; fill: white; }
    #telyx-chat-window {
      position: fixed; \${CONFIG.position}
      width: 380px; height: 520px;
      background: white; border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      z-index: 99999; display: none; flex-direction: column;
      overflow: hidden;
    }
    #telyx-chat-window.open { display: flex; }
    #telyx-chat-header {
      background: \${CONFIG.primaryColor}; color: white;
      padding: 16px; display: flex; align-items: center; justify-content: space-between;
    }
    #telyx-chat-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    #telyx-close-btn { background: none; border: none; color: white; cursor: pointer; font-size: 24px; line-height: 1; }
    #telyx-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .telyx-msg {
      max-width: 80%; padding: 10px 14px; border-radius: 12px;
      font-size: 14px; line-height: 1.4; word-wrap: break-word;
    }
    .telyx-msg.user {
      background: \${CONFIG.primaryColor}; color: white;
      align-self: flex-end; border-bottom-right-radius: 4px;
    }
    .telyx-msg.bot {
      background: #f1f5f9; color: #1e293b;
      align-self: flex-start; border-bottom-left-radius: 4px;
    }
    .telyx-msg.typing { opacity: 0.7; }
    #telyx-chat-input-area {
      padding: 12px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 8px;
    }
    #telyx-chat-input {
      flex: 1; padding: 10px 14px; border: 1px solid #e2e8f0;
      border-radius: 24px; outline: none; font-size: 14px;
    }
    #telyx-chat-input:focus { border-color: \${CONFIG.primaryColor}; }
    #telyx-send-btn {
      width: 40px; height: 40px; border-radius: 50%;
      background: \${CONFIG.primaryColor}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #telyx-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #telyx-send-btn svg { width: 18px; height: 18px; fill: white; }
    #telyx-branding {
      text-align: center; padding: 8px; font-size: 11px; color: #94a3b8;
    }
    #telyx-branding a { color: \${CONFIG.primaryColor}; text-decoration: none; }
  \`;
  document.head.appendChild(style);

  // Create container
  var container = document.createElement('div');
  container.id = 'telyx-widget-container';

  var btn = document.createElement('button');
  btn.id = 'telyx-widget-btn';
  btn.setAttribute('aria-label', CONFIG.buttonText);
  btn.textContent = '💬';

  var chatWindow = document.createElement('div');
  chatWindow.id = 'telyx-chat-window';

  var chatHeader = document.createElement('div');
  chatHeader.id = 'telyx-chat-header';
  var title = document.createElement('h3');
  title.textContent = CONFIG.buttonText;
  var closeBtn = document.createElement('button');
  closeBtn.id = 'telyx-close-btn';
  closeBtn.textContent = '×';
  chatHeader.appendChild(title);
  chatHeader.appendChild(closeBtn);

  var messagesDiv = document.createElement('div');
  messagesDiv.id = 'telyx-chat-messages';

  var inputArea = document.createElement('div');
  inputArea.id = 'telyx-chat-input-area';
  var input = document.createElement('input');
  input.id = 'telyx-chat-input';
  input.type = 'text';
  input.placeholder = CONFIG.placeholderText;
  var sendBtn = document.createElement('button');
  sendBtn.id = 'telyx-send-btn';
  sendBtn.textContent = '➤';
  inputArea.appendChild(input);
  inputArea.appendChild(sendBtn);

  chatWindow.appendChild(chatHeader);
  chatWindow.appendChild(messagesDiv);
  chatWindow.appendChild(inputArea);

  if (CONFIG.showBranding) {
    var branding = document.createElement('div');
    branding.id = 'telyx-branding';
    var brandingText = document.createElement('span');
    brandingText.textContent = 'Powered by ';
    var brandingLink = document.createElement('a');
    brandingLink.href = 'https://telyx.ai';
    brandingLink.target = '_blank';
    brandingLink.rel = 'noopener noreferrer';
    brandingLink.textContent = 'Telyx.ai';
    branding.appendChild(brandingText);
    branding.appendChild(brandingLink);
    chatWindow.appendChild(branding);
  }

  container.appendChild(btn);
  container.appendChild(chatWindow);
  document.body.appendChild(container);

  // Elements
  btn = document.getElementById('telyx-widget-btn');
  chatWindow = document.getElementById('telyx-chat-window');
  closeBtn = document.getElementById('telyx-close-btn');
  messagesDiv = document.getElementById('telyx-chat-messages');
  input = document.getElementById('telyx-chat-input');
  sendBtn = document.getElementById('telyx-send-btn');

  var conversationHistory = [];
  var isOpen = false;
  var sessionStorageKey = 'telyxChatSessionId_' + CONFIG.embedKey;
  var sessionTsKey = 'telyxChatSessionTs_' + CONFIG.embedKey;
  var SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  var sessionId = (function() {
    try {
      var stored = localStorage.getItem(sessionStorageKey);
      var storedTs = parseInt(localStorage.getItem(sessionTsKey) || '0', 10);
      var isExpired = Date.now() - storedTs > SESSION_TTL_MS;
      if (stored && !isExpired) return stored;
      var newId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(sessionStorageKey, newId);
      localStorage.setItem(sessionTsKey, String(Date.now()));
      return newId;
    } catch(e) {
      return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  })();

  // Toggle chat
  btn.onclick = function() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    btn.style.display = isOpen ? 'none' : 'flex';
    if (isOpen && messagesDiv.children.length === 0) {
      addMessage('bot', CONFIG.welcomeMessage);
    }
  };
  closeBtn.onclick = function() {
    isOpen = false;
    chatWindow.classList.remove('open');
    btn.style.display = 'flex';
  };

  // Add message to UI
  function addMessage(role, content, isTyping) {
    var div = document.createElement('div');
    div.className = 'telyx-msg ' + role + (isTyping ? ' typing' : '');
    div.textContent = content;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
  }

  // Send message
  async function sendMessage() {
    var text = input.value.trim();
    if (!text) return;

    // Keep session alive
    try { localStorage.setItem(sessionTsKey, String(Date.now())); } catch(e) {}

    input.value = '';
    sendBtn.disabled = true;
    addMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    var typingDiv = addMessage('bot', 'Typing...', true);

    try {
      var res = await fetch(CONFIG.apiUrl + '/api/chat/widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedKey: CONFIG.embedKey,
          sessionId: sessionId,
          message: text,
          conversationHistory: conversationHistory
        })
      });
      var data = await res.json();
      typingDiv.remove();
      
      if (data.reply) {
        addMessage('bot', data.reply);
        conversationHistory.push({ role: 'assistant', content: data.reply });
      } else {
        addMessage('bot', 'Sorry, something went wrong.');
      }
    } catch (err) {
      typingDiv.remove();
      addMessage('bot', 'Connection error. Please try again.');
    }
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.onclick = sendMessage;
  input.onkeypress = function(e) { if (e.key === 'Enter') sendMessage(); };
})();
</script>`;
};

  const copyEmbedCode = () => {
    const code = generateEmbedCode();
    navigator.clipboard.writeText(code);
    toast.success(t('dashboard.chatWidgetPage.embedCodeCopied'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageIntro
        title={pageHelp?.title || t('dashboard.chatWidgetPage.title')}
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="flex flex-col gap-6">
          {/* Enable/Disable */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t('dashboard.chatWidgetPage.enableWidget')}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t('dashboard.chatWidgetPage.enableWidgetDesc')}
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={handleEnableChange}
              />
            </div>
          </Card>

          {/* Assistant Selection */}
          <Card className="p-6">
            <Label htmlFor="chatAssistant">Chat Assistant</Label>
            <Select
              value={chatAssistantId}
              onValueChange={setChatAssistantId}
              disabled={chatCapableAssistants.length === 0}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder={t('dashboard.chatWidgetPage.chooseAssistant')} />
              </SelectTrigger>
              <SelectContent>
                {chatCapableAssistants.map((assistant) => (
                  <SelectItem key={assistant.id} value={assistant.id}>
                    {assistant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-2">
              {chatCapableAssistants.length === 0
                ? 'Henüz asistan oluşturmadınız. Asistanlar sayfasından bir asistan oluşturun.'
                : 'Seçilen asistan chat widget, WhatsApp ve e-posta kanallarında kullanılır.'}
            </p>
          </Card>

          {/* Appearance */}
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('dashboard.chatWidgetPage.appearance')}</h3>

            {/* Position */}
            <div>
              <Label htmlFor="position">{t('dashboard.chatWidgetPage.position')}</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">{t('dashboard.chatWidgetPage.bottomRight')}</SelectItem>
                  <SelectItem value="bottom-left">{t('dashboard.chatWidgetPage.bottomLeft')}</SelectItem>
                  <SelectItem value="top-right">{t('dashboard.chatWidgetPage.topRight')}</SelectItem>
                  <SelectItem value="top-left">{t('dashboard.chatWidgetPage.topLeft')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Primary Color */}
            <div>
              <Label htmlFor="color">{t('dashboard.chatWidgetPage.primaryColor')}</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>

            {/* Button Text */}
            <div>
              <Label htmlFor="buttonText">{t('dashboard.chatWidgetPage.buttonText')}</Label>
              <Input
                id="buttonText"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder={t('dashboard.chatWidgetPage.buttonTextPlaceholder')}
                className="mt-2"
              />
            </div>

            {/* Show Branding */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Label>{t('dashboard.chatWidgetPage.showBranding')}</Label>
                  {!isPro && <Lock className="h-3 w-3 text-gray-400" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {isPro
                    ? t('dashboard.chatWidgetPage.showBrandingDesc')
                    : t('dashboard.chatWidgetPage.brandingProOnly')}
                </p>
              </div>
              <Switch
                checked={isPro ? showBranding : true}
                onCheckedChange={setShowBranding}
                disabled={!isPro}
              />
            </div>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={saveSettings} className="flex-1">
              {t('dashboard.chatWidgetPage.saveSettings')}
            </Button>
            <Button
              onClick={() => setShowPreview(!showPreview)}
              variant="outline"
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? t('dashboard.chatWidgetPage.hide') : t('dashboard.chatWidgetPage.preview')}
            </Button>
          </div>
        </div>

        {/* Right Column: Embed Code + Instructions + Stats */}
        <div className="flex flex-col gap-6">
          {/* Embed Code — preview with expand */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary-600" />
                <h3 className="text-lg font-semibold">{t('dashboard.chatWidgetPage.embedCode')}</h3>
              </div>
              <Button onClick={copyEmbedCode} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                {t('dashboard.chatWidgetPage.copy')}
              </Button>
            </div>
            <div className="relative">
              <pre className={`bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto transition-all duration-200 ${showEmbedCode ? 'max-h-96 overflow-y-auto' : 'max-h-32 overflow-hidden'}`}>
                <code>{generateEmbedCode()}</code>
              </pre>
              {!showEmbedCode && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900 to-transparent rounded-b-lg" />
              )}
            </div>
            <button
              onClick={() => setShowEmbedCode(!showEmbedCode)}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mt-2 font-medium"
            >
              {showEmbedCode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showEmbedCode
                ? t('dashboard.chatWidgetPage.collapse')
                : t('dashboard.chatWidgetPage.showAll')}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              {t('dashboard.chatWidgetPage.embedCodeInstructions')}
            </p>
          </Card>

          {/* Instructions */}
          <Card className="p-6 flex-1">
            <h3 className="text-lg font-semibold mb-3">{t('dashboard.chatWidgetPage.howToInstall')}</h3>
            <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>{t('dashboard.chatWidgetPage.step1')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>{t('dashboard.chatWidgetPage.step2')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>{t('dashboard.chatWidgetPage.step3')}</span>
              </li>
            </ol>
          </Card>

          {/* Stats */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t('dashboard.chatWidgetPage.widgetAnalytics')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold text-primary-600">{chatStats.totalChats}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.chatWidgetPage.conversations')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-600">{chatStats.totalMessages}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.chatWidgetPage.totalMessages')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-600">{chatStats.avgMessagesPerChat}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.chatWidgetPage.avgMessages')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-600">{chatStats.todayChats || 0}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.chatWidgetPage.todayChats')}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Preview Widget — preview mode skips public status check */}
      {showPreview && (embedKey || chatAssistantId) && (
        <ChatWidget
          preview
          embedKey={embedKey || undefined}
          assistantId={!embedKey ? chatAssistantId : undefined}
          position={position}
          primaryColor={primaryColor}
          showBranding={showBranding}
          buttonText={buttonText}
        />
      )}
    </div>
  );
}
