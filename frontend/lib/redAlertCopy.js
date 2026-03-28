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
      none: 'Açık kalite olayı yok',
      unresolved: '{count} açık olay',
      enabled: 'Davranış ve geri bildirim sinyalleri',
      disabled: 'Panel kapalıysa sebebini burada gör'
    },
    ops: {
      title: 'Operasyon Olayları',
      subtitle: 'Araç ve akış sapmaları, tekrar sinyalleri'
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
      api: 'API',
      admin_draft: 'Yönetici Taslağı'
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
      pii_leak_block: 'PII Sızıntısı Engeli',
      sensitive_data_access: 'Hassas Veri Erişim Kaydı'
    },
    descriptions: {
      auth_failure: 'Yetkisiz ya da geçersiz kimlik doğrulama denemesi algılandı.',
      cross_tenant_attempt: 'Bir tenant verisine başka bir tenant bağlamından erişim denendi.',
      firewall_block: 'Gelen istek güvenlik duvarı tarafından riskli bulunup engellendi.',
      content_safety_block: 'Mesaj içerik güvenliği kurallarını ihlal ettiği için işlenmedi.',
      ssrf_block: 'Sunucu taraflı istek yönlendirme benzeri riskli bir URL isteği engellendi.',
      rate_limit_hit: 'Kısa sürede çok fazla istek geldiği için koruma devreye girdi.',
      webhook_invalid_signature: 'Webhook çağrısı doğrulanamadığı için reddedildi.',
      pii_leak_block: 'Dışarı çıkmaması gereken hassas veri yakalanıp engellendi.',
      sensitive_data_access: 'Bu bir saldırı değil, hassas veri ekranlarına yapılan erişim için tutulan audit kaydıdır.'
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
    TEMPLATE_FALLBACK_USED: 'Yedek Yanıt Kullanıldı',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Gerekli Araç Çağrılmadı',
    VERIFICATION_INCONSISTENT: 'Doğrulama Kayması',
    HALLUCINATION_RISK: 'Halüsinasyon Riski',
    RESPONSE_STUCK: 'Tekrarlayan Yanıt'
  },
  opsCategories: {
    LLM_BYPASSED: 'LLM Atlandı',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Gerekli Araç Çağrılmadı'
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
    description: 'Gerçekten engellenen veya riskli bulunan güvenlik istekleri. Normal audit erişimleri bu listede gösterilmez.',
    empty: 'Güvenlik olayı bulunamadı',
    explanationTitle: 'Bu olay ne demek?',
    explanationFallback: 'Bu olay için kısa açıklama henüz eklenmemiş.',
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
      intervention: 'Müdahale',
      negativeFeedback: 'Negatif Geri Bildirim',
      turn: 'tur',
      feedback: 'geri bildirim'
    },
    title: 'Asistan Kalitesi',
    description: 'Kullanıcıya gerçekten yansıyan sorunlar ve kullanıcı geri bildirimleri.',
    empty: 'Asistan olayı bulunamadı',
    pagination: '{start} - {end} / toplam {total} olay',
    table: {
      time: 'Zaman',
      summary: 'Ne Oldu?',
      signals: 'Sinyaller',
      severity: 'Önem',
      status: 'Durum',
      action: 'İşlem'
    },
    additionalSignals: '+{count} ek sinyal',
    signalDescriptions: {
      ASSISTANT_BLOCKED: 'Yanıt kullanıcıya ulaşmadan önce güvenlik katmanı tarafından durduruldu.',
      ASSISTANT_SANITIZED: 'Yanıt kullanıcıya gitti ancak bazı alanlar maskelemeyle değiştirildi.',
      ASSISTANT_NEEDS_CLARIFICATION: 'Asistan devam etmek için ek bilgi istedi.',
      ASSISTANT_INTERVENTION: 'Yanıt son anda kural veya son işlem katmanı tarafından değiştirildi.',
      ASSISTANT_NEGATIVE_FEEDBACK: 'Kullanıcı bu yanıtı faydalı bulmadığını işaretledi.',
      ASSISTANT_POSITIVE_FEEDBACK: 'Kullanıcı bu yanıtı faydalı bulduğunu işaretledi.',
      LLM_BYPASSED: 'Bu turda modelden normal bir yanıt üretilmedi; sistem kurallı akış kullandı.',
      TEMPLATE_FALLBACK_USED: 'Asıl yanıt yerine hazır veya yedek yanıt kullanıldı.',
      TOOL_NOT_CALLED_WHEN_EXPECTED: 'Sistem araç kullanmalıydı ancak kullanmadan devam etti.',
      VERIFICATION_INCONSISTENT: 'Doğrulama tamamlanmadan fazla kesin bir ifade kullanılmış olabilir.',
      HALLUCINATION_RISK: 'Araç ya da kayıt dayanağı olmadan kesin bilgi verilmiş olabilir.',
      RESPONSE_STUCK: 'Aynı oturumda benzer bir yanıt tekrar etmiş görünüyor.'
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
  incidentActions: {
    ASSISTANT_BLOCKED: 'Kontrol: Blok gerçekten gerekli miydi?',
    ASSISTANT_SANITIZED: 'Kontrol: Maskelenen alan gerçekten hassas mıydı?',
    ASSISTANT_INTERVENTION: 'Kontrol: Müdahale gereğinden sert miydi?',
    ASSISTANT_NEGATIVE_FEEDBACK: 'Kontrol: Kullanıcı tam olarak neye itiraz etti?',
    ASSISTANT_POSITIVE_FEEDBACK: 'Not: Bu yanıt iyi örnek olabilir.',
    TEMPLATE_FALLBACK_USED: 'Kontrol: Neden yedek yanıta düşüldü?',
    LLM_BYPASSED: 'Kontrol: Neden kurallı akış devreye girdi?',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Kontrol: Araç neden çalışmadı?',
    VERIFICATION_INCONSISTENT: 'Kontrol: Doğrulama durumu ile ifade uyumlu mu?',
    HALLUCINATION_RISK: 'Kontrol: Kesin ifade için dayanak var mı?',
    RESPONSE_STUCK: 'Kontrol: Aynı oturumda tekrar neden oluştu?'
  },
  ops: {
    title: 'Operasyon Olayları',
    description: 'Kullanıcıya doğrudan yansımayan araç ve akış sorunları. Tekrarlayan yanıtlar aşağıda ayrı tabloda gösterilir.',
    repeatTitle: 'Tekrarlayan Yanıtlar',
    repeatDescription: 'Yalnızca aynı oturum içinde birden fazla kez tekrar eden yanıtlar.',
    repeatEmpty: 'Tekrarlayan yanıt bulunamadı',
    eventsEmpty: 'Operasyon olayı bulunamadı',
    pagination: '{start} - {end} / toplam {total} olay',
    metrics: {
      bypassRate: 'Atlama Oranı',
      repeatRate: 'Tekrar Oranı',
      toolSuccess: 'Araç Başarı Oranı',
      bypassHint: 'LLM atlanan turlar / toplam tur',
      repeatHint: 'aynı oturumda tekrar eden yanıtlar',
      toolSuccessHint: 'araç çağrılan turlarda başarı'
    },
    table: {
      hash: 'İmza',
      channel: 'Kanal',
      session: 'Oturum',
      count: 'Tekrar',
      sample: 'Örnek Yanıt',
      trace: 'İşlem',
      time: 'Zaman',
      category: 'Kategori',
      severity: 'Önem',
      summary: 'Sinyal',
      status: 'Durum',
      action: 'İşlem'
    },
    actions: {
      viewTrace: 'İncele',
      resolve: 'Çözüldü olarak işaretle',
      reopen: 'Tekrar aç'
    },
    notifications: {
      resolved: 'Operasyon olayı çözüldü olarak işaretlendi',
      reopened: 'Operasyon olayı tekrar açıldı',
      updateFailed: 'Operasyon olayı güncellenemedi'
    }
  },
  traceModal: {
    title: 'Yanıt İncelemesi',
    trace: 'Referans Kimliği',
    channel: 'Kanal',
    responseSource: 'Yanıt Kaynağı',
    createdAt: 'Zaman',
    latency: 'İşleme Süresi',
    llmUsed: 'LLM Kullanıldı mı',
    toolsCalled: 'Araç Çağrısı Sayısı',
    toolSuccess: 'Araçlar Başarılı mı',
    session: 'Oturum Kimliği',
    incidentSummaryTitle: 'Sinyaller',
    incidentSummaryDescription: '',
    overviewTitle: 'Özet',
    overviewDescription: '',
    technicalDetails: 'Teknik Alanlar',
    technicalDescription: 'Gerekirse açabileceğin düşük seviye iz bilgileri.',
    payloadTitle: 'İz Kaydı İçeriği',
    payloadDescription: '',
    guardrailNote: '',
    responsePreview: 'Yanıt',
    guardrail: 'Son Güvenlik Kontrolü',
    grounding: 'Yanıt Dayanağı',
    messageType: 'Yanıt Türü',
    postprocessors: 'Son İşlemler',
    tools: 'Araç Çağrıları',
    linkedIncidents: 'Bağlı Olaylar',
    noLinkedIncidents: 'Bağlı olay yok.',
    noAssistantSignals: 'Bu yanıtta kullanıcıya yansıyan ek bir kalite sinyali görünmüyor.',
    noOpsSignals: 'Bu kayıtta gösterilecek ek operasyon sinyali görünmüyor.',
    conversationSnapshot: 'Konuşma Akışı',
    conversationDescription: 'Bağlı sohbet kaydındaki mesaj akışı',
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
    groundingValues: {
      GROUNDED: 'Doğrulandı',
      CLARIFICATION: 'Netleştirme',
      UNGROUNDED: 'Dayanak Zayıf'
    },
    messageTypes: {
      true_clarification: 'Netleştirme Yanıtı',
      clarification: 'Netleştirme Yanıtı',
      normal: 'Normal Yanıt',
      fallback: 'Yedek Yanıt'
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
      none: 'No open quality issues',
      unresolved: '{count} open issues',
      enabled: 'Behavior and feedback signals',
      disabled: 'See why the panel is disabled'
    },
    ops: {
      title: 'Operational Events',
      subtitle: 'Tool and flow anomalies, plus repeat signals'
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
      api: 'API',
      admin_draft: 'Admin Draft'
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
      pii_leak_block: 'PII Leak Block',
      sensitive_data_access: 'Sensitive Data Access Audit'
    },
    descriptions: {
      auth_failure: 'An unauthorized or invalid authentication attempt was detected.',
      cross_tenant_attempt: 'Data access was attempted across tenant boundaries.',
      firewall_block: 'The request was blocked by the security firewall.',
      content_safety_block: 'The message violated content safety rules and was not processed.',
      ssrf_block: 'A suspicious server-side request pattern was blocked.',
      rate_limit_hit: 'Protection was triggered due to too many requests in a short time.',
      webhook_invalid_signature: 'The webhook call was rejected because verification failed.',
      pii_leak_block: 'Sensitive data was detected and blocked before exposure.',
      sensitive_data_access: 'This is not an attack. It is an audit record for access to sensitive data screens.'
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
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Required Tool Was Skipped'
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
    description: 'Requests that were actually blocked or flagged as risky. Normal audit access logs are excluded here.',
    empty: 'No security events found',
    explanationTitle: 'What does this mean?',
    explanationFallback: 'A short explanation has not been added for this event yet.',
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
      intervention: 'Intervention',
      negativeFeedback: 'Negative Feedback',
      turn: 'turn',
      feedback: 'feedback'
    },
    title: 'Assistant Quality',
    description: 'Issues that actually affected the user, plus direct user feedback.',
    empty: 'No assistant events found',
    pagination: '{start} - {end} / {total} total events',
    table: {
      time: 'Time',
      summary: 'What Happened?',
      signals: 'Signals',
      severity: 'Severity',
      status: 'Status',
      action: 'Action'
    },
    additionalSignals: '+{count} more signals',
    signalDescriptions: {
      ASSISTANT_BLOCKED: 'The response was stopped by a safety layer before reaching the user.',
      ASSISTANT_SANITIZED: 'The response reached the user, but some fields were masked.',
      ASSISTANT_NEEDS_CLARIFICATION: 'The assistant asked for more information before continuing.',
      ASSISTANT_INTERVENTION: 'The reply was changed at the last stage by rules or post-processing.',
      ASSISTANT_NEGATIVE_FEEDBACK: 'The user marked this response as not helpful.',
      ASSISTANT_POSITIVE_FEEDBACK: 'The user marked this response as helpful.',
      LLM_BYPASSED: 'The system did not generate a normal model reply for this turn and used a rule-based path instead.',
      TEMPLATE_FALLBACK_USED: 'A ready-made or fallback reply was used instead of a normal answer.',
      TOOL_NOT_CALLED_WHEN_EXPECTED: 'The system should have used a tool but continued without it.',
      VERIFICATION_INCONSISTENT: 'The reply may sound too certain before verification finished.',
      HALLUCINATION_RISK: 'The reply may contain a definite claim without tool or record evidence.',
      RESPONSE_STUCK: 'A very similar reply repeated in the same session.'
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
  incidentActions: {
    ASSISTANT_BLOCKED: 'Check: Was the block actually necessary?',
    ASSISTANT_SANITIZED: 'Check: Was the masked span truly sensitive?',
    ASSISTANT_INTERVENTION: 'Check: Was the intervention too aggressive?',
    ASSISTANT_NEGATIVE_FEEDBACK: 'Check: What exactly did the user object to?',
    ASSISTANT_POSITIVE_FEEDBACK: 'Note: This may be a good reference reply.',
    TEMPLATE_FALLBACK_USED: 'Check: Why did it fall back?',
    LLM_BYPASSED: 'Check: Why did the rule-based path run?',
    TOOL_NOT_CALLED_WHEN_EXPECTED: 'Check: Why was the tool not run?',
    VERIFICATION_INCONSISTENT: 'Check: Does wording match verification state?',
    HALLUCINATION_RISK: 'Check: Is there evidence for the definite claim?',
    RESPONSE_STUCK: 'Check: Why did the reply repeat in the same session?'
  },
  ops: {
    title: 'Operational Events',
    description: 'Tool and flow anomalies that do not always become user-facing failures. Repeated replies are shown in a separate table below.',
    repeatTitle: 'Repeated Responses',
    repeatDescription: 'Only replies repeated multiple times within the same session.',
    repeatEmpty: 'No repeated responses found',
    eventsEmpty: 'No operational events found',
    pagination: '{start} - {end} / {total} total events',
    metrics: {
      bypassRate: 'Bypass Rate',
      repeatRate: 'Repeat Rate',
      toolSuccess: 'Tool Success Rate',
      bypassHint: 'LLM bypass / total turns',
      repeatHint: 'replies repeated in the same session',
      toolSuccessHint: 'success on turns with tool calls'
    },
    table: {
      hash: 'Fingerprint',
      channel: 'Channel',
      session: 'Session',
      count: 'Repeats',
      sample: 'Sample Reply',
      trace: 'Action',
      time: 'Time',
      category: 'Category',
      severity: 'Severity',
      summary: 'Signal',
      status: 'Status',
      action: 'Action'
    },
    actions: {
      viewTrace: 'Review',
      resolve: 'Mark as resolved',
      reopen: 'Reopen'
    },
    notifications: {
      resolved: 'Operational event marked as resolved',
      reopened: 'Operational event reopened',
      updateFailed: 'Failed to update operational event'
    }
  },
  traceModal: {
    title: 'Reply Review',
    trace: 'Reference ID',
    channel: 'Channel',
    responseSource: 'Response Source',
    createdAt: 'Time',
    latency: 'Processing Time',
    llmUsed: 'LLM Used',
    toolsCalled: 'Tool Call Count',
    toolSuccess: 'Were Tools Successful?',
    session: 'Session ID',
    incidentSummaryTitle: 'Signals',
    incidentSummaryDescription: '',
    overviewTitle: 'Overview',
    overviewDescription: '',
    technicalDetails: 'Technical Fields',
    technicalDescription: 'Lower-level trace fields you can expand if needed.',
    payloadTitle: 'Trace Payload',
    payloadDescription: '',
    guardrailNote: '',
    responsePreview: 'Reply',
    guardrail: 'Final Safety Check',
    grounding: 'Grounding',
    messageType: 'Reply Type',
    postprocessors: 'Postprocessors',
    tools: 'Tools',
    linkedIncidents: 'Linked Incidents',
    noLinkedIncidents: 'No linked incidents.',
    noAssistantSignals: 'No additional user-facing quality signal is visible for this reply.',
    noOpsSignals: 'No additional operational signal is visible for this record.',
    conversationSnapshot: 'Conversation Flow',
    conversationDescription: 'Message flow from the linked chat log',
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
    groundingValues: {
      GROUNDED: 'Verified',
      CLARIFICATION: 'Clarification',
      UNGROUNDED: 'Weak Grounding'
    },
    messageTypes: {
      true_clarification: 'Clarification Reply',
      clarification: 'Clarification Reply',
      normal: 'Normal Reply',
      fallback: 'Fallback Reply'
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
