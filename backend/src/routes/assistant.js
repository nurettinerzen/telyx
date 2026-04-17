import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissions.js';
import elevenLabsService, { buildAgentConfig } from '../services/elevenlabs.js';
import { removeStaticDateTimeFromPrompt } from '../utils/dateTime.js';
import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from '../services/promptBuilder.js';
// ✅ Use central tool system for 11Labs
import { getActiveToolsForElevenLabs, getActiveTools } from '../tools/index.js';
// ✅ Central voice mapping
import { getElevenLabsVoiceId } from '../constants/voices.js';
// ✅ Plan configuration - P0-A: Single source of truth
import { getEffectivePlanConfig, checkLimit } from '../services/planConfig.js';
import { getMessageVariant } from '../messages/messageCatalog.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import { resolvePhoneOutboundAccessForBusinessId } from '../services/phoneOutboundAccess.js';
import {
  ASSISTANT_CHANNEL_CAPABILITIES,
  getDefaultCapabilitiesForCallDirection,
  normalizeChannelCapabilities
} from '../services/assistantChannels.js';
import runtimeConfig from '../config/runtime.js';

const router = express.Router();

// ============================================================
// 11LABS LANGUAGE CODE MAPPING
// Our language codes -> 11Labs accepted language codes
// ============================================================
const ELEVENLABS_LANGUAGE_MAP = {
  'tr': 'tr',
  'en': 'en',
  'pr': 'pt-br',  // Brazilian Portuguese
  'pt': 'pt',     // European Portuguese
  'de': 'de',
  'es': 'es',
  'fr': 'fr',
  'it': 'it',
  'ja': 'ja',
  'ko': 'ko',
  'zh': 'zh',
  'ar': 'ar',
  'hi': 'hi',
  'nl': 'nl',
  'pl': 'pl',
  'ru': 'ru',
  'sv': 'sv'
};

/**
 * Convert our language code to 11Labs accepted language code
 * @param {string} lang - Our language code (e.g., 'pr', 'tr', 'en')
 * @returns {string} 11Labs language code (e.g., 'pt-br', 'tr', 'en')
 */
function getElevenLabsLanguage(lang) {
  const normalized = lang?.toLowerCase() || 'tr';
  return ELEVENLABS_LANGUAGE_MAP[normalized] || normalized;
}
const OUTBOUND_ONLY_V1_ERROR = {
  error: 'OUTBOUND_ONLY_V1',
  message: 'V1 sürümünde inbound call assistant kapalıdır. Sadece outbound kullanılabilir.'
};

function isOutboundDirection(direction) {
  return typeof direction === 'string' && direction.startsWith('outbound');
}

function isChatDirection(direction) {
  return typeof direction === 'string' && ['chat', 'whatsapp', 'email'].includes(direction);
}

function isAllowedDirection(direction) {
  return isOutboundDirection(direction) || isChatDirection(direction) || direction === 'inbound';
}

function sendOutboundOnlyV1(res) {
  return res.status(403).json(OUTBOUND_ONLY_V1_ERROR);
}

function buildEndCallTool() {
  return {
    type: 'system',
    name: 'end_call',
    description: 'Müşteri vedalaştığında veya "iyi günler", "görüşürüz", "hoşçakal", "bye", "goodbye" dediğinde aramayı sonlandır. Görüşme tamamlandığında ve müşteri veda ettiğinde bu aracı kullan.',
    params: {
      system_tool_type: 'end_call'
    }
  };
}

function buildVoicemailDetectionTool() {
  return {
    type: 'system',
    name: 'voicemail_detection',
    description: 'Sesli mesaj (voicemail) algılandığında aramayı otomatik olarak sonlandırır.',
    params: {
      system_tool_type: 'voicemail_detection',
      voicemail_message: '',
      use_out_of_band_dtmf: false
    }
  };
}

function buildSkipTurnTool() {
  return {
    type: 'system',
    name: 'skip_turn',
    description: 'Otomatik santral/IVR menüsü konuşurken, transfer beklerken veya karşı taraf senden kısa süre beklemeni istediğinde sessiz kalmak için bu aracı kullan.',
    params: {
      system_tool_type: 'skip_turn'
    }
  };
}

function buildIvrTouchToneTool() {
  return {
    type: 'system',
    name: 'play_keypad_touch_tone',
    description: 'Arama otomatik santral veya IVR menüsüne düştüğünde satış, operatör, müşteri temsilcisi veya ilgili departmana ulaşmak için gerekli DTMF tuşlarını gönder. Yalnızca otomatik menülerde kullan; insanla konuşurken kullanma.',
    params: {
      system_tool_type: 'play_keypad_touch_tone'
    }
  };
}

function buildPhoneSystemTools({ callDirection } = {}) {
  const systemTools = [
    buildEndCallTool(),
    buildVoicemailDetectionTool()
  ];

  if (isOutboundDirection(callDirection)) {
    systemTools.push(buildSkipTurnTool(), buildIvrTouchToneTool());
  }

  return systemTools;
}

function shouldUseSilentStart(callDirection, assistantType = 'phone') {
  return assistantType !== 'text' && isOutboundDirection(callDirection);
}

function normalizeFirstMessageValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveStoredFirstMessage({
  callDirection,
  assistantType = 'phone',
  providedFirstMessage,
  fallbackFirstMessage
} = {}) {
  if (shouldUseSilentStart(callDirection, assistantType)) {
    return null;
  }

  const explicitFirstMessage = normalizeFirstMessageValue(providedFirstMessage);
  if (explicitFirstMessage) {
    return explicitFirstMessage;
  }

  const fallback = normalizeFirstMessageValue(fallbackFirstMessage);
  return fallback || null;
}

function resolveProviderFirstMessage({
  callDirection,
  assistantType = 'phone',
  storedFirstMessage,
  clearExisting = false
} = {}) {
  if (shouldUseSilentStart(callDirection, assistantType)) {
    return clearExisting ? '' : undefined;
  }

  const normalized = normalizeFirstMessageValue(storedFirstMessage);
  return normalized || undefined;
}

function isElevenLabsNotFound(error) {
  return Number(error?.response?.status) === 404;
}

function getKnowledgeItemSyncName(item) {
  if (!item) return null;

  if (item.type === 'FAQ' && item.question) {
    return `FAQ: ${item.question.substring(0, 50)}`;
  }

  if (item.title) {
    return item.title;
  }

  if (item.fileName) {
    return item.fileName;
  }

  if (item.url) {
    return item.url;
  }

  return null;
}

function getActiveKnowledgeItemNames(items = []) {
  return new Set(
    items
      .map(getKnowledgeItemSyncName)
      .map(name => String(name || '').trim())
      .filter(Boolean)
  );
}

function filterKnowledgeBaseEntriesForBusiness(currentKnowledgeBase = [], activeKnowledgeNames = new Set()) {
  if (!Array.isArray(currentKnowledgeBase) || currentKnowledgeBase.length === 0) {
    return [];
  }

  if (!(activeKnowledgeNames instanceof Set) || activeKnowledgeNames.size === 0) {
    return [];
  }

  return currentKnowledgeBase.filter((entry) => activeKnowledgeNames.has(String(entry?.name || '').trim()));
}

function buildPhoneAssistantPromptFromState(assistant, business, integrations = []) {
  const tempAssistant = {
    name: assistant?.name,
    assistantType: assistant?.assistantType || 'phone',
    systemPrompt: assistant?.userInstructions || null,
    tone: assistant?.tone || 'professional',
    customNotes: assistant?.customNotes || null,
    callDirection: assistant?.callDirection
  };

  return buildAssistantPrompt(tempAssistant, business, getPromptBuilderTools(business, integrations));
}

// ============================================================
// ASSISTANT DEFAULTS BY LANGUAGE
// ============================================================
const ASSISTANT_DEFAULTS = {
  TR: {
    voice: 'tr-f-ecem',
    firstMessage: 'Merhaba, ben {name}. Size nasıl yardımcı olabilirim?',
    systemPromptPrefix: 'Sen yardımcı bir asistansın. Türkçe konuş. Kibar ve profesyonel ol.'
  },
  EN: {
    voice: 'en-f-kayla',
    firstMessage: "Hello, I'm {name}. How can I help you today?",
    systemPromptPrefix: 'You are a helpful assistant. Speak in English. Be polite and professional.'
  },
  DE: {
    voice: 'en-f-kayla', // Will use English voice as fallback
    firstMessage: "Hallo, ich bin {name}. Wie kann ich Ihnen helfen?",
    systemPromptPrefix: 'Du bist ein hilfreicher Assistent. Sprich auf Deutsch. Sei höflich und professionell.'
  },
  ES: {
    voice: 'en-f-kayla',
    firstMessage: "Hola, soy {name}. ¿Cómo puedo ayudarle?",
    systemPromptPrefix: 'Eres un asistente útil. Habla en español. Sé educado y profesional.'
  }
};

/**
 * Get formatted date/time string for a timezone
 * @param {string} timezone - IANA timezone string
 * @param {string} language - Language code (TR, EN, etc.)
 * @returns {string} Formatted date/time context string
 */
function getDateTimeContext(timezone, language = 'TR') {
  const now = new Date();
  const locale = language === 'TR' ? 'tr-TR' : 'en-US';

  const options = {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: language !== 'TR'
  };

  const formattedDateTime = now.toLocaleString(locale, options);

  if (language === 'TR') {
    return `\n\nÖNEMLİ: Şu anki tarih ve saat: ${formattedDateTime} (${timezone} saat dilimi). Tüm tarih ve saat hesaplamalarında bunu kullan.`;
  }
  return `\n\nIMPORTANT: Current date and time is ${formattedDateTime} (${timezone} timezone). Use this for all date and time calculations.`;
}

router.use(authenticateToken);

// GET /api/assistants - List all assistants
router.get('/', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;

    const assistants = await prisma.assistant.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Clean system prompts - remove dynamic date/time lines for UI display
    const cleanedAssistants = assistants.map(assistant => ({
      ...assistant,
      systemPrompt: removeStaticDateTimeFromPrompt(assistant.systemPrompt)
    }));

    res.json({ assistants: cleanedAssistants });
  } catch (error) {
    console.error('Error fetching assistants:', error);
    res.status(500).json({ error: 'Failed to fetch assistants' });
  }
});

// POST /api/assistants - Create new assistant
router.post('/', authenticateToken, checkPermission('assistants:create'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { name, voiceId, firstMessage, systemPrompt, model, language, country, industry, timezone, tone, customNotes, callDirection, callPurpose, dynamicVariables, channelCapabilities, assistantType: reqAssistantType } = req.body;
    const assistantType = reqAssistantType === 'text' ? 'text' : 'phone';
    const isTextAssistant = assistantType === 'text';
    const inboundEnabled = isPhoneInboundEnabledForBusinessRecord(req.user?.business);
    const requestedDirection = isTextAssistant ? 'outbound' : (callDirection || 'outbound');

    if (!isTextAssistant && requestedDirection === 'inbound' && !inboundEnabled) {
      return sendOutboundOnlyV1(res);
    }

    // Block unknown directions.
    if (!isTextAssistant && !isAllowedDirection(requestedDirection)) {
      return sendOutboundOnlyV1(res);
    }

    // Phone assistants must always provide voiceId at API level.
    if (!isTextAssistant && (typeof voiceId !== 'string' || voiceId.trim().length === 0)) {
      return res.status(400).json({
        error: 'voiceId is required for phone assistants',
        errorTR: 'Telefon asistanı için voiceId zorunludur'
      });
    }

    // Validate assistant name length
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Assistant name is required',
        errorTR: 'Asistan adı zorunludur'
      });
    }

    if (name.length > 25) {
      return res.status(400).json({
        error: 'Assistant name must be 25 characters or less',
        errorTR: 'Asistan adı en fazla 25 karakter olabilir'
      });
    }

    // Check subscription limits
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { business: { select: { country: true } } }
    });

    if (!subscription) {
      return res.status(403).json({
        error: 'No active subscription found',
        errorTR: 'Aktif abonelik bulunamadı'
      });
    }

    // P0-A: Use single source of truth for plan config
    const planConfig = getEffectivePlanConfig(subscription);

    // FREE plan: No assistants allowed
    if (subscription.plan === 'FREE') {
      return res.status(403).json({
        error: 'Assistants are not available on the FREE plan. Please upgrade to create assistants.',
        errorTR: 'Asistanlar ÜCRETSİZ planda mevcut değildir. Asistan oluşturmak için planınızı yükseltin.'
      });
    }

    // RACE CONDITION PROTECTION: Lock + count within transaction
    const assistantCount = await prisma.$transaction(async (tx) => {
      // Lock business row to serialize assistant creation for this business
      await tx.business.findUnique({
        where: { id: businessId },
        select: { id: true }
      });

      // Count active assistants within transaction (only isActive=true)
      return await tx.assistant.count({
        where: { businessId, isActive: true }
      });
    });

    // Check limit using unified config
    const assistantsLimit = planConfig.assistantsLimit;
    const isUnlimited = assistantsLimit === null || assistantsLimit === -1;

    if (!isUnlimited && assistantCount >= assistantsLimit) {
      return res.status(403).json({
        error: `ASSISTANT_LIMIT_REACHED`,
        message: `You've reached your plan limit of ${assistantsLimit} assistant${assistantsLimit > 1 ? 's' : ''}. Upgrade to create more.`,
        messageTR: `${assistantsLimit} asistan limitine ulaştınız. Daha fazla oluşturmak için planınızı yükseltin.`,
        currentCount: assistantCount,
        limit: assistantsLimit,
        assistantType: isTextAssistant ? 'text' : 'phone',
        plan: subscription.plan,
        upgradeUrl: '/dashboard/subscription'
      });
    }

    // Get 11Labs voice ID from central mapping
    const elevenLabsVoiceId = getElevenLabsVoiceId(voiceId, language);

    // Get business info for language/timezone defaults
    let business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrations: { where: { isActive: true } } }
    });

    // Update business country if provided and not already set (from onboarding)
    if (country && (!business.country || business.country === 'US')) {
      business = await prisma.business.update({
        where: { id: businessId },
        data: { country: country.toUpperCase() },
        include: { integrations: { where: { isActive: true } } }
      });
      console.log('📍 Updated business country to:', country.toUpperCase());
    }

    const lang = language?.toUpperCase() || business?.language || 'TR';
    const businessTimezone = timezone || business?.timezone || 'Europe/Istanbul';
    const defaults = ASSISTANT_DEFAULTS[lang] || ASSISTANT_DEFAULTS.TR;

    // Determine effective callDirection based on callPurpose
    // For outbound calls, callPurpose determines the actual callDirection for prompt selection
    // 3 main purposes: sales, collection, general
    let effectiveCallDirection = isTextAssistant ? 'outbound' : (callDirection || 'outbound');
    if (!isTextAssistant && effectiveCallDirection === 'outbound' && callPurpose) {
      // Map callPurpose to specific callDirection for promptBuilder
      if (callPurpose === 'sales') {
        effectiveCallDirection = 'outbound_sales';
      } else if (callPurpose === 'collection') {
        effectiveCallDirection = 'outbound_collection';
      } else if (callPurpose === 'general') {
        effectiveCallDirection = 'outbound_general';
      }
      console.log('📞 Outbound call purpose mapping:', callPurpose, '->', effectiveCallDirection);
    }

    const finalChannelCapabilities = isTextAssistant
      ? [ASSISTANT_CHANNEL_CAPABILITIES.CHAT, ASSISTANT_CHANNEL_CAPABILITIES.WHATSAPP, ASSISTANT_CHANNEL_CAPABILITIES.EMAIL]
      : normalizeChannelCapabilities(channelCapabilities, getDefaultCapabilitiesForCallDirection(effectiveCallDirection));

    // Build full system prompt using promptBuilder
    // Create temporary assistant object for promptBuilder
    const tempAssistant = {
      name,
      assistantType,
      systemPrompt: systemPrompt,
      tone: tone || 'professional',
      customNotes: customNotes || null,
      callDirection: effectiveCallDirection
    };

    // Get active tools list for prompt builder
    const activeToolsList = getPromptBuilderTools(business, business.integrations || []);

    // Use central prompt builder to create the full system prompt
    const fullSystemPrompt = buildAssistantPrompt(tempAssistant, business, activeToolsList);

    // Default first message based on language (deterministic variant for TR/EN)
    let finalFirstMessage = null;
    let elevenLabsAgentId = null;

    if (isTextAssistant) {
      // Text assistants: no voice, no 11Labs, no firstMessage
      console.log('💬 [Create] Text assistant — skipping 11Labs agent creation');
    } else {
    // Phone assistant: full 11Labs flow
    const localizedDefaultFirstMessage = ['TR', 'EN'].includes(lang)
      ? getMessageVariant('ASSISTANT_DEFAULT_FIRST_MESSAGE', {
        language: lang,
        directiveType: 'GREETING',
        severity: 'info',
        seedHint: name,
        variables: { name }
      }).text
      : '';
    const defaultFirstMessage = localizedDefaultFirstMessage || defaults.firstMessage.replace('{name}', name);
    finalFirstMessage = resolveStoredFirstMessage({
      callDirection: effectiveCallDirection,
      assistantType,
      providedFirstMessage: firstMessage,
      fallbackFirstMessage: defaultFirstMessage
    });

    // Get active tools based on business integrations (using central tool system)
    const activeToolsElevenLabs = getActiveToolsForElevenLabs(business);
    console.log('📤 11Labs Request - tools:', activeToolsElevenLabs.map(t => t.name));

    // ✅ 11Labs Conversational AI'da YENİ agent oluştur

    try {
      // Convert our language code to 11Labs format (e.g., 'pr' -> 'pt-br')
      const elevenLabsLang = getElevenLabsLanguage(lang);
      console.log('📝 Language mapping:', lang, '->', elevenLabsLang);

      const systemTools = buildPhoneSystemTools({ callDirection: effectiveCallDirection });

      // Webhook tools - inline in agent config (not separate via tool_ids)
      const backendUrl = runtimeConfig.backendUrl;
      const webhookUrl = `${backendUrl}/api/elevenlabs/webhook`;
      const activeToolDefinitions = getActiveTools(business);

      const webhookTools = activeToolDefinitions.map(tool => ({
        type: 'webhook',
        name: tool.function.name,
        description: tool.function.description,
        api_schema: {
          url: webhookUrl,
          method: 'POST',
          request_body_schema: {
            type: 'object',
            properties: {
              tool_name: {
                type: 'string',
                constant_value: tool.function.name  // Only constant_value, no description
              },
              ...Object.fromEntries(
                Object.entries(tool.function.parameters.properties || {}).map(([key, value]) => [
                  key,
                  {
                    type: value.type || 'string',
                    description: value.description || ''
                  }
                ])
              )
            },
            required: tool.function.parameters.required || []
          }
        }
      }));

      // All tools: system + webhook
      const allTools = [...systemTools, ...webhookTools];
      console.log('🔧 Tools for agent:', allTools.map(t => t.name));

      // Build language-specific analysis prompts for post-call summary
      const analysisPrompts = {
        tr: {
          transcript_summary: 'Bu görüşmenin kısa bir özetini Türkçe olarak yaz. Müşterinin amacını, konuşulan konuları ve sonucu belirt.',
          success_evaluation: 'Görüşme başarılı mı? Müşterinin talebi karşılandı mı?'
        },
        en: {
          transcript_summary: 'Write a brief summary of this conversation. State the customer purpose, topics discussed, and outcome.',
          success_evaluation: 'Was the conversation successful? Was the customer request fulfilled?'
        }
      };
      const langAnalysis = analysisPrompts[elevenLabsLang] || analysisPrompts.en;

      // Sync workspace webhooks BEFORE agent create so we get the postCallWebhookId
      let postCallWebhookId = process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID || null;
      try {
        const workspaceSync = await elevenLabsService.ensureWorkspaceWebhookRouting({ backendUrl });
        if (workspaceSync.ok) {
          postCallWebhookId = postCallWebhookId || workspaceSync.postCallWebhookId || null;
          console.log(`✅ [11Labs] Workspace webhook pre-sync ${workspaceSync.changed ? 'updated' : 'verified'} (postCallWebhookId=${postCallWebhookId || 'none'})`);
        } else {
          console.warn('⚠️ [11Labs] Workspace webhook pre-sync failed:', workspaceSync.error);
        }
      } catch (syncErr) {
        console.warn('⚠️ [11Labs] Workspace webhook pre-sync error:', syncErr.message);
      }

      const providerFirstMessage = resolveProviderFirstMessage({
        callDirection: effectiveCallDirection,
        assistantType,
        storedFirstMessage: finalFirstMessage
      });

      const agentConfig = {
        name: `${name} - ${Date.now()}`,
        conversation_config: {
          agent: {
            prompt: {
              prompt: fullSystemPrompt,
              llm: 'gemini-2.5-flash',
              temperature: 0.1,
              // All tools: system + webhook (inline)
              tools: allTools
            },
            ...(providerFirstMessage !== undefined ? { first_message: providerFirstMessage } : {}),
            language: elevenLabsLang
          },
          tts: {
            voice_id: elevenLabsVoiceId,
            model_id: 'eleven_turbo_v2_5',
            stability: 0.4,                      // Daha doğal tonlama için
            similarity_boost: 0.6,               // Daha doğal konuşma için
            style: 0.15,                         // Hafif stil varyasyonu
            optimize_streaming_latency: 3
          },
          stt: {
            provider: 'elevenlabs',
            model: 'scribe_v1',
            language: elevenLabsLang
          },
          turn: {
            mode: 'turn',
            turn_timeout: 8,                     // 8sn - tool çağrısı sırasında yoklama yapmasın
            turn_eagerness: 'normal',            // Normal mod - dengeli tepki
            silence_end_call_timeout: 30         // 30sn toplam sessizlikten sonra kapat
          },
          // Analysis settings for Turkish/language-specific summary
          analysis: {
            transcript_summary_prompt: langAnalysis.transcript_summary,
            success_evaluation_prompt: langAnalysis.success_evaluation
          },
        },
        platform_settings: {
          workspace_overrides: {
            conversation_initiation_client_data_webhook: {
              url: `${backendUrl}/api/elevenlabs/webhook`,
              request_headers: {}
            },
            ...(postCallWebhookId ? {
              webhooks: {
                post_call_webhook_id: postCallWebhookId,
                events: ['transcript', 'call_initiation_failure'],
                send_audio: false
              }
            } : {})
          }
        },
        metadata: {
          telyx_business_id: businessId.toString(),
          model: model || 'gpt-4'
        }
      };

      // DEBUG: Log the full agent config
      console.log('🔍 DEBUG - agentConfig platform_settings:', JSON.stringify(agentConfig.platform_settings));
      console.log('🔍 DEBUG - agentConfig tools:', allTools.map(t => ({ name: t.name, type: t.type })));

      const elevenLabsResponse = await elevenLabsService.createAgent(agentConfig);
      elevenLabsAgentId = elevenLabsResponse.agent_id;
      console.log('✅ 11Labs Agent created:', elevenLabsAgentId);

      // Update webhook tools with agentId in URL (11Labs doesn't send agentId in webhook body)
      if (activeToolDefinitions.length > 0) {
        const webhookUrlWithAgent = `${backendUrl}/api/elevenlabs/webhook?agentId=${elevenLabsAgentId}`;
        const updatedWebhookTools = activeToolDefinitions.map(tool => ({
          type: 'webhook',
          name: tool.function.name,
          description: tool.function.description,
          api_schema: {
            url: webhookUrlWithAgent,
            method: 'POST',
            request_body_schema: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  constant_value: tool.function.name
                },
                ...Object.fromEntries(
                  Object.entries(tool.function.parameters.properties || {}).map(([key, value]) => [
                    key,
                    {
                      type: value.type || 'string',
                      description: value.description || ''
                    }
                  ])
                )
              },
              required: tool.function.parameters.required || []
            }
          }
        }));

        // Update agent with correct webhook URLs including agentId
        const allToolsWithAgentId = [...systemTools, ...updatedWebhookTools];
        await elevenLabsService.updateAgent(elevenLabsAgentId, {
          conversation_config: {
            agent: {
              prompt: {
                tools: allToolsWithAgentId
              }
            }
          }
        });
        console.log('✅ 11Labs Agent tools updated with agentId in webhook URLs');
      }

      // Workspace sync already done before agent create (pre-sync above)
      const webhookDiagnostics = await elevenLabsService.getWebhookDiagnostics({
        agentId: elevenLabsAgentId,
        backendUrl
      });
      console.log('🧪 [11Labs] Webhook diagnostics checks:', webhookDiagnostics.checks);
    } catch (elevenLabsError) {
      console.error('❌ 11Labs Agent creation failed:', elevenLabsError.response?.data || elevenLabsError.message);

      // Persist to ErrorLog
      import('../services/errorLogger.js')
        .then(({ logApiError, EXTERNAL_SERVICE }) => {
          logApiError(EXTERNAL_SERVICE.ELEVENLABS, elevenLabsError, {
            source: 'routes/assistant',
            endpoint: req.path,
            method: req.method,
            businessId: req.businessId,
            errorCode: 'ELEVENLABS_CREATE_FAILED',
            externalStatus: elevenLabsError.response?.status,
          }).catch(() => {});
        })
        .catch(() => {});

      return res.status(500).json({
        error: 'Failed to create assistant connection',
        details: elevenLabsError.response?.data || elevenLabsError.message
      });
    }
    } // end if (!isTextAssistant) — 11Labs block

    // ✅ Database'e kaydet (text veya phone)
    // Save effectiveCallDirection so promptBuilder uses correct prompt on updates too
    const assistant = await prisma.assistant.create({
      data: {
        businessId,
        name,
        assistantType,
        voiceId: isTextAssistant ? null : (voiceId || defaults.voice),
        systemPrompt: fullSystemPrompt,
        model: model || 'gpt-4',
        elevenLabsAgentId,
        timezone: businessTimezone,
        firstMessage: finalFirstMessage,
        tone: tone || 'professional',
        customNotes: customNotes || null,
        userInstructions: systemPrompt || null, // Store user's original instructions separately
        callDirection: effectiveCallDirection,
        channelCapabilities: finalChannelCapabilities,
        callPurpose: isTextAssistant ? null : (callPurpose || null),
        dynamicVariables: isTextAssistant ? [] : (dynamicVariables || []),
      },
    });

    await prisma.business.update({
      where: { id: businessId },
      data: {
        ...(timezone && { timezone }),
        ...(industry && { businessType: industry }),
        ...(country && { country }),
        ...(lang && { language: lang })
      }
    });

    // V1 outbound-only: never auto-assign assistants to phone numbers.
    console.log('📱 Assistant created without phone number auto-assignment');

    // ✅ YENİ: Mevcut Knowledge Base içeriklerini yeni asistana ekle
    if (elevenLabsAgentId) {
      try {
        const existingKBs = await prisma.knowledgeBase.findMany({
          where: { businessId, status: 'ACTIVE' }
        });

        if (existingKBs.length > 0) {
          console.log(`📚 Syncing ${existingKBs.length} existing KB items to new assistant...`);

          for (const kb of existingKBs) {
            try {
              let kbContent = '';
              let kbName = kb.title || 'Knowledge Item';

              if (kb.type === 'FAQ' && kb.question && kb.answer) {
                kbContent = `Q: ${kb.question}\nA: ${kb.answer}`;
                kbName = `FAQ: ${kb.question.substring(0, 50)}`;
              } else if (kb.type === 'URL' && kb.url) {
                // For URLs, let 11Labs fetch directly
                await elevenLabsService.addKnowledgeDocument(elevenLabsAgentId, {
                  name: kbName,
                  url: kb.url
                });
                console.log(`✅ URL KB synced to new assistant: ${kbName}`);
                continue;
              } else if (kb.content) {
                kbContent = kb.content;
              }

              if (kbContent) {
                await elevenLabsService.addKnowledgeDocument(elevenLabsAgentId, {
                  name: kbName,
                  content: kbContent
                });
                console.log(`✅ KB synced to new assistant: ${kbName}`);
              }
            } catch (kbError) {
              console.error(`⚠️ Failed to sync KB "${kb.title}" to new assistant:`, kbError.message);
              // Continue with other KBs even if one fails
            }
          }
        }
      } catch (kbSyncError) {
        console.error('⚠️ Failed to sync existing KBs to new assistant:', kbSyncError);
        // Don't fail the request, just log the error
      }
    }

    console.log('✅ Assistant saved to DB:', {
      id: assistant.id,
      name: assistant.name,
      elevenLabsAgentId: assistant.elevenLabsAgentId
    });

    res.json({
      message: 'Assistant created successfully',
      assistant,
    });
  } catch (error) {
    console.error('Error creating assistant:', error);

    import('../services/errorLogger.js')
      .then(({ logAssistantError }) => {
        logAssistantError(error, {
          endpoint: req.path,
          method: req.method,
          businessId: req.businessId,
          errorCode: 'ASSISTANT_CREATE_FAILED',
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(500).json({ error: 'Failed to create assistant' });
  }
});


// Test call yap
const VALID_CALL_TYPES = ['BILLING_REMINDER', 'APPOINTMENT_REMINDER', 'SHIPPING_UPDATE'];

router.post('/test-call', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { phoneNumber, callType, phoneNumberId } = req.body;

    // callType is required for outbound V1 so we know which flow runs
    if (!callType || !VALID_CALL_TYPES.includes(callType)) {
      return res.status(400).json({
        error: 'callType is required',
        validTypes: VALID_CALL_TYPES,
        example: { phoneNumber: '+905551234567', callType: 'BILLING_REMINDER' }
      });
    }

    const outboundAccess = await resolvePhoneOutboundAccessForBusinessId(businessId);

    if (!outboundAccess.hasAccess) {
      if (outboundAccess.reasonCode === 'NO_SUBSCRIPTION') {
        return res.status(403).json({
          error: 'NO_SUBSCRIPTION',
          message: 'No active subscription found for outbound test calls.',
          messageTR: 'Outbound test araması için aktif abonelik bulunamadı.'
        });
      }

      if (outboundAccess.reasonCode === 'SUBSCRIPTION_INACTIVE') {
        return res.status(403).json({
          error: 'SUBSCRIPTION_INACTIVE',
          status: outboundAccess.status,
          message: 'Subscription is not active.',
          messageTR: 'Abonelik aktif değil.'
        });
      }

      const reasonCode = outboundAccess.reasonCode || 'OUTBOUND_DISABLED';

      let message = 'Outbound test call is disabled for your current configuration.';
      let messageTR = 'Outbound test araması mevcut yapılandırmada kapalı.';

      if (reasonCode === 'PLAN_DISABLED') {
        message = `Outbound test call is disabled for ${outboundAccess.plan}.`;
        messageTR = `Outbound test araması ${outboundAccess.plan} planında kapalı.`;
      } else if (reasonCode === 'V1_OUTBOUND_ONLY') {
        message = 'Outbound is disabled while inbound is disabled in V1 mode.';
        messageTR = 'V1 modunda inbound kapalıyken outbound da kapalıdır.';
      } else if (reasonCode === 'BUSINESS_DISABLED') {
        message = 'Outbound is disabled because inbound is disabled for this business.';
        messageTR = 'Bu işletmede inbound kapalı olduğu için outbound da kapalıdır.';
      }

      return res.status(403).json({
        error: 'OUTBOUND_TEST_CALL_NOT_ALLOWED',
        reasonCode,
        requiredPlan: outboundAccess.requiredPlan,
        message,
        messageTR
      });
    }

    // Get assistant for this business
    const assistant = await prisma.assistant.findFirst({
      where: {
        businessId,
        isActive: true,
        channelCapabilities: {
          has: ASSISTANT_CHANNEL_CAPABILITIES.PHONE_OUTBOUND
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!assistant) {
      return res.status(400).json({ error: 'No assistant configured' });
    }

    if (!assistant.elevenLabsAgentId) {
      return res.status(400).json({ error: 'Assistant is not ready for calls' });
    }

    // Get phone number for outbound call
    const fromPhoneNumber = phoneNumberId
      ? await prisma.phoneNumber.findFirst({
        where: {
          id: phoneNumberId,
          businessId,
          status: 'ACTIVE'
        }
      })
      : await prisma.phoneNumber.findFirst({
        where: { businessId, status: 'ACTIVE' },
        orderBy: [
          { isDefaultOutbound: 'desc' },
          { createdAt: 'asc' }
        ]
      });

    if (!fromPhoneNumber || !fromPhoneNumber.elevenLabsPhoneId) {
      return res.status(400).json({ error: 'No phone number configured' });
    }

    // P0.2: Use safeCallInitiator instead of direct 11Labs call
    const { initiateOutboundCallSafe, capacityErrorHandler } = await import('../services/safeCallInitiator.js');

    const result = await initiateOutboundCallSafe({
      businessId,
      agentId: assistant.elevenLabsAgentId,
      phoneNumberId: fromPhoneNumber.elevenLabsPhoneId,
      toNumber: phoneNumber,
      clientData: { test: true, assistantId: assistant.id, call_type: callType, phone_outbound_v1: true }
    });

    if (!result.success) {
      return res.status(503).json({
        error: result.error,
        message: result.message,
        retryAfter: result.retryAfter,
        ...result.details
      });
    }

    res.json({
      success: true,
      call: result.call,
      slotInfo: result.slotInfo
    });

  } catch (error) {
    console.error('Test call error:', error);

    // P0.2: Handle capacity errors with proper HTTP response
    const { CapacityError } = await import('../services/safeCallInitiator.js');
    if (error instanceof CapacityError) {
      const statusCode = error.code === 'ELEVENLABS_429_RATE_LIMIT' ? 429 : 503;
      return res.status(statusCode).json({
        error: error.code,
        message: error.message,
        retryAfter: error.retryAfter,
        ...error.details
      });
    }

    res.status(500).json({ error: 'Failed to initiate test call' });
  }
});

// PUT /api/assistants/:id - Update assistant
router.put('/:id', authenticateToken, checkPermission('assistants:edit'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;
    const { name, voiceId, systemPrompt, firstMessage, model, language, tone, customNotes, callDirection, callPurpose, dynamicVariables, channelCapabilities } = req.body;

    // Validate assistant name length if provided
    if (name && name.length > 25) {
      return res.status(400).json({
        error: 'Assistant name must be 25 characters or less',
        errorTR: 'Asistan adı en fazla 25 karakter olabilir'
      });
    }

    // Check if assistant belongs to this business
    const assistant = await prisma.assistant.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
      },
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // assistantType is immutable — set at creation, never changed
    const isTextAssistant = assistant.assistantType === 'text';
    const inboundEnabled = isPhoneInboundEnabledForBusinessRecord(req.user?.business);
    const currentDirection = assistant.callDirection || 'outbound';
    const requestedDirection = callDirection !== undefined ? callDirection : currentDirection;

    if (requestedDirection === 'inbound' && !inboundEnabled) {
      return sendOutboundOnlyV1(res);
    }

    // Block unknown directions.
    if (!isAllowedDirection(requestedDirection)) {
      return sendOutboundOnlyV1(res);
    }

    // Get business info with integrations for promptBuilder
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrations: { where: { isActive: true } } }
    });

    // Get 11Labs voice ID from central mapping
    const elevenLabsVoiceId = getElevenLabsVoiceId(voiceId, language || business?.language);

    // Determine effective callDirection based on callPurpose
    // For outbound calls, callPurpose determines the actual callDirection for prompt selection
    // 3 main purposes: sales, collection, general
    const effectivePurpose = callPurpose !== undefined ? callPurpose : assistant.callPurpose;
    let effectiveCallDirection = callDirection || assistant.callDirection || 'outbound';
    if (effectiveCallDirection === 'outbound' && effectivePurpose) {
      // Map callPurpose to specific callDirection for promptBuilder
      if (effectivePurpose === 'sales') {
        effectiveCallDirection = 'outbound_sales';
      } else if (effectivePurpose === 'collection') {
        effectiveCallDirection = 'outbound_collection';
      } else if (effectivePurpose === 'general') {
        effectiveCallDirection = 'outbound_general';
      }
      console.log('📞 Outbound call purpose mapping (update):', effectivePurpose, '->', effectiveCallDirection);
    }

    const finalChannelCapabilities = normalizeChannelCapabilities(
      channelCapabilities !== undefined ? channelCapabilities : assistant.channelCapabilities,
      getDefaultCapabilitiesForCallDirection(effectiveCallDirection)
    );

    const baseUserInstructions = systemPrompt !== undefined
      ? (systemPrompt || null)
      : (assistant.userInstructions || null);

    // Build full system prompt using promptBuilder
    const tempAssistant = {
      name,
      assistantType: assistant.assistantType,
      systemPrompt: baseUserInstructions,
      tone: tone || assistant.tone || 'professional',
      customNotes: customNotes !== undefined ? customNotes : assistant.customNotes,
      callDirection: effectiveCallDirection
    };

    // Get active tools list for prompt builder
    const activeToolsList = getPromptBuilderTools(business, business.integrations || []);

    // Keep the phone prompt lean; ElevenLabs knowledge base already handles KB retrieval.
    const fullSystemPrompt = buildAssistantPrompt(tempAssistant, business, activeToolsList);

    const resolvedFirstMessage = resolveStoredFirstMessage({
      callDirection: effectiveCallDirection,
      assistantType: assistant.assistantType,
      providedFirstMessage: firstMessage,
      fallbackFirstMessage: assistant.firstMessage
    });

    // Update in database
    const updateData = {
      name,
      systemPrompt: fullSystemPrompt,
      tone: tone || assistant.tone || 'professional',
      customNotes: customNotes !== undefined ? customNotes : assistant.customNotes,
      userInstructions: baseUserInstructions,
    };

    if (isTextAssistant) {
      // Text: only update text-relevant fields, keep channelCapabilities
      updateData.channelCapabilities = [ASSISTANT_CHANNEL_CAPABILITIES.CHAT, ASSISTANT_CHANNEL_CAPABILITIES.WHATSAPP, ASSISTANT_CHANNEL_CAPABILITIES.EMAIL];
    } else {
      // Phone: update all phone-related fields
      updateData.voiceId = voiceId;
      updateData.firstMessage = resolvedFirstMessage;
      updateData.model = model;
      updateData.callDirection = effectiveCallDirection;
      updateData.channelCapabilities = finalChannelCapabilities;
      updateData.callPurpose = callPurpose !== undefined ? callPurpose : assistant.callPurpose;
      updateData.dynamicVariables = dynamicVariables || assistant.dynamicVariables || [];
    }

    const updatedAssistant = await prisma.assistant.update({
      where: { id },
      data: updateData,
    });

// ✅ Update 11Labs agent (phone assistants only)
    console.log('🔄 Checking 11Labs update - elevenLabsAgentId:', assistant.elevenLabsAgentId);
    if (!isTextAssistant && assistant.elevenLabsAgentId) {
      try {
        const lang = language || business?.language || 'TR';
        const elevenLabsLang = getElevenLabsLanguage(lang);
        console.log('📝 Update language mapping:', lang, '->', elevenLabsLang);
        console.log('🔧 Updating 11Labs agent:', assistant.elevenLabsAgentId);

        const systemTools = buildPhoneSystemTools({ callDirection: effectiveCallDirection });

        // Webhook tools - inline in agent config
        const backendUrl = runtimeConfig.backendUrl;
        // IMPORTANT: Include agentId in webhook URL since 11Labs doesn't send it in body
        const webhookUrl = `${backendUrl}/api/elevenlabs/webhook?agentId=${assistant.elevenLabsAgentId}`;
        const activeToolDefinitions = getActiveTools(business);

        const webhookTools = activeToolDefinitions.map(tool => ({
          type: 'webhook',
          name: tool.function.name,
          description: tool.function.description,
          api_schema: {
            url: webhookUrl,
            method: 'POST',
            request_body_schema: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  constant_value: tool.function.name
                },
                ...Object.fromEntries(
                  Object.entries(tool.function.parameters.properties || {}).map(([key, value]) => [
                    key,
                    {
                      type: value.type || 'string',
                      description: value.description || '',
                      ...(value.enum ? { enum: value.enum } : {})
                    }
                  ])
                )
              },
              required: tool.function.parameters.required || []
            }
          }
        }));

        // All tools: system + webhook
        const allTools = [...systemTools, ...webhookTools];
        console.log('🔧 Updating tools for agent:', allTools.map(t => t.name));

        // Build language-specific analysis prompts for post-call summary
        const analysisPrompts = {
          tr: {
            transcript_summary: 'Bu görüşmenin kısa bir özetini Türkçe olarak yaz. Müşterinin amacını, konuşulan konuları ve sonucu belirt.',
            success_evaluation: 'Görüşme başarılı mı? Müşterinin talebi karşılandı mı?'
          },
          en: {
            transcript_summary: 'Write a brief summary of this conversation. State the customer purpose, topics discussed, and outcome.',
            success_evaluation: 'Was the conversation successful? Was the customer request fulfilled?'
          }
        };
        const langAnalysis = analysisPrompts[elevenLabsLang] || analysisPrompts.en;

        // Sync workspace webhooks BEFORE agent update to get postCallWebhookId
        let postCallWebhookId = process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID || null;
        try {
          const workspaceSync = await elevenLabsService.ensureWorkspaceWebhookRouting({ backendUrl });
          if (workspaceSync.ok) {
            postCallWebhookId = postCallWebhookId || workspaceSync.postCallWebhookId || null;
            console.log(`✅ [11Labs] Workspace webhook pre-sync ${workspaceSync.changed ? 'updated' : 'verified'} (postCallWebhookId=${postCallWebhookId || 'none'})`);
          } else {
            console.warn('⚠️ [11Labs] Workspace webhook pre-sync failed (update):', workspaceSync.error);
          }
        } catch (syncErr) {
          console.warn('⚠️ [11Labs] Workspace webhook pre-sync error (update):', syncErr.message);
        }

        const providerFirstMessage = resolveProviderFirstMessage({
          callDirection: effectiveCallDirection,
          assistantType: assistant.assistantType,
          storedFirstMessage: resolvedFirstMessage,
          clearExisting: true
        });

        const agentUpdateConfig = {
          name,
          conversation_config: {
            agent: {
              prompt: {
                prompt: fullSystemPrompt,
                llm: 'gemini-2.5-flash',
                temperature: 0.1,
                // All tools: system + webhook (inline)
                tools: allTools
              },
              ...(providerFirstMessage !== undefined ? { first_message: providerFirstMessage } : {}),
              language: elevenLabsLang
            },
            tts: {
              voice_id: elevenLabsVoiceId,
              model_id: 'eleven_turbo_v2_5',
              stability: 0.4,
              similarity_boost: 0.6,
              style: 0.15,
              optimize_streaming_latency: 3
            },
            stt: {
              provider: 'elevenlabs',
              model: 'scribe_v1',
              language: elevenLabsLang
            },
            turn: {
              mode: 'turn',
              turn_timeout: 8,
              turn_eagerness: 'normal',
              silence_end_call_timeout: 30
            },
            analysis: {
              transcript_summary_prompt: langAnalysis.transcript_summary,
              success_evaluation_prompt: langAnalysis.success_evaluation
            }
          },
          platform_settings: {
            workspace_overrides: {
              conversation_initiation_client_data_webhook: {
                url: `${backendUrl}/api/elevenlabs/webhook`,
                request_headers: {}
              },
              ...(postCallWebhookId ? {
                webhooks: {
                  post_call_webhook_id: postCallWebhookId,
                  events: ['transcript', 'call_initiation_failure'],
                  send_audio: false
                }
              } : {})
            }
          }
        };

        console.log('🔍 DEBUG - agentUpdateConfig platform_settings:', JSON.stringify(agentUpdateConfig.platform_settings));

        await elevenLabsService.updateAgent(assistant.elevenLabsAgentId, agentUpdateConfig);
        console.log('✅ 11Labs Agent updated with inline tools');

        // V1 outbound-only: phone number-agent sync is intentionally disabled.
        console.log('📞 Skipping phone number-agent sync (V1 outbound-only mode)');

        const webhookDiagnostics = await elevenLabsService.getWebhookDiagnostics({
          agentId: assistant.elevenLabsAgentId,
          backendUrl
        });
        console.log('🧪 [11Labs] Webhook diagnostics checks after update:', webhookDiagnostics.checks);
      } catch (updateError) {
        console.error('❌ 11Labs update failed:', updateError.response?.data || updateError.message);

        import('../services/errorLogger.js')
          .then(({ logApiError, EXTERNAL_SERVICE }) => {
            logApiError(EXTERNAL_SERVICE.ELEVENLABS, updateError, {
              source: 'routes/assistant',
              endpoint: req.path,
              method: req.method,
              businessId: req.businessId,
              errorCode: 'ELEVENLABS_UPDATE_FAILED',
              externalStatus: updateError.response?.status,
            }).catch(() => {});
          })
          .catch(() => {});

        // Don't fail the request, but warn in response
        return res.json({
          message: 'Assistant updated in database but sync failed',
          assistant: updatedAssistant,
          warning: 'Sync failed: ' + (updateError.response?.data?.detail || updateError.message)
        });
      }
    } else if (!isTextAssistant) {
      console.warn('⚠️ No elevenLabsAgentId found for assistant:', assistant.id);
    }

    res.json({
      message: 'Assistant updated successfully',
      assistant: updatedAssistant,
    });
  } catch (error) {
    console.error('Error updating assistant:', error);
    res.status(500).json({ error: 'Failed to update assistant' });
  }
});

// DELETE /api/assistants/:id - Delete assistant
router.delete('/:id', authenticateToken, checkPermission('assistants:edit'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    // Check if assistant belongs to this business
    const assistant = await prisma.assistant.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // ✅ YENİ: 11Labs'den de sil
    if (assistant.elevenLabsAgentId) {
      try {
        await elevenLabsService.deleteAgent(assistant.elevenLabsAgentId);
        console.log('✅ 11Labs Agent deleted:', assistant.elevenLabsAgentId);
      } catch (elevenLabsError) {
        console.error('11Labs delete error (continuing anyway):', elevenLabsError);
      }
    }

    // Clear assistantId from any PhoneNumber records that reference this assistant
    await prisma.phoneNumber.updateMany({
      where: { assistantId: id },
      data: { assistantId: null },
    });

    // Delete from database (soft delete)
    await prisma.assistant.update({
      where: { id },
      data: { isActive: false },
    });

    await prisma.business.updateMany({
      where: {
        id: businessId,
        chatAssistantId: id
      },
      data: {
        chatAssistantId: null
      }
    });

    res.json({ message: 'Assistant deleted successfully' });
  } catch (error) {
    console.error('Error deleting assistant:', error);
    res.status(500).json({ error: 'Failed to delete assistant' });
  }
});

// GET /api/assistants/:id/debug - Debug 11Labs agent status
router.get('/:id/debug', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    const assistant = await prisma.assistant.findFirst({
      where: { id, businessId, isActive: true },
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    if (!assistant.elevenLabsAgentId) {
      return res.status(400).json({ error: 'No connected assistant ID' });
    }

    // Get agent from 11Labs
    const agent = await elevenLabsService.getAgent(assistant.elevenLabsAgentId);

    // Extract tool info
    const toolIds = agent.tool_ids || [];
    const inlineTools = agent.conversation_config?.agent?.prompt?.tools || [];

    res.json({
      assistant: {
        id: assistant.id,
        name: assistant.name,
        elevenLabsAgentId: assistant.elevenLabsAgentId,
        createdAt: assistant.createdAt
      },
      elevenLabs: {
        agentId: agent.agent_id,
        name: agent.name,
        tool_ids: toolIds,
        tool_ids_count: toolIds.length,
        inline_tools: inlineTools.map(t => ({ name: t.name, type: t.type })),
        inline_tools_count: inlineTools.length,
        hasToolIdsProblem: toolIds.length > 0,
        hasInlineTools: inlineTools.length > 0
      },
      diagnosis: toolIds.length > 0
        ? '⚠️ Agent uses tool_ids (may cause Unknown tool error). Run SYNC to fix.'
        : inlineTools.length > 0
          ? '✅ Agent uses inline tools (correct setup)'
          : '❌ Agent has no tools at all!'
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/assistants/:id/sync - Sync assistant to 11Labs (fix tools)
router.post('/:id/sync', authenticateToken, checkPermission('assistants:edit'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { id } = req.params;

    // Get assistant with business info
    const assistant = await prisma.assistant.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
      },
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    if (assistant.assistantType === 'text') {
      return res.status(400).json({ error: 'Text assistants do not support sync' });
    }

    // Get business with integrations
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrations: { where: { isActive: true } } }
    });
    const activeKnowledgeItems = await prisma.knowledgeBase.findMany({
      where: { businessId, status: 'ACTIVE' }
    });
    const activeKnowledgeNames = getActiveKnowledgeItemNames(activeKnowledgeItems);
    const cleanSystemPrompt = buildPhoneAssistantPromptFromState(assistant, business, business.integrations || []);

    const lang = business?.language || 'TR';
    const elevenLabsLang = getElevenLabsLanguage(lang);
    const elevenLabsVoiceId = getElevenLabsVoiceId(assistant.voiceId, lang);
    const normalizedFirstMessage = resolveStoredFirstMessage({
      callDirection: assistant.callDirection,
      assistantType: assistant.assistantType,
      providedFirstMessage: assistant.firstMessage,
      fallbackFirstMessage: assistant.firstMessage
    });
    const providerFirstMessage = resolveProviderFirstMessage({
      callDirection: assistant.callDirection,
      assistantType: assistant.assistantType,
      storedFirstMessage: normalizedFirstMessage,
      clearExisting: true
    });

    console.log('🔄 Syncing assistant to 11Labs:', assistant.id, '->', assistant.elevenLabsAgentId);

    if (normalizedFirstMessage !== assistant.firstMessage) {
      await prisma.assistant.update({
        where: { id: assistant.id },
        data: { firstMessage: normalizedFirstMessage }
      });
      assistant.firstMessage = normalizedFirstMessage;
    }

    if (cleanSystemPrompt !== assistant.systemPrompt) {
      await prisma.assistant.update({
        where: { id: assistant.id },
        data: { systemPrompt: cleanSystemPrompt }
      });
      assistant.systemPrompt = cleanSystemPrompt;
    }

    const systemTools = buildPhoneSystemTools({ callDirection: assistant.callDirection });

    const backendUrl = runtimeConfig.backendUrl;
    const activeToolDefinitions = getActiveTools(business);
    const buildWebhookToolsForAgent = (agentIdForWebhook = null) => {
      const webhookUrl = agentIdForWebhook
        ? `${backendUrl}/api/elevenlabs/webhook?agentId=${agentIdForWebhook}`
        : `${backendUrl}/api/elevenlabs/webhook`;

      return activeToolDefinitions.map(tool => ({
        type: 'webhook',
        name: tool.function.name,
        description: tool.function.description,
        api_schema: {
          url: webhookUrl,
          method: 'POST',
          request_body_schema: {
            type: 'object',
            properties: {
              tool_name: {
                type: 'string',
                constant_value: tool.function.name
              },
              ...Object.fromEntries(
                Object.entries(tool.function.parameters.properties || {}).map(([key, value]) => [
                  key,
                  {
                    type: value.type || 'string',
                    description: value.description || '',
                    ...(value.enum ? { enum: value.enum } : {})
                  }
                ])
              )
            },
            required: tool.function.parameters.required || []
          }
        }
      }));
    };

    const buildAllToolsForAgent = (agentIdForWebhook = null) => [
      ...systemTools,
      ...buildWebhookToolsForAgent(agentIdForWebhook)
    ];

    // Language-specific analysis prompts
    const analysisPrompts = {
      tr: {
        transcript_summary: 'Bu görüşmenin kısa bir özetini Türkçe olarak yaz. Müşterinin amacını, konuşulan konuları ve sonucu belirt.',
        success_evaluation: 'Görüşme başarılı mı? Müşterinin talebi karşılandı mı?'
      },
      en: {
        transcript_summary: 'Write a brief summary of this conversation. State the customer purpose, topics discussed, and outcome.',
        success_evaluation: 'Was the conversation successful? Was the customer request fulfilled?'
      }
    };
    const langAnalysis = analysisPrompts[elevenLabsLang] || analysisPrompts.en;

    const buildAgentSyncConfig = ({ agentIdForWebhook = null, postCallWebhookId = null, knowledgeBase = null } = {}) => ({
      name: assistant.name,
      conversation_config: {
        agent: {
          prompt: {
            prompt: assistant.systemPrompt,
            llm: 'gemini-2.5-flash',
            temperature: 0.1,
            tools: buildAllToolsForAgent(agentIdForWebhook),
            ...(knowledgeBase !== null ? { knowledge_base: knowledgeBase } : {})
          },
          ...(providerFirstMessage !== undefined ? { first_message: providerFirstMessage } : {}),
          language: elevenLabsLang
        },
        tts: {
          voice_id: elevenLabsVoiceId,
          model_id: 'eleven_turbo_v2_5',
          stability: 0.4,
          similarity_boost: 0.6,
          style: 0.15,
          optimize_streaming_latency: 3
        },
        stt: {
          provider: 'elevenlabs',
          model: 'scribe_v1',
          language: elevenLabsLang
        },
        turn: {
          mode: 'turn',
          turn_timeout: 8,
          turn_eagerness: 'normal',
          silence_end_call_timeout: 30
        },
        analysis: {
          transcript_summary_prompt: langAnalysis.transcript_summary,
          success_evaluation_prompt: langAnalysis.success_evaluation
        }
      },
      ...(postCallWebhookId ? {
        platform_settings: {
          workspace_overrides: {
            conversation_initiation_client_data_webhook: {
              url: `${backendUrl}/api/elevenlabs/webhook`,
              request_headers: {}
            },
            webhooks: {
              post_call_webhook_id: postCallWebhookId,
              events: ['transcript', 'call_initiation_failure'],
              send_audio: false
            }
          }
        }
      } : {})
    });

    let targetAgentId = assistant.elevenLabsAgentId || null;
    let agentMissingInElevenLabs = !targetAgentId;
    let recreated = false;
    let syncedKnowledgeBase = [];

    if (targetAgentId) {
      try {
        const currentAgent = await elevenLabsService.getAgent(targetAgentId);
        const currentToolIds = currentAgent.tool_ids || [];
        const currentInlineTools = currentAgent.conversation_config?.agent?.prompt?.tools || [];
        const currentKnowledgeBase = currentAgent.conversation_config?.agent?.prompt?.knowledge_base || [];
        const filteredKnowledgeBase = filterKnowledgeBaseEntriesForBusiness(currentKnowledgeBase, activeKnowledgeNames);
        const removedKnowledgeEntries = currentKnowledgeBase.length - filteredKnowledgeBase.length;
        console.log('📊 CURRENT AGENT STATE:');
        console.log('   - tool_ids:', currentToolIds.length > 0 ? currentToolIds : 'none');
        console.log('   - inline_tools:', currentInlineTools.length > 0 ? currentInlineTools.map(t => t.name) : 'none');
        console.log('   - knowledge_base:', currentKnowledgeBase.length > 0 ? currentKnowledgeBase.map(kb => kb.name) : 'none');
        if (removedKnowledgeEntries > 0) {
          console.log(`   - stale_knowledge_removed_on_sync: ${removedKnowledgeEntries}`);
        }
        if (currentToolIds.length > 0) {
          console.log('   ⚠️ PROBLEM: Agent has tool_ids which may be broken!');
        }
        syncedKnowledgeBase = filteredKnowledgeBase;
      } catch (checkErr) {
        if (isElevenLabsNotFound(checkErr)) {
          agentMissingInElevenLabs = true;
          console.warn(`⚠️ 11Labs agent not found during sync, will recreate: ${targetAgentId}`);
        } else {
          console.warn('⚠️ Could not check current agent state:', checkErr.message);
        }
      }
    }

    if (!agentMissingInElevenLabs && targetAgentId) {
      try {
        await elevenLabsService.updateAgent(targetAgentId, {
          tool_ids: []
        });
        console.log('✅ Cleared tool_ids from agent');
      } catch (clearError) {
        if (isElevenLabsNotFound(clearError)) {
          agentMissingInElevenLabs = true;
          console.warn(`⚠️ 11Labs agent disappeared while clearing tool_ids, will recreate: ${targetAgentId}`);
        } else {
          console.warn('⚠️ Could not clear tool_ids (may not exist):', clearError.message);
        }
      }
    }

    if (!agentMissingInElevenLabs && targetAgentId) {
      try {
        const agentUpdateConfig = buildAgentSyncConfig({
          agentIdForWebhook: targetAgentId,
          knowledgeBase: syncedKnowledgeBase
        });
        const allTools = buildAllToolsForAgent(targetAgentId);
        console.log('🔧 Tools to sync:', allTools.map(t => t.name));
        await elevenLabsService.updateAgent(targetAgentId, agentUpdateConfig);
        console.log('✅ 11Labs Agent synced with inline tools');
      } catch (syncError) {
        if (isElevenLabsNotFound(syncError)) {
          agentMissingInElevenLabs = true;
          console.warn(`⚠️ 11Labs agent not found during sync update, will recreate: ${targetAgentId}`);
        } else {
          throw syncError;
        }
      }
    }

    if (agentMissingInElevenLabs) {
      let postCallWebhookId = process.env.ELEVENLABS_POST_CALL_WEBHOOK_ID || null;
      try {
        const workspaceSync = await elevenLabsService.ensureWorkspaceWebhookRouting({ backendUrl });
        if (workspaceSync.ok) {
          postCallWebhookId = postCallWebhookId || workspaceSync.postCallWebhookId || null;
          console.log(`✅ [11Labs] Workspace webhook pre-sync ${workspaceSync.changed ? 'updated' : 'verified'} (postCallWebhookId=${postCallWebhookId || 'none'})`);
        } else {
          console.warn('⚠️ [11Labs] Workspace webhook pre-sync failed during recreate:', workspaceSync.error);
        }
      } catch (syncErr) {
        console.warn('⚠️ [11Labs] Workspace webhook pre-sync error during recreate:', syncErr.message);
      }

      const createConfig = buildAgentSyncConfig({
        agentIdForWebhook: null,
        postCallWebhookId,
        knowledgeBase: []
      });

      const createdAgent = await elevenLabsService.createAgent(createConfig);
      targetAgentId = createdAgent.agent_id;
      recreated = true;
      console.log(`✅ Recreated 11Labs agent during sync: ${targetAgentId}`);

      if (activeKnowledgeItems.length > 0) {
        console.log(`📚 Re-syncing ${activeKnowledgeItems.length} KB items to recreated assistant...`);
        for (const kb of activeKnowledgeItems) {
          try {
            let kbContent = '';
            let kbName = getKnowledgeItemSyncName(kb) || 'Knowledge Item';

            if (kb.type === 'FAQ' && kb.question && kb.answer) {
              kbContent = `Q: ${kb.question}\nA: ${kb.answer}`;
            } else if (kb.type === 'URL' && kb.url) {
              await elevenLabsService.addKnowledgeDocument(targetAgentId, {
                name: kbName,
                url: kb.url
              });
              continue;
            } else if (kb.content) {
              kbContent = kb.content;
            }

            if (kbContent) {
              await elevenLabsService.addKnowledgeDocument(targetAgentId, {
                name: kbName,
                content: kbContent
              });
            }
          } catch (kbError) {
            console.error(`⚠️ Failed to sync KB "${kb.title}" to recreated assistant:`, kbError.message);
          }
        }
      }

      if (activeToolDefinitions.length > 0) {
        await elevenLabsService.updateAgent(targetAgentId, {
          conversation_config: {
            agent: {
              prompt: {
                tools: buildAllToolsForAgent(targetAgentId)
              }
            }
          }
        });
        console.log('✅ Recreated agent webhook URLs updated with agentId');
      }

      await prisma.assistant.update({
        where: { id: assistant.id },
        data: { elevenLabsAgentId: targetAgentId }
      });
      assistant.elevenLabsAgentId = targetAgentId;
    }

    res.json({
      success: true,
      message: recreated
        ? 'Assistant reconnected and synced successfully'
        : 'Assistant synced successfully',
      recreated
    });

  } catch (error) {
    console.error('Error syncing assistant:', error);

    import('../services/errorLogger.js')
      .then(({ logApiError, EXTERNAL_SERVICE }) => {
        logApiError(EXTERNAL_SERVICE.ELEVENLABS, error, {
          source: 'routes/assistant',
          endpoint: req.path,
          method: req.method,
          businessId: req.businessId,
          errorCode: 'ELEVENLABS_SYNC_FAILED',
          externalStatus: error.response?.status,
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(500).json({ error: 'Failed to sync assistant: ' + (error.response?.data?.detail || error.message) });
  }
});

// GET /api/assistants/templates - Get assistant templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const { language } = req.query; // Optional language filter

    const templates = [
      // English Templates
      {
        id: 'restaurant-en',
        name: 'Restaurant Reservation',
        language: 'EN',
        industry: 'Restaurant',
        voiceId: 'en-f-kayla',
        description: 'AI assistant that handles restaurant reservations, answers menu questions, and manages booking inquiries.',
        systemPrompt: `You are a friendly and professional restaurant receptionist AI. Your job is to:
1. Greet customers warmly
2. Take reservations - ask for name, party size, date, time, and any special requests
3. Answer questions about the menu, hours, location, and parking
4. Handle cancellations and modifications
5. Suggest popular dishes when asked

Always be polite, patient, and helpful. If you can't answer something, offer to have a manager call them back.`
      },
      {
        id: 'salon-en',
        name: 'Salon Appointment',
        language: 'EN',
        industry: 'Salon',
        voiceId: 'en-f-shelby',
        description: 'AI assistant for beauty salons that books appointments, describes services, and handles scheduling.',
        systemPrompt: `You are a friendly salon receptionist AI. Your responsibilities include:
1. Greeting clients warmly
2. Booking appointments - ask for name, phone, desired service, stylist preference, date and time
3. Explaining services and pricing
4. Handling rescheduling and cancellations
5. Recommending services based on client needs

Be warm, professional, and make clients feel valued. Confirm all booking details before ending the call.`
      },
      {
        id: 'ecommerce-en',
        name: 'E-commerce Support',
        language: 'EN',
        industry: 'E-commerce',
        voiceId: 'en-m-jude',
        description: 'AI assistant for online stores that handles order inquiries, returns, and product questions.',
        systemPrompt: `You are a helpful e-commerce customer support AI. Your duties include:
1. Helping customers track their orders
2. Processing return and exchange requests
3. Answering product questions
4. Explaining shipping policies and timeframes
5. Handling billing inquiries

Always ask for order number or email to assist better. Be patient and solution-oriented.`
      },
      
      // Turkish Templates
      {
        id: 'restaurant-tr',
        name: 'Restoran Rezervasyonu',
        language: 'TR',
        industry: 'Restaurant',
        voiceId: 'tr-f-ecem',
        description: 'Restoran rezervasyonları alan, menü soruları yanıtlayan AI asistan.',
        systemPrompt: `Sen samimi ve profesyonel bir restoran resepsiyonist yapay zekasısın. Görevlerin:
1. Müşterileri sıcak bir şekilde karşıla
2. Rezervasyon al - isim, kişi sayısı, tarih, saat ve özel istekleri sor
3. Menü, çalışma saatleri, konum ve park yeri hakkındaki soruları yanıtla
4. İptal ve değişiklikleri yönet
5. Sorulduğunda popüler yemekleri öner

Her zaman kibar, sabırlı ve yardımsever ol. Cevaplayamadığın bir şey olursa, bir yöneticinin geri aramasını teklif et.
HER ZAMAN TÜRKÇE KONUŞ.`
      },
      {
        id: 'salon-tr',
        name: 'Kuaför Randevusu',
        language: 'TR',
        industry: 'Salon',
        voiceId: 'tr-f-aslihan',
        description: 'Kuaför ve güzellik salonları için randevu alan AI asistan.',
        systemPrompt: `Sen samimi bir kuaför resepsiyonist yapay zekasısın. Sorumlulukların:
1. Müşterileri sıcak bir şekilde karşıla
2. Randevu al - isim, telefon, istenen hizmet, kuaför tercihi, tarih ve saat sor
3. Hizmetleri ve fiyatları açıkla
4. Erteleme ve iptalleri yönet
5. Müşteri ihtiyaçlarına göre hizmet öner

Sıcak, profesyonel ol ve müşterilerin kendilerini değerli hissetmesini sağla. Aramayı bitirmeden önce tüm randevu detaylarını onayla.
HER ZAMAN TÜRKÇE KONUŞ.`
      },
      {
        id: 'ecommerce-tr',
        name: 'E-ticaret Müşteri Desteği',
        language: 'TR',
        industry: 'E-commerce',
        voiceId: 'tr-m-kaan',
        description: 'Online mağazalar için sipariş sorgulama, iade ve ürün sorularını yanıtlayan AI asistan.',
        systemPrompt: `Siz yardımsever bir e-ticaret müşteri destek yapay zekasısınız. Görevleriniz:
1. Müşterilerin siparişlerini takip etmelerine yardımcı olmak
2. İade ve değişim taleplerini işlemek
3. Ürün sorularını yanıtlamak
4. Kargo politikalarını ve teslimat sürelerini açıklamak
5. Fatura sorularını ele almak

Daha iyi yardımcı olmak için her zaman sipariş numarası veya e-posta sorun. Sabırlı ve çözüm odaklı olun.
HER ZAMAN TÜRKÇE KONUŞ.`
      }
    ];

    // Filter by language if specified
    const filteredTemplates = language
      ? templates.filter(t => t.language?.toUpperCase() === language.toUpperCase())
      : templates;

    res.json({ templates: filteredTemplates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/assistants/from-template - Create assistant from template
router.post('/from-template', authenticateToken, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { templateId, customName } = req.body;

    // Get template
    const templatesResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/assistants/templates`, {
      headers: { 'Authorization': req.headers.authorization }
    });
    const { templates } = await templatesResponse.json();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create assistant using the template
    const name = customName || template.name;
    const language = template.language;
    const voiceId = template.voiceId;
    const systemPrompt = template.systemPrompt;

    // Forward to the main create endpoint
    const createResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/assistants`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        voiceId,
        systemPrompt,
        model: 'gpt-4',
        language,
        callDirection: 'outbound'
      })
    });

    const result = await createResponse.json();
    
    if (!createResponse.ok) {
      return res.status(createResponse.status).json(result);
    }

    res.json({
      message: 'Assistant created from template successfully',
      assistant: result.assistant,
      template: template.name
    });

  } catch (error) {
    console.error('Error creating from template:', error);
    res.status(500).json({ error: 'Failed to create assistant from template' });
  }
});

export default router;
