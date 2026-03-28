const tr = {
  header: {
    title: 'Red Alert',
    subtitle: 'Güvenlik olaylarını, uygulama hatalarını ve asistan kalite sinyallerini tek ekranda izle.'
  },
  timeRanges: {
    oneHour: 'Son 1 Saat',
    sixHours: 'Son 6 Saat',
    twentyFourHours: 'Son 24 Saat',
    sevenDays: 'Son 7 Gün'
  },
  nav: {
    errors: {
      title: 'Uygulama Hataları',
      none: 'Açık hata yok',
      unresolved: '{count} çözülmemiş'
    },
    events: {
      title: 'Güvenlik Olayları',
      none: 'Kritik olay yok',
      critical: '{count} kritik'
    },
    assistant: {
      title: 'Asistan Kalitesi',
      enabled: 'Davranış ve geri bildirim sinyalleri',
      disabled: 'Panel kapalıysa sebebini burada gör'
    },
    ops: {
      title: 'Operasyon Olayları',
      subtitle: 'İz kayıtları ve operasyon sinyalleri'
    }
  },
  common: {
    loading: 'Panel yükleniyor...',
    accessDenied: 'Erişim Engellendi',
    accessDeniedDesc: 'Red Alert paneline erişim yetkiniz yok.',
    previous: 'Önceki',
    next: 'Sonraki',
    open: 'Açık',
    resolved: 'Çözüldü',
    enabled: 'Açık',
    disabled: 'Kapalı',
    none: 'Yok',
    yes: 'Evet',
    no: 'Hayır',
    unknown: 'Bilinmiyor',
    details: 'Detay',
    trace: 'İz Kaydı',
    view: 'İncele',
    refreshFailed: 'Panel yüklenemedi',
    channels: {
      chat: 'Web Sohbet',
      whatsapp: 'WhatsApp',
      email: 'E-posta',
      instagram: 'Instagram',
      api: 'API'
    }
  },
  filters: {
    allCategories: 'Tüm Kategoriler',
    allSeverities: 'Tüm Önem Düzeyleri',
    allStatuses: 'Tüm Durumlar',
    unresolvedOnly: 'Açıklar',
    resolvedOnly: 'Çözülenler',
    allEventTypes: 'Tüm Olay Türleri'
  },
  severities: {
    low: 'Düşük',
    medium: 'Orta',
    high: 'Yüksek',
    critical: 'Kritik'
  },
  eventTypes: {
    labels: {
      auth_failure: 'Yetkisiz Erişim Denemesi',
      cross_tenant_attempt: 'Tenant Sınırı İhlali',
      firewall_block: 'Firewall Engeli',
      content_safety_block: 'İçerik Güvenliği Engeli',
      ssrf_block: 'SSRF Engeli',
      rate_limit_hit: 'Rate Limit Engeli',
      webhook_invalid_signature: 'Geçersiz Webhook İmzası',
      pii_leak_block: 'PII Sızıntısı Engeli'
    },
    descriptions: {
      auth_failure: 'Yetkisiz ya da geçersiz kimlik doğrulama denemesi algılandı.',
      cross_tenant_attempt: 'Bir tenant verisine başka bir tenant bağlamından erişim denendi.',
      firewall_block: 'Gelen istek güvenlik duvarı tarafından riskli bulunup engellendi.',
      content_safety_block: 'Mesaj içerik güvenliği kurallarını ihlal ettiği için işlenmedi.',
      ssrf_block: 'Sunucu taraflı istek yönlendirme benzeri riskli bir URL isteği engellendi.',
      rate_limit_hit: 'Kısa sürede çok fazla istek geldiği için koruma devreye girdi.',
      webhook_invalid_signature: 'Webhook çağrısı doğrulanamadığı için reddedildi.',
      pii_leak_block: 'Dışarı çıkmaması gereken hassas veri yakalanıp engellendi.'
    }
  },
  errorCategories: {
    tool_failure: 'Araç Hatası',
    chat_error: 'Sohbet Hatası',
    assistant_error: 'Asistan Hatası',
    api_error: 'Harici API Hatası',
    system_error: 'Sistem Hatası',
    webhook_error: 'Webhook Hatası'
  },
  assistantCategories: {
    ASSISTANT_BLOCKED: 'Bloklandı',
    ASSISTANT_SANITIZED: 'Maskelendi',
    ASSISTANT_NEEDS_CLARIFICATION: 'Netleştirme İstedi',
    ASSISTANT_INTERVENTION: 'Müdahale Edildi',
    ASSISTANT_NEGATIVE_FEEDBACK: 'Negatif Geri Bildirim',
    ASSISTANT_POSITIVE_FEEDBACK: 'Pozitif Geri Bildirim',
    LLM_BYPASSED: 'LLM Atlandı',
    TEMPLATE_FALLBACK_USED: 'Fallback Kullanıldı',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Gerekli Araç Çağrılmadı',
    VERIFICATION_INCONSISTENT: 'Doğrulama Kayması',
    HALLUCINATION_RISK: 'Halüsinasyon Riski',
    RESPONSE_STUCK: 'Tekrarlayan Yanıt'
  },
  opsCategories: {
    LLM_BYPASSED: 'LLM Atlandı',
    TEMPLATE_FALLBACK_USED: 'Fallback Kullanıldı',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Gerekli Araç Çağrılmadı',
    VERIFICATION_INCONSISTENT: 'Doğrulama Kayması',
    HALLUCINATION_RISK: 'Halüsinasyon Riski',
    RESPONSE_STUCK: 'Tekrarlayan Yanıt'
  },
  errors: {
    title: 'Uygulama Hataları',
    description: 'Araç, sistem, webhook ve harici servis kaynaklı uygulama hataları.',
    empty: 'Hata bulunamadı',
    pagination: '{start} - {end} / toplam {total} hata',
    table: {
      lastSeen: 'Son Görülme',
      category: 'Kategori',
      severity: 'Önem',
      source: 'Kaynak',
      message: 'Mesaj',
      repeat: 'Tekrar',
      status: 'Durum',
      action: 'İşlem'
    },
    detail: {
      tool: 'Araç',
      service: 'Servis',
      endpoint: 'Endpoint',
      code: 'Kod',
      business: 'İşletme',
      request: 'İstek',
      firstSeen: 'İlk Görülme',
      responseTime: 'Yanıt Süresi',
      stackTrace: 'Stack Trace',
      resolvedBy: '{user} tarafından {date} tarihinde çözüldü'
    },
    actions: {
      resolve: 'Çözüldü olarak işaretle',
      reopen: 'Tekrar aç'
    },
    notifications: {
      resolved: 'Hata çözüldü olarak işaretlendi',
      reopened: 'Hata tekrar açıldı',
      updateFailed: 'Hata durumu güncellenemedi'
    }
  },
  securityEvents: {
    title: 'Güvenlik Olayları',
    description: 'Sistem düzeyinde engellenen veya riskli bulunan istekler. Satıra tıklayarak neden tetiklendiğini görebilirsin.',
    empty: 'Güvenlik olayı bulunamadı',
    explanationTitle: 'Bu olay ne demek?',
    explanationFallback: 'Bu güvenlik sinyali için açıklama bulunmuyor.',
    technicalDetail: 'Teknik Detay',
    userAgent: 'Kullanıcı Aracısı',
    pagination: '{start} - {end} / toplam {total} olay',
    table: {
      time: 'Zaman',
      type: 'Tür',
      severity: 'Önem',
      source: 'Kaynak',
      endpoint: 'Endpoint',
      method: 'Metod',
      httpStatus: 'HTTP Durumu',
      ip: 'IP'
    }
  },
  assistantUnavailable: {
    title: 'Asistan Kalitesi',
    description: 'Bu alan commit veya push eksik olduğu için değil, backend yetenekleri kapalı olduğu için görünmeyebilir.',
    body: 'Panelin veri üretebilmesi için backend tarafında birleşik iz kaydı, operasyon olayları ve Red Alert panel yeteneği açık olmalı.',
    trace: 'Birleşik İz Kaydı',
    incidents: 'Operasyon Olayları',
    panel: 'Asistan ve Operasyon Paneli',
    envHint: 'Prod veya pilot ortamında gerekli backend env değerleri'
  },
  assistant: {
    highlightTitle: 'Öne Çıkan Sinyaller',
    highlightDescription: 'En kritik kalite sinyallerini tek satırda özetliyoruz.',
    metrics: {
      blocked: 'Bloklama',
      sanitize: 'Maskeleme',
      fallback: 'Yedek Yanıt',
      clarification: 'Netleştirme',
      negativeFeedback: 'Negatif Geri Bildirim',
      turn: 'tur',
      feedback: 'geri bildirim'
    },
    title: 'Asistan Kalitesi Olayları',
    description: 'Bloklama, maskeleme, yedek yanıt, müdahale ve kullanıcı geri bildirim sinyalleri.',
    empty: 'Asistan olayı bulunamadı',
    pagination: '{start} - {end} / toplam {total} olay',
    table: {
      time: 'Zaman',
      event: 'Olay',
      severity: 'Önem',
      status: 'Durum',
      action: 'İşlem'
    },
    actions: {
      viewTrace: 'İz kaydını aç',
      resolve: 'Çözüldü olarak işaretle',
      reopen: 'Tekrar aç'
    },
    notifications: {
      resolved: 'Asistan olayı çözüldü olarak işaretlendi',
      reopened: 'Asistan olayı tekrar açıldı',
      updateFailed: 'Asistan olayı güncellenemedi',
      traceFailed: 'İz kaydı yüklenemedi'
    }
  },
  ops: {
    title: 'Operasyon Olayları',
    description: 'Kategori ve önem düzeyine göre operasyon sinyal akışı.',
    repeatTitle: 'Tekrarlayan Yanıtlar',
    repeatDescription: 'Aynı ya da benzer özetle tekrar eden yanıtlar.',
    repeatEmpty: 'Tekrarlayan yanıt bulunamadı',
    eventsEmpty: 'Operasyon olayı bulunamadı',
    pagination: '{start} - {end} / toplam {total} olay',
    metrics: {
      bypassRate: 'Atlama Oranı',
      fallbackRate: 'Yedek Yanıt Oranı',
      toolSuccess: 'Araç Başarı Oranı',
      bypassHint: 'LLM atlanan turlar / toplam tur',
      fallbackHint: 'şablon ve yedek yanıt kaynakları',
      toolSuccessHint: 'araç çağrılan turlarda başarı'
    },
    table: {
      hash: 'Özet',
      channel: 'Kanal',
      count: 'Sayı',
      sample: 'Örnek Metin',
      trace: 'İz Kaydı',
      time: 'Zaman',
      category: 'Kategori',
      severity: 'Önem',
      summary: 'Özet'
    }
  },
  traceModal: {
    title: 'Asistan İz Kaydı',
    trace: 'İz Kimliği',
    channel: 'Kanal',
    responseSource: 'Yanıt Kaynağı',
    latency: 'Gecikme',
    llmUsed: 'LLM Kullanıldı',
    toolsCalled: 'Araç Çağrısı',
    toolSuccess: 'Araç Başarısı',
    session: 'Oturum',
    payloadTitle: 'İz Kaydı İçeriği',
    payloadDescription: 'Guardrail, kaynak, grounding ve son işlem detayları',
    guardrailNote: 'Guardrail sonucu yalnızca son yanıtın bloklanıp bloklanmadığını ya da değiştirildiğini gösterir. Burada PASS görsen bile aşağıdaki bağlı olay alanında kalite veya doğrulama sinyali düşmüş olabilir.',
    responsePreview: 'Yanıt Önizlemesi',
    guardrail: 'Guardrail',
    grounding: 'Grounding',
    messageType: 'Mesaj Türü',
    postprocessors: 'Son İşlemler',
    tools: 'Araç Çağrıları',
    linkedIncidents: 'Bağlı Olaylar',
    noLinkedIncidents: 'Bağlı olay yok.',
    conversationSnapshot: 'Konuşma Görünümü',
    conversationDescription: 'Bağlı sohbet kaydından alınan konuşma içeriği',
    openChatHistory: 'Sohbet geçmişinde aç',
    noChatLog: 'Bu iz kaydı için bağlı bir sohbet kaydı bulunamadı.',
    loading: 'İz kaydı yükleniyor...',
    notFound: 'İz kaydı bulunamadı.',
    reason: 'Neden',
    comment: 'Not',
    guardrailReason: 'Guardrail Gerekçesi',
    guardrailActions: {
      PASS: 'Müdahale Yok',
      SANITIZE: 'Maskelendi',
      BLOCK: 'Bloklandı',
      FALLBACK: 'Yedek Yanıt Kullanıldı',
      LOCK: 'Kilitlendi',
      SUPPRESS: 'Gösterilmedi'
    },
    responseSources: {
      llm: 'LLM',
      template: 'Şablon',
      fallback: 'Yedek Yanıt',
      knowledge_base: 'Bilgi Tabanı',
      tool: 'Araç Sonucu',
      workflow: 'İş Akışı',
      system: 'Sistem'
    },
    roles: {
      user: 'Kullanıcı',
      assistant: 'Asistan',
      system: 'Sistem'
    }
  }
};

const en = {
  header: {
    title: 'Red Alert',
    subtitle: 'Monitor security events, app errors, and assistant quality signals on one screen.'
  },
  timeRanges: {
    oneHour: 'Last 1 Hour',
    sixHours: 'Last 6 Hours',
    twentyFourHours: 'Last 24 Hours',
    sevenDays: 'Last 7 Days'
  },
  nav: {
    errors: {
      title: 'App Errors',
      none: 'No open errors',
      unresolved: '{count} unresolved'
    },
    events: {
      title: 'Security Events',
      none: 'No critical events',
      critical: '{count} critical'
    },
    assistant: {
      title: 'Assistant Quality',
      enabled: 'Behavior and feedback signals',
      disabled: 'See why the panel is disabled'
    },
    ops: {
      title: 'Operational Events',
      subtitle: 'Trace and operational signals'
    }
  },
  common: {
    loading: 'Loading panel...',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You do not have access to the Red Alert panel.',
    previous: 'Previous',
    next: 'Next',
    open: 'Open',
    resolved: 'Resolved',
    enabled: 'Enabled',
    disabled: 'Disabled',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    unknown: 'Unknown',
    details: 'Details',
    trace: 'Trace',
    view: 'View',
    refreshFailed: 'Failed to load panel',
    channels: {
      chat: 'Web Chat',
      whatsapp: 'WhatsApp',
      email: 'Email',
      instagram: 'Instagram',
      api: 'API'
    }
  },
  filters: {
    allCategories: 'All Categories',
    allSeverities: 'All Severity Levels',
    allStatuses: 'All Statuses',
    unresolvedOnly: 'Open Only',
    resolvedOnly: 'Resolved Only',
    allEventTypes: 'All Event Types'
  },
  severities: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical'
  },
  eventTypes: {
    labels: {
      auth_failure: 'Unauthorized Access Attempt',
      cross_tenant_attempt: 'Cross-Tenant Attempt',
      firewall_block: 'Firewall Block',
      content_safety_block: 'Content Safety Block',
      ssrf_block: 'SSRF Block',
      rate_limit_hit: 'Rate Limit Block',
      webhook_invalid_signature: 'Invalid Webhook Signature',
      pii_leak_block: 'PII Leak Block'
    },
    descriptions: {
      auth_failure: 'An unauthorized or invalid authentication attempt was detected.',
      cross_tenant_attempt: 'Data access was attempted across tenant boundaries.',
      firewall_block: 'The request was blocked by the security firewall.',
      content_safety_block: 'The message violated content safety rules and was not processed.',
      ssrf_block: 'A suspicious server-side request pattern was blocked.',
      rate_limit_hit: 'Protection was triggered due to too many requests in a short time.',
      webhook_invalid_signature: 'The webhook call was rejected because verification failed.',
      pii_leak_block: 'Sensitive data was detected and blocked before exposure.'
    }
  },
  errorCategories: {
    tool_failure: 'Tool Failure',
    chat_error: 'Chat Error',
    assistant_error: 'Assistant Error',
    api_error: 'External API Error',
    system_error: 'System Error',
    webhook_error: 'Webhook Error'
  },
  assistantCategories: {
    ASSISTANT_BLOCKED: 'Blocked',
    ASSISTANT_SANITIZED: 'Sanitized',
    ASSISTANT_NEEDS_CLARIFICATION: 'Needs Clarification',
    ASSISTANT_INTERVENTION: 'Intervened',
    ASSISTANT_NEGATIVE_FEEDBACK: 'Negative Feedback',
    ASSISTANT_POSITIVE_FEEDBACK: 'Positive Feedback',
    LLM_BYPASSED: 'LLM Bypassed',
    TEMPLATE_FALLBACK_USED: 'Fallback Used',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Required Tool Was Skipped',
    VERIFICATION_INCONSISTENT: 'Verification Drift',
    HALLUCINATION_RISK: 'Hallucination Risk',
    RESPONSE_STUCK: 'Repeated Response'
  },
  opsCategories: {
    LLM_BYPASSED: 'LLM Bypassed',
    TEMPLATE_FALLBACK_USED: 'Fallback Used',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Required Tool Was Skipped',
    VERIFICATION_INCONSISTENT: 'Verification Drift',
    HALLUCINATION_RISK: 'Hallucination Risk',
    RESPONSE_STUCK: 'Repeated Response'
  },
  errors: {
    title: 'App Errors',
    description: 'Application-level failures from tools, system components, webhooks, and external services.',
    empty: 'No errors found',
    pagination: '{start} - {end} / {total} total errors',
    table: {
      lastSeen: 'Last Seen',
      category: 'Category',
      severity: 'Severity',
      source: 'Source',
      message: 'Message',
      repeat: 'Repeat',
      status: 'Status',
      action: 'Action'
    },
    detail: {
      tool: 'Tool',
      service: 'Service',
      endpoint: 'Endpoint',
      code: 'Code',
      business: 'Business',
      request: 'Request',
      firstSeen: 'First Seen',
      responseTime: 'Response Time',
      stackTrace: 'Stack Trace',
      resolvedBy: 'Resolved by {user} on {date}'
    },
    actions: {
      resolve: 'Mark as resolved',
      reopen: 'Reopen'
    },
    notifications: {
      resolved: 'Error marked as resolved',
      reopened: 'Error reopened',
      updateFailed: 'Failed to update error status'
    }
  },
  securityEvents: {
    title: 'Security Events',
    description: 'System-level requests that were blocked or flagged as risky. Click a row to inspect why it triggered.',
    empty: 'No security events found',
    explanationTitle: 'What does this mean?',
    explanationFallback: 'No explanation is available for this event.',
    technicalDetail: 'Technical Detail',
    userAgent: 'User Agent',
    pagination: '{start} - {end} / {total} total events',
    table: {
      time: 'Time',
      type: 'Type',
      severity: 'Severity',
      source: 'Source',
      endpoint: 'Endpoint',
      method: 'Method',
      httpStatus: 'HTTP Status',
      ip: 'IP'
    }
  },
  assistantUnavailable: {
    title: 'Assistant Quality',
    description: 'This area may be hidden because backend capabilities are disabled, not because commit or push is missing.',
    body: 'Unified trace, operational incidents, and the Red Alert panel capability must be enabled on the backend.',
    trace: 'Unified Trace',
    incidents: 'Operational Incidents',
    panel: 'Assistant and Operations Panel',
    envHint: 'Required backend env values in prod or pilot'
  },
  assistant: {
    highlightTitle: 'Key Signals',
    highlightDescription: 'The most important quality signals are summarized in one row.',
    metrics: {
      blocked: 'Blocked',
      sanitize: 'Sanitize',
      fallback: 'Fallback',
      clarification: 'Clarification',
      negativeFeedback: 'Negative Feedback',
      turn: 'turn',
      feedback: 'feedback'
    },
    title: 'Assistant Quality Events',
    description: 'Block, sanitize, fallback, intervention, and end-user feedback signals.',
    empty: 'No assistant events found',
    pagination: '{start} - {end} / {total} total events',
    table: {
      time: 'Time',
      event: 'Event',
      severity: 'Severity',
      status: 'Status',
      action: 'Action'
    },
    actions: {
      viewTrace: 'Open trace',
      resolve: 'Mark as resolved',
      reopen: 'Reopen'
    },
    notifications: {
      resolved: 'Assistant event marked as resolved',
      reopened: 'Assistant event reopened',
      updateFailed: 'Failed to update assistant event',
      traceFailed: 'Failed to load trace'
    }
  },
  ops: {
    title: 'Operational Events',
    description: 'Operational signal stream grouped by category and severity.',
    repeatTitle: 'Repeated Responses',
    repeatDescription: 'Responses that repeated with the same or similar summary.',
    repeatEmpty: 'No repeated responses found',
    eventsEmpty: 'No operational events found',
    pagination: '{start} - {end} / {total} total events',
    metrics: {
      bypassRate: 'Bypass Rate',
      fallbackRate: 'Fallback Rate',
      toolSuccess: 'Tool Success Rate',
      bypassHint: 'LLM bypass / total turns',
      fallbackHint: 'template and fallback sources',
      toolSuccessHint: 'success on turns with tool calls'
    },
    table: {
      hash: 'Hash',
      channel: 'Channel',
      count: 'Count',
      sample: 'Sample Text',
      trace: 'Trace',
      time: 'Time',
      category: 'Category',
      severity: 'Severity',
      summary: 'Summary'
    }
  },
  traceModal: {
    title: 'Assistant Trace',
    trace: 'Trace ID',
    channel: 'Channel',
    responseSource: 'Response Source',
    latency: 'Latency',
    llmUsed: 'LLM Used',
    toolsCalled: 'Tools Called',
    toolSuccess: 'Tool Success',
    session: 'Session',
    payloadTitle: 'Trace Payload',
    payloadDescription: 'Guardrail, source, grounding, and postprocessor details',
    guardrailNote: 'The guardrail result only shows whether the final response was blocked or altered. You may still see quality incidents below even when the guardrail says PASS.',
    responsePreview: 'Response Preview',
    guardrail: 'Guardrail',
    grounding: 'Grounding',
    messageType: 'Message Type',
    postprocessors: 'Postprocessors',
    tools: 'Tools',
    linkedIncidents: 'Linked Incidents',
    noLinkedIncidents: 'No linked incidents.',
    conversationSnapshot: 'Conversation Snapshot',
    conversationDescription: 'Conversation content from the linked chat log',
    openChatHistory: 'Open in Chat History',
    noChatLog: 'No linked chat log was found for this trace.',
    loading: 'Loading trace...',
    notFound: 'Trace detail not found.',
    reason: 'Reason',
    comment: 'Comment',
    guardrailReason: 'Guardrail Reason',
    guardrailActions: {
      PASS: 'No Intervention',
      SANITIZE: 'Sanitized',
      BLOCK: 'Blocked',
      FALLBACK: 'Fallback Used',
      LOCK: 'Locked',
      SUPPRESS: 'Suppressed'
    },
    responseSources: {
      llm: 'LLM',
      template: 'Template',
      fallback: 'Fallback',
      knowledge_base: 'Knowledge Base',
      tool: 'Tool Result',
      workflow: 'Workflow',
      system: 'System'
    },
    roles: {
      user: 'User',
      assistant: 'Assistant',
      system: 'System'
    }
  }
};

export function getRedAlertCopy(locale = 'tr') {
  const normalized = String(locale || 'tr').toLowerCase().split('-')[0];
  if (normalized === 'tr') return tr;
  return en;
}

export default getRedAlertCopy;
