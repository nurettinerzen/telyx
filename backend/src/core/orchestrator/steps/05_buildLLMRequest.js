/**
 * Step 5: Build LLM Request
 *
 * - Applies tool gating policy
 * - Builds Gemini request with gated tools
 * - Returns chat session and request configuration
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { convertToolsToGeminiFunctions as convertToolsToGemini } from '../../../services/gemini-utils.js';
import { getEntityClarificationHint, getEntityHint, getEntityMatchType } from '../../../services/entityTopicResolver.js';
import { getFlow } from '../../../config/flow-definitions.js';
import { isFeatureEnabled } from '../../../config/feature-flags.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const FLOW_TOOL_OVERRIDES = Object.freeze({
  STOCK_CHECK: ['get_product_stock', 'check_stock_crm'],
  TICKET_STATUS: ['customer_data_lookup'],
  CALLBACK_REQUEST: ['create_callback']
});
const VERIFICATION_FLOWS = Object.freeze(['ORDER_STATUS', 'DEBT_INQUIRY', 'TRACKING_INFO', 'TICKET_STATUS', 'ACCOUNT_LOOKUP']);
const STOCK_TOOLS = Object.freeze(['get_product_stock', 'check_stock_crm']);

function resolveExplicitLookupReference({ classification = null, state = {} } = {}) {
  const candidates = [
    classification?.extractedSlots?.order_number,
    classification?.extractedSlots?.ticket_number,
    state?.extractedSlots?.order_number,
    state?.extractedSlots?.ticket_number
  ];

  const value = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
  return value ? String(value).trim() : null;
}

function getToolAllowlistMode() {
  const mode = String(process.env.TOOL_ALLOWLIST_MODE || 'flow_scoped')
    .toLowerCase()
    .trim();
  return mode === 'tenant_scoped' ? 'tenant_scoped' : 'flow_scoped';
}

function normalizeFlowName(flowName) {
  const normalized = String(flowName || '').toUpperCase();
  if (!normalized) return null;
  if (normalized === 'PRODUCT_INQUIRY') return 'PRODUCT_INFO';
  return normalized;
}

export function isVerificationContextRelevant({
  state = {},
  routingResult = null,
  classification = null
} = {}) {
  const hasRecentStockContext = !!state.lastStockContext || state.anchor?.type === 'STOCK';
  const hasPendingVerificationAnchor =
    state.verification?.status === 'pending' &&
    Boolean(state.verification?.anchor);
  const verificationFlowHint = normalizeFlowName(
    state.activeFlow ||
    state.verification?.flowHint ||
    routingResult?.routing?.routing?.suggestedFlow ||
    classification?.suggestedFlow
  );

  return !hasRecentStockContext && (
    hasPendingVerificationAnchor ||
    VERIFICATION_FLOWS.includes(String(verificationFlowHint || ''))
  );
}

export function resolveFlowScopedTools({ state, classification, routingResult, allToolNames = [] }) {
  const allowlistMode = getToolAllowlistMode();
  const normalizedAllTools = Array.isArray(allToolNames) ? allToolNames.filter(Boolean) : [];
  if (normalizedAllTools.length === 0) {
    return {
      resolvedFlow: null,
      gatedTools: [],
      allowlistMode
    };
  }

  const candidates = [
    state?.activeFlow,
    routingResult?.routing?.routing?.suggestedFlow,
    classification?.suggestedFlow
  ].map(normalizeFlowName).filter(Boolean);

  const resolvedFlow = candidates[0] || null;
  if (allowlistMode === 'tenant_scoped') {
    return {
      resolvedFlow,
      gatedTools: normalizedAllTools,
      allowlistMode
    };
  }

  if (!resolvedFlow) {
    return {
      resolvedFlow: null,
      gatedTools: normalizedAllTools,
      allowlistMode
    };
  }

  const overrideTools = FLOW_TOOL_OVERRIDES[resolvedFlow];
  const flowTools = Array.isArray(overrideTools) && overrideTools.length > 0
    ? overrideTools
    : getFlow(resolvedFlow)?.allowedTools || [];

  if (flowTools.length === 0) {
    return {
      resolvedFlow,
      gatedTools: normalizedAllTools,
      allowlistMode
    };
  }

  let gatedTools = normalizedAllTools.filter(tool => flowTools.includes(tool));

  // Safety hard-stop: product/stock flows must not expose customer lookup tooling.
  if (resolvedFlow === 'PRODUCT_INFO' || resolvedFlow === 'STOCK_CHECK') {
    gatedTools = gatedTools.filter(tool => tool !== 'customer_data_lookup');
  }

  return {
    resolvedFlow,
    gatedTools,
    allowlistMode
  };
}

export function shouldForceStockToolCall({ resolvedFlow, gatedTools = [] }) {
  if (resolvedFlow !== 'STOCK_CHECK' && resolvedFlow !== 'PRODUCT_INFO') return false;
  return (Array.isArray(gatedTools) ? gatedTools : []).some(tool => STOCK_TOOLS.includes(tool));
}

export function buildFunctionCallingConfig({ resolvedFlow, gatedTools = [] }) {
  const normalizedTools = Array.isArray(gatedTools) ? gatedTools.filter(Boolean) : [];
  if (normalizedTools.length === 0) {
    return null;
  }

  if (shouldForceStockToolCall({ resolvedFlow, gatedTools: normalizedTools })) {
    const allowedFunctionNames = normalizedTools.filter(tool => STOCK_TOOLS.includes(tool));
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames
      }
    };
  }

  return {
    functionCallingConfig: {
      mode: 'AUTO'
    }
  };
}

export async function buildLLMRequest(params) {
  const {
    systemPrompt,
    conversationHistory,
    userMessage,
    classification,
    routingResult,
    state,
    toolsAll,
    metrics,
    assistant,
    business,
    entityResolution,
    channel = 'CHAT',
    liveSupportAvailable = null,
    channelUserId = null,
  } = params;
  const allToolNames = toolsAll.map(t => t.function?.name).filter(Boolean);
  const { gatedTools, resolvedFlow, allowlistMode } = resolveFlowScopedTools({
    state,
    classification,
    routingResult,
    allToolNames
  });

  // STEP 0: Enhance system prompt with known customer info
  // SECURITY: Only send non-PII identifiers to LLM, not actual customer data
  let enhancedSystemPrompt = systemPrompt;
  if (state.extractedSlots && Object.keys(state.extractedSlots).length > 0) {
    const knownInfo = [];
    // Only include identifiers, not actual PII values
    if (state.extractedSlots.customer_name) {
      knownInfo.push(`Customer name mentioned`);
    }
    if (state.extractedSlots.phone) {
      knownInfo.push(`Phone number provided`);
    }
    if (state.extractedSlots.order_number) {
      knownInfo.push(`Order #${state.extractedSlots.order_number}`); // Order number is OK
    }
    if (state.extractedSlots.email) {
      knownInfo.push(`Email mentioned`);
    }

    if (knownInfo.length > 0) {
      enhancedSystemPrompt += `\n\nCustomer Context: ${knownInfo.join(', ')} - Use tools to retrieve actual data`;
      console.log('📝 [BuildLLMRequest] Added context flags (no PII):', knownInfo.length, 'indicators');
    }
  }

  // Callback precondition guidance (belt-and-suspenders with toolLoop precondition check)
  // LLM should ask for name/phone BEFORE calling create_callback
  const knownCallbackName = state.callbackFlow?.customerName || state.extractedSlots?.customer_name || null;
  const knownCallbackPhone =
    state.callbackFlow?.customerPhone ||
    state.extractedSlots?.phone ||
    (channel === 'WHATSAPP' ? channelUserId : null);

  if (!knownCallbackName || !knownCallbackPhone) {
    enhancedSystemPrompt += `\n\nKRİTİK: create_callback aracını çağırmadan ÖNCE müşterinin adını ve telefon numarasını öğren. Bu bilgiler olmadan geri arama kaydı oluşturamazsın.`;
  }

  if (state.callbackFlow?.pending || state.activeFlow === 'CALLBACK_REQUEST') {
    enhancedSystemPrompt += `

## CALLBACK AKIŞI (DETERMINISTIC)
- Bu konuşma geri arama talebi akışında.
- SADECE ad-soyad ve telefon bilgisini topla.
- Sipariş numarası, telefon son 4, kimlik doğrulama isteme.
- create_callback çağrısında topic sorusu sorma; topic otomatik üretilecek.
- Ad-soyad ve telefon mevcutsa create_callback çağır, yoksa sadece eksik alanı sor.`;

    if (knownCallbackName && knownCallbackPhone) {
      enhancedSystemPrompt += `
- Bu konuşmada ad-soyad ve telefon zaten mevcut. BU TURDA create_callback aracını MUTLAKA çağır.
- Telefonu tekrar isteme. Adı tekrar isteme. Serbest metinle oyalama yapma.`;
    } else if (!knownCallbackName && knownCallbackPhone) {
      enhancedSystemPrompt += `
- Telefon numarası zaten mevcut, tekrar telefon isteme.
- SADECE ad-soyad iste.`;
    } else if (knownCallbackName && !knownCallbackPhone) {
      enhancedSystemPrompt += `
- Ad-soyad zaten mevcut, tekrar ad isteme.
- SADECE telefon numarasını iste.`;
    }
  }

  const whatsappLiveHandoffEnabled =
    channel === 'WHATSAPP' &&
    isFeatureEnabled('WHATSAPP_LIVE_HANDOFF_V2');
  const supportChoicePending = state.supportRouting?.pendingChoice === true;
  const supportOfferMode = state.supportRouting?.offerMode === 'callback_only'
    ? 'callback_only'
    : 'choice';
  const customerSeemsStuck =
    state.flowStatus === 'not_found' ||
    state.flowStatus === 'validation_error' ||
    Boolean(state.lastNotFound);

  if (whatsappLiveHandoffEnabled) {
    enhancedSystemPrompt += `

## CANLI DESTEK / CALLBACK YÖNLENDİRME
- Kullanıcı açıkça canlı insan / temsilci / gerçek kişi isterse bunu callback ile karıştırma.
- Kullanıcı o anda bir insanla devam etmek istiyorsa varsayılan seçenek canlı devralmadır.
- Callback SADECE kullanıcı açıkça daha sonra aranmak istediğinde veya canlı ekip uygun olmadığında tercih edilir.
- Callback seçilmeden ad/telefon toplamaya başlama.`;

    if (supportChoicePending) {
      enhancedSystemPrompt += supportOfferMode === 'callback_only'
        ? `
- Şu anda canlı ekip müsait değil. Kullanıcı callback teklifini kabul ederse SADECE callback için gereken eksik bilgiyi topla.
- Kullanıcı yine canlı destek isterse şu an canlı ekibin müsait olmadığını kibarca söyle ve callback öner.`
        : `
- Kullanıcıya daha önce "şimdi canlı temsilci mi, sonra callback mi?" tercihi soruldu.
- Kullanıcı "şimdi / bağla / canlı / temsilci" gibi bir tercih yaparsa canlı devralma niyetini destekle.
- Kullanıcı "sonra / ara / geri dönüş / callback" derse callback akışına geç.
- Kullanıcı sadece "evet / tamam" deyip tercih belirtmezse aynı soruyu KISA biçimde tekrar sor.`;
    }

    if (customerSeemsStuck && !supportChoicePending && state.activeFlow !== 'CALLBACK_REQUEST') {
      enhancedSystemPrompt += liveSupportAvailable === false
        ? `
- Kullanıcıyı çözüme götüremiyorsan canlı ekibin şu an müsait olmayabileceğini varsay ve callback teklif et.
- Örnek ton: "İsterseniz sizin için geri arama talebi oluşturabilirim."`
        : `
- Kullanıcıyı çözüme götüremiyorsan veya üst üste takıldıysan canlı destek seçeneğini proaktif teklif et.
- En doğru kısa teklif: "İsterseniz sizi şimdi canlı bir temsilciye bağlayabilirim, dilerseniz geri arama talebi de oluşturabilirim."`;
    }
  }

  // ========================================
  // ARCHITECTURE CHANGE: Inject verification & dispute context for LLM
  // ========================================
  // LLM now handles verification conversation naturally.
  // We inject context so it knows what's pending.
  // SCOPE: Only inject for flows that actually require PII verification.
  // Stock, product inquiry etc. should NEVER see verification guidance.
  // Only inject verification guidance if we're actually in a verification-relevant flow.
  // When activeFlow is null (e.g. after post-result reset), pending verification anchor
  // keeps the context alive so LLM can continue verification correctly.
  const isVerificationRelevant = isVerificationContextRelevant({
    state,
    routingResult,
    classification
  });

  if (state.verificationContext && isVerificationRelevant) {
    const vc = state.verificationContext;
    const verificationGuidance = `

## DOĞRULAMA DURUMU (Verification Context)
- Durum: ${vc.status}
- Beklenen bilgi: ${vc.pendingField === 'name' ? 'Ad-soyad' : vc.pendingField === 'phone' ? 'Telefon numarası' : vc.pendingField}
- Deneme sayısı: ${vc.attempts}/3

KURALLAR:
- Kullanıcının son mesajını bağlam içinde yorumla
- Eğer kullanıcı doğrulama bilgisi verdiyse, customer_data_lookup tool'unu verification_input parametresiyle çağır
- Eğer kullanıcı farklı bir soru sorduysa, soruyu cevapla ama doğrulama ihtiyacını da hatırlat
- Aynı cümleyi tekrar etme — her seferinde farklı ve doğal konuş
- Yanlış anladığını fark edersen kibarca düzelt
- Form cümleleri KULLANMA — sohbet gibi sor`;

    enhancedSystemPrompt += verificationGuidance;
    console.log('🔐 [BuildLLMRequest] Added verification context for LLM');

    // Clean up - don't persist this context
    delete state.verificationContext;
  } else if (state.verificationContext && !isVerificationRelevant) {
    // Active flow is not verification-relevant (e.g., stock) — skip and clean up
    console.log(`🚫 [BuildLLMRequest] Skipped verification context — activeFlow="${state.activeFlow}" not in VERIFICATION_FLOWS`);
    delete state.verificationContext;
  }

  // Verified session context — inform LLM that user is already verified
  // LLM uses this ONLY for natural conversation (e.g., "we already verified you").
  // Auth decision is made by backend, NOT by LLM.
  if (
    state.verification?.status === 'verified' &&
    !state.verificationContext &&
    isVerificationRelevant
  ) {
    const verifiedMethod = state.verification.method === 'channel_proof'
      ? 'kanal kimliği ile otomatik doğrulandı'
      : 'manuel doğrulama ile onaylandı';
    const verifiedGuidance = `

## DOĞRULAMA TAMAMLANDI
- Bu görüşmede kullanıcı daha önce ${verifiedMethod}.
- Aynı müşteriye ait sorgularda tekrar doğrulama isteme.
- "Kimliğiniz doğrulandı" / "az önce doğruladık" gibi doğal geçişler yap.
- NOT: Doğrulama kararı backend tarafından verilir. Sen sadece doğal konuş.`;

    enhancedSystemPrompt += verifiedGuidance;
    console.log('✅ [BuildLLMRequest] Added verified session context for LLM');
  }

  // Dispute context — LLM has anchor/truth data to reference
  if (state.disputeContext) {
    const dc = state.disputeContext;
    const disputeGuidance = `

## İTİRAZ BAĞLAMI (Dispute Context)
Kullanıcı önceki sonucu reddediyor/itiraz ediyor.
- Önceki akış: ${dc.originalFlow || 'bilinmiyor'}
- Kargo takip bilgisi var mı: ${dc.hasTrackingInfo ? 'EVET' : 'HAYIR'}

KURALLAR:
- Kullanıcının itirazını ciddiye al
- Elindeki bilgileri (varsa kargo takip no) doğal dille paylaş
- Geri arama teklif et
- Empati kur, "ama sistem şunu söylüyor" gibi savunmacı olma`;

    enhancedSystemPrompt += disputeGuidance;
    console.log('⚠️ [BuildLLMRequest] Added dispute context for LLM');

    // Clean up
    delete state.disputeContext;
  }

  // Profanity strike context — LLM handles warning naturally
  if (routingResult?.routing?.routing?.profanityStrike) {
    const strike = routingResult.routing.routing.profanityStrike;
    const profanityGuidance = `

## KÜFÜR UYARISI
Kullanıcı saygısız dil kullandı (${strike}. uyarı / 3 üzerinden).
- Kibarca uyar ama suçlama
- Yardım etmeye devam et
- Doğal ve empatik ol`;

    enhancedSystemPrompt += profanityGuidance;
    console.log(`⚠️ [BuildLLMRequest] Added profanity context (strike ${strike}/3)`);
  }

  // Entity resolver output is structural hint only; LLM decides final wording.
  const resolverMatchType = getEntityMatchType(entityResolution);
  const resolverEntityHint = getEntityHint(entityResolution);
  const resolverClarificationHint = getEntityClarificationHint(entityResolution);
  if (resolverMatchType !== 'NONE' || entityResolution?.needsClarification) {
    enhancedSystemPrompt += `

## ENTITY RESOLVER HINT (STRUCTURED, NO DIRECT REPLY)
- matchType: ${resolverMatchType}
- entityHint: ${resolverEntityHint || '-'}
- confidence: ${entityResolution?.confidence ?? 0}
- needsClarification: ${entityResolution?.needsClarification ? 'YES' : 'NO'}
- clarificationQuestionHint: ${resolverClarificationHint || '-'}

KURAL:
- Resolver sonucu SADECE bağlam ipucudur, cevabı sen üretirsin.
- needsClarification=YES ise TEK bir netleştirme sorusu sor.
- OUT_OF_SCOPE ise işletme kapsamına nazikçe geri yönlendir.
- FUZZY_MATCH ise "${resolverEntityHint || 'bu varlık'}" için doğrulayıcı kısa soru sor.`;
    console.log('🧭 [BuildLLMRequest] Added structured entity resolver hint');
  }

  // STEP 0.5: CHATTER messages — LLM short response mode (always LLM)
  const isChatterRoute = routingResult?.isChatter || routingResult?.routing?.routing?.action === 'ACKNOWLEDGE_CHATTER';
  const chatterDirective = routingResult?.chatterDirective;

  if (chatterDirective) {
    const assistantName = assistant?.name || 'Asistan';
    const businessName = business?.name || '';

    // Tekrar algılama: son assistant cevaplarından benzersiz olanları bul
    const recentAssistantMsgs = conversationHistory
      .filter(m => m.role === 'assistant')
      .map(m => String(m.content || '').trim())
      .slice(-5);
    const uniqueResponses = [...new Set(recentAssistantMsgs)];
    const hasRepetition = recentAssistantMsgs.length >= 2 && uniqueResponses.length < recentAssistantMsgs.length;
    const repeatedPhrase = hasRepetition ? uniqueResponses[uniqueResponses.length - 1] : null;

    enhancedSystemPrompt += `

## CHATTER KISA YANIT MODU (LLM Directive)
- Rolün: ${businessName ? businessName + ' şirketinin' : 'şirketin'} müşteri asistanı ${assistantName}
- Mesaj türü: ${chatterDirective.kind} (greeting/thanks/generic)
- Konuşma durumu: ${chatterDirective.flowStatus}
- Aktif görev var mı: ${chatterDirective.activeTask ? 'EVET — ' + (chatterDirective.activeFlow || 'devam eden iş') : 'HAYIR'}
- Doğrulama bekleniyor mu: ${chatterDirective.verificationPending ? 'EVET' : 'HAYIR'}

KURALLAR:
- Selam/teşekküre kısa ve doğal cevap ver.
- Cevabı 1-2 cümle ile sınırla (${chatterDirective.maxSentences} cümleyi aşma).
- Kısa selamdan sonra en fazla 1 net takip sorusu sor.
- Aktif görev varsa soruyu o göreve geri bağla.
- Backend şablonlarını tekrar etme, cevabı doğal varyasyonla kendin üret.${hasRepetition ? `

⚠️ TEKRAR YASAĞI (KRİTİK):
Önceki cevaplarında "${repeatedPhrase}" ifadesini ZATEN KULLANDIN.
Bu cevabı veya benzerini TEKRAR KULLANMA.
Farklı bir selamlama ve farklı bir soru sor.
Örnek varyasyonlar: "Hoş geldin!", "Tekrar merhaba!", "Selamlar!", "Hey, nasıl yardımcı olabilirim?", "Buyur, dinliyorum!"` : ''}`;
    console.log(`💬 [BuildLLMRequest] CHATTER — LLM directive mode active${hasRepetition ? ' (anti-repeat injected)' : ''}`);
  } else if (isChatterRoute) {
    const assistantName = assistant?.name || 'Asistan';
    const businessName = business?.name || '';
    const activeFlowSummary = state.activeFlow || state.flowStatus || 'none';
    const hasPendingVerification = state.verification?.status === 'pending';

    enhancedSystemPrompt += `

## CHATTER KISA YANIT MODU
- Rolün: ${businessName ? businessName + ' şirketinin' : 'şirketin'} müşteri asistanı ${assistantName}
- Konuşma durumu: ${activeFlowSummary}
- Doğrulama bekleniyor mu: ${hasPendingVerification ? 'EVET' : 'HAYIR'}

KURALLAR:
- Selam/teşekküre kısa ve doğal cevap ver, robotik kalıp kullanma.
- Cevabı 1-2 cümlede tut.
- Kısa selamdan sonra en fazla 1 net takip sorusu sor.
- Eğer konuşmada aktif bir görev varsa (ör: sipariş, doğrulama), soruyu göreve geri bağla.`;
    console.log('💬 [BuildLLMRequest] CHATTER — context-preserving guidance aktif');
  }

  // ========================================
  // STOCK QUERY: Disambiguation & Disclosure Policy
  // ========================================
  // Inject instructions so LLM handles multi-match stock queries correctly
  // and never reveals raw stock quantities.
  enhancedSystemPrompt += `

## STOK SORGUSU KURALLARI

1. Tool "MULTIPLE_CANDIDATES" döndüğünde: stok durumu hakkında konuşma, önce ürünü netleştir. Tekrar tool çağırırken aday listesindeki tam ürün adını kullan.
2. Stok ADEDİ (kaç adet/tane kaldı) ASLA paylaşılmaz. Adet yerine "stokta mevcut / sınırlı stok / stokta yok" şeklinde durumu belirt.
3. Ürün FİYATI tool yanıtında mevcutsa müşteriye paylaşılmalıdır. Fiyat bilgisi halka açık veridir, gizlenmez.
4. Müşteri "kaç tane var?" diye sorarsa: kesin adet verilemeyeceğini söyle, ama belirli bir miktar ihtiyacı varsa kontrol edebileceğini belirt.
5. requested_qty parametresi SADECE müşteri açık bir sayı söylediğinde doldurulur. "Kaç tane var?" gibi genel sorularda BOŞ bırakılır.
6. Tool yanıtındaki quantity_check sonucunu kullan, kendi başına adet uydurma.`;

  if (shouldForceStockToolCall({ resolvedFlow, gatedTools })) {
    enhancedSystemPrompt += `

## ZORUNLU STOK TOOL ÇAĞRISI
- Kullanıcı stok/ürün mevcudiyeti soruyorsa, İLK yanıttan önce mutlaka stok tool'u çağır.
- "Bu ürün hakkında bilgim yok", "bulunamadı", "tam adını yazın" gibi cümleleri tool çağırmadan kurma.
- Geniş ürün adı bile olsa önce tool ile adayları getir; tool çoklu aday döndürürse oradan netleştir.`;
  }

  const classifierConfidence = classification?.confidence || 0.9;

  enhancedSystemPrompt += `

## TOOL KULLANIM KURALI (LLM AUTHORITY)
- Tool kullanmadan doğru ve güvenli cevap verebiliyorsan tool ÇAĞIRMA.
- Tool gerekiyorsa önce SADECE BİR eksik bilgiyi sor — birden fazla bilgiyi aynı anda isteme.
- Sipariş sorgusu: SADECE sipariş numarası sor. Telefon, isim, soyisim isteme. Sıra: sipariş no → doğrulama (sistem otomatik isteyecek).
- Eksik bilgi tamamlanmadan tool çağırma.
- Tool sonucu olmadan hesap/sipariş/kişisel claim üretme.`;

  // ========================================
  // ENTITY-AWARE FORCED TOOL CALL
  // ========================================
  // If user message contains a specific entity reference (order no, ticket no, tracking no),
  // inject a mandatory tool call instruction. Prevents LLM from using stale conversation
  // history data instead of making a fresh lookup.
  const entityRefMatch = resolveExplicitLookupReference({ classification, state });
  if (entityRefMatch) {
    enhancedSystemPrompt += `

## ZORUNLU TOOL ÇAĞRISI
Kullanıcı mesajında spesifik bir kayıt referansı var: "${entityRefMatch}".
- Bu kayıt için MUTLAKA customer_data_lookup tool'unu çağır.
- Önceki konuşma geçmişindeki verileri KULLANMA — her sorgu için taze veri al.
- Tool çağırmadan sipariş durumu, kargo bilgisi, servis durumu PAYLAŞMA.`;
  }

  // LLM decides whether to call tools; backend only passes allowlisted tools.
  metrics.toolDecisionMode = 'llm_authority_allowlist_only';
  console.log('🔧 [BuildLLMRequest] Allowlist tools passed to LLM:', {
    count: gatedTools.length,
    names: gatedTools,
    resolvedFlow: resolvedFlow || 'NONE'
  });

  metrics.flowScopedTools = {
    allowlistMode,
    resolvedFlow: resolvedFlow || null,
    allToolCount: allToolNames.length,
    gatedToolCount: gatedTools.length
  };

  // STEP 2: Filter tools based on gated list
  // toolsAll is in OpenAI format: {type: 'function', function: {name, description, parameters}}
  const allowedToolObjects = toolsAll.filter(tool =>
    gatedTools.includes(tool.function?.name)
  );

  // STEP 3: Convert tools to Gemini format
  const geminiTools = allowedToolObjects.length > 0
    ? convertToolsToGemini(allowedToolObjects)
    : [];

  // STEP 4: Build conversation history for Gemini
  const geminiHistory = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // STEP 5: Create Gemini chat session
  // Chatter-specific budget: lower tokens + temperature for cost/latency savings
  const isChatterLLM = !!chatterDirective;
  const generationConfig = isChatterLLM
    ? {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 200,
        thinkingConfig: { thinkingBudget: 0 }
      }
    : {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 }
      };

  if (isChatterLLM) {
    console.log('💬 [BuildLLMRequest] CHATTER budget: maxOutputTokens=200, temperature=0.8');
  }

  const toolConfig = buildFunctionCallingConfig({
    resolvedFlow,
    gatedTools
  });

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: enhancedSystemPrompt,
    tools: geminiTools.length > 0 ? [{ functionDeclarations: geminiTools }] : undefined,
    toolConfig: geminiTools.length > 0 ? toolConfig : undefined,
    generationConfig
  });

  const chat = model.startChat({
    history: geminiHistory
  });

  // STEP 6: Track gated tools in state (telemetry only, NOT used as input for next turn)
  // P0-FIX: Removed state.allowedTools feedback loop — was causing tools gated out once
  // to stay gated forever. Gating now always evaluates from full toolsAll set.
  state._lastGatedTools = gatedTools; // Underscore prefix = telemetry-only, not used as input

  return {
    chat,
    gatedTools,
    hasTools: gatedTools.length > 0,
    model,
    confidence: classifierConfidence
  };
}

export default { buildLLMRequest };
