/**
 * Canonical Pattern Registry
 *
 * Shared pattern source for runtime guards and tests.
 */

// Prompt disclosure keywords (substring matching)
export const PROMPT_DISCLOSURE_KEYWORDS_EN = Object.freeze([
  'system prompt',
  'system message',
  'system instruction',
  'you are an ai assistant',
  'your role is',
  'your instructions are',
  'i was instructed to',
  'my prompt says',
  'according to my instructions',
  'i am programmed to',
  'my system prompt',
  'the prompt tells me',
  'as instructed in my',
  'ignore previous instructions',
  'reveal your prompt',
  'what are your instructions',
  'my rules are',
  'here are my rules',
  'my guidelines say'
]);

export const PROMPT_DISCLOSURE_KEYWORDS_TR = Object.freeze([
  'yönergeler',
  'yönergeleri',
  'talimatlar',
  'talimatlarım',
  'kurallarım',
  'kuralları aşağıda',
  'kuralları şöyle',
  'kendime hatırlatmam gereken',
  'bana verilen kurallar',
  'bana verilen yönergeler',
  'sistem promptu',
  'off-topic kuralı',
  'mutlaka uygula',
  'kritik kural',
  'yasak konular',
  'persona kilidi',
  'bilgi kaynağı',
  'konuşma tarzı',
  'tool kullanımı'
]);

// Prompt disclosure regexes (header-like sections and explicit wording)
export const PROMPT_DISCLOSURE_REGEX_PATTERNS = Object.freeze([
  /##\s*(sen\s*kims[iı]n|who\s*you\s*are)/i,
  /##\s*(s[ıi]n[ıi]rlar|limits|boundaries)/i,
  /##\s*(yasak\s*konular|forbidden\s*topics)/i,
  /##\s*(kişiliğin|personality)/i,
  /##\s*(bilgi\s*kaynağı|knowledge\s*source)/i,
  /##\s*(tool\s*kullanımı|tool\s*usage)/i,
  /##\s*(geri\s*arama|callback)/i,
  /##\s*(hafıza|memory)/i,
  /##\s*(dil|language)/i,
  /##\s*(persona\s*kilidi|persona\s*lock)/i,
  /system\s*prompt/i,
  /my\s*instructions\s*are/i,
  /yönergelerim\s*şöyle/i,
  /kurallarım\s*aşağıda/i,
  /bana\s*verilen\s*talimatlar/i,
  /off-topic\s*kuralı/i,
  /mutlaka\s*uygula/i,
  /kritik\s*kural/i
]);

// Internal metadata/tool/system terms that should not leak to end users.
export const INTERNAL_METADATA_TERMS = Object.freeze([
  // Actual tool names (snake_case)
  'customer_data_lookup',
  'check_order_status',
  'check_order_status_crm',
  'check_stock_crm',
  'check_ticket_status_crm',
  'get_product_stock',
  'create_callback',
  'create_appointment',
  'send_order_notification',
  'order_notification',
  'update_customer',
  'create_ticket',
  'search_products',
  'get_product_details',
  'check_stock',
  'calculate_shipping',
  'send_email',
  'send_sms',
  'log_callback_request',
  'get_faq',
  'search_knowledge_base',
  'crm_search',
  'crm_contact_lookup',
  'crm_deal_lookup',
  'order_search',
  'product_search',
  'appointment_lookup',
  // LLM-hallucinated tool names (Gemini training data leaks)
  'ecommerce_product_lookup',
  'product_lookup',
  'order_lookup',
  'stock_lookup',
  'inventory_lookup',
  'shipping_lookup',
  // camelCase variants
  'customerdatalookup',
  'checkorderstatus',
  'ordernotification',
  'updatecustomer',
  'createticket',
  'searchproducts',
  'getproductdetails',
  'checkstock',
  'calculateshipping',
  'sendemail',
  'sendsms',
  'logcallbackrequest',
  'getfaq',
  'searchknowledgebase',
  'crmsearch',
  // Debug/code prefixes
  'tool_code',
  'tool_code:',
  'tool_use',
  'tool_result',
  'function_call',
  'function_result',
  // Secrets
  'api_key',
  'access_token',
  'bearer token',
  'jwt token',
  // Internal IDs
  'businessid',
  'assistantid',
  'conversationid',
  'sessionid',
  'requestid',
  // Infrastructure
  'prisma',
  'anthropic',
  'claude-3',
  'claude-2',
  'gpt-4',
  'openai',
  'gemini',
  '__typename',
  'graphql',
  'mutation',
  'resolver',
  'middleware',
  'endpoint',
  'webhook',
  'mongodb',
  'postgresql',
  'collection:',
  'table:',
  'foreign key',
  'primary key',
  // Internal data model/table names (must never be exposed to end users)
  'customerdata',
  'customer_data',
  'crmorder',
  'crm_order',
  'crmticket',
  'crm_ticket',
  'conversationstate',
  'conversation_state',
  'responsetrace',
  'response_trace',
  'securityevent',
  'security_event',
  'operationalincident',
  'operational_incident',
  'activecallsession',
  'active_call_session',
  'callbackrequest',
  'callback_request',
  'emailthread',
  'email_thread',
  'emailintegration',
  'email_integration',
  'oauthstate',
  'oauth_state',
  'auditlog',
  'audit_log'
]);

export const INTERNAL_TOOL_INVOCATION_PATTERNS = Object.freeze([
  /\b(used|using|called|calling|invoke|invoking|ran|running)\s+\w+_\w+\s*(tool|function)?/i,
  /\btool:\s*\w+/i,
  /\bfunction:\s*\w+/i,
  /\btoolName:\s*["']?\w+/i,
  // Python-style debug syntax (Gemini hallucination: print(tool_name(...)))
  /\bprint\s*\(\s*\w+_\w+\s*\(/i,
  // Debug prefix patterns ([DEBUG], DEBUG_, debug:)
  /\[DEBUG\]/i,
  /\bDEBUG_\w+/,
  /\bdebug:\s/i,
  // tool_code: prefix (Gemini hallucination)
  /\btool_code\s*:/i,
  // Generic code-like tool invocations (e.g. tool_name(arg1, arg2))
  /\b\w+_\w+\s*\([^)]*\)\s*$/m
]);

// Database/schema disclosure patterns. These are internal implementation details
// and should never appear in assistant responses.
export const INTERNAL_DATABASE_DISCLOSURE_PATTERNS = Object.freeze([
  // SQL statement exposure (query snippets / dumps)
  /\b(select|insert|update|delete)\b[\s\S]{0,140}\b(from|into)\b[\s`"']*[a-z_][a-z0-9_]{2,}/i,
  /\b(create|alter|drop)\s+table\b/i,
  /\bjoin\s+[a-z_][a-z0-9_]{2,}\b/i,
  // Migration / ORM internals
  /\b(schema\.prisma|prisma\s+schema|prisma\.|\$queryraw|queryrawunsafe|migration)\b/i,
  // Explicit table list disclosure
  /\b(table|tables|tablo|tablolar)\s*:\s*[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*){1,}/i,
  /\b([A-Z][A-Za-z0-9_]{2,}\s*,\s*){1,}[A-Z][A-Za-z0-9_]{2,}\s*(tablosu|tabloları|tablolari|tables?)\b/i,
  // Natural language Turkish table disclosure: "müşteri tablosu", "sipariş tablosu ve stok tablosu"
  /\b(müşteri|sipariş|siparis|stok|ürün|urun|fatura|ödeme|odeme|kullanıcı|kullanici|envanter|kategori|kargo)\s+tablosu\b/i,
  // Multiple "X tablosu" in same response (listing)
  /tablosu\b[^.]{0,60}\btablosu\b/i,
  // "sistemde X tablosu/tabloları var"
  /\bsistem\w*\s+.{0,40}\b(tablo|table)\w*\s+(var|mevcut|bulun)/i
]);

// NOT_FOUND acknowledgements used by security gateway + test assertions.
export const NOT_FOUND_RESPONSE_PATTERNS = Object.freeze({
  TR: Object.freeze([
    /bulunamadı/i,
    /bulunmuyor/i,
    /bulamadım/i,
    /bulamıyorum/i,
    /kayıt\s*(yok|bulunamadı)/i,
    /sipariş\s*(yok|bulunamadı)/i,
    /sistemimizde\s*(yok|bulunamadı)/i,
    /eşleşen\s*(kayıt|sipariş)\s*(yok|bulunamadı)/i,
    /mevcut\s*değil/i
  ]),
  EN: Object.freeze([
    /not\s*found/i,
    /couldn't\s*find/i,
    /could\s*not\s*find/i,
    /unable\s*to\s*(find|locate)/i,
    /no\s*(record|order|match)/i,
    /doesn't\s*exist/i,
    /does\s*not\s*exist/i,
    /not\s*in\s*(our|the)\s*system/i
  ])
});

// Fabrication cues after NOT_FOUND used by security gateway + tests.
export const ORDER_FABRICATION_PATTERNS = Object.freeze({
  TR: Object.freeze([
    /sipariş(iniz)?de\s*(şu|bu)?\s*(ürünler|ürün)/i,
    /\d+\s*(adet|tane)\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{3,}/i,
    /içerisinde\s*.+\s*bulunuyor/i,
    /sipariş\s*içeriği/i,
    /kargoya\s*(verildi|veriliyor|verilecek)/i,
    /teslim\s*(edilecek|edildi|ediliyor)/i
  ]),
  EN: Object.freeze([
    /your\s*order\s*(contains|includes)/i,
    /\d+\s*x\s+[A-Za-z]{3,}/i,
    /order\s*items/i,
    /shipped|delivered|in\s*transit/i
  ])
});

// Non-sensitive policy style hints (used to avoid false positive leak blocks).
export const POLICY_RESPONSE_HINT_PATTERNS = Object.freeze([
  /\b(gün|hafta|ay|süre|süreç|politika|şart|koşul|garanti|iade|değişim|kargo ücreti|ücretsiz)\b/i,
  /\b(day|week|month|policy|condition|warranty|refund|return|shipping fee)\b/i
]);

// Shared hallucination indicators for fallback assertions.
export const HALLUCINATION_INDICATORS = Object.freeze({
  shippingDetails: Object.freeze([
    /kargo\s+(?:firması|şirketi)/i,
    /takip\s+(?:no|numarası)/i,
    /cargo|shipping/i,
    /tracking\s+number/i
  ]),
  dates: Object.freeze([
    /\d{1,2}[./]\d{1,2}[./]\d{2,4}/,
    /teslim\s+tarihi/i,
    /delivery\s+date/i
  ]),
  specifics: Object.freeze([
    /adet/i,
    /tutar/i,
    /amount/i,
    /quantity/i,
    /price/i,
    /fiyat/i
  ])
});

export default {
  PROMPT_DISCLOSURE_KEYWORDS_EN,
  PROMPT_DISCLOSURE_KEYWORDS_TR,
  PROMPT_DISCLOSURE_REGEX_PATTERNS,
  INTERNAL_METADATA_TERMS,
  INTERNAL_TOOL_INVOCATION_PATTERNS,
  INTERNAL_DATABASE_DISCLOSURE_PATTERNS,
  NOT_FOUND_RESPONSE_PATTERNS,
  ORDER_FABRICATION_PATTERNS,
  POLICY_RESPONSE_HINT_PATTERNS,
  HALLUCINATION_INDICATORS
};
