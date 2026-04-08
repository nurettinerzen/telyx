/**
 * API Helper Functions
 * Axios wrapper with authentication, error handling, and interceptors
 */

import axios from 'axios';
import { toast } from 'sonner';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL environment variable is not defined. Check your .env.local file.');
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

function isPublicAuthPath(pathname = '') {
  if (!pathname) return false;

  const publicPaths = new Set([
    '/login',
    '/register',
    '/signup',
    '/forgot-password',
    '/reset-password',
  ]);

  return publicPaths.has(pathname) || pathname.startsWith('/auth/');
}

// Response interceptor - Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'An error occurred';
    
    // Handle specific status codes
    if (error.response?.status === 401) {
      // WhatsApp connect hatası Meta'dan geliyor, logout yapma
      const isWhatsAppConnect = error.config?.url?.includes('/whatsapp/connect');
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isPublicAuthPage = isPublicAuthPath(pathname);
      
      if (!isWhatsAppConnect && !isPublicAuthPage && typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      // Public auth sayfalarındaysa hiçbir şey yapma, hatayı döndür
    } else if (error.response?.status === 403) {
      // Some locked-plan checks intentionally return 403 and should stay silent in UI.
      if (!error.config?.suppressExpected403) {
        toast.error('Access denied');
      }
    } else if (error.response?.status === 429) {
      toast.error('Too many requests. Please try again later.');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    
    return Promise.reject(error);
  }
);

// API helper functions
export const apiClient = {
  // Generic methods
  get: (url, config) => api.get(url, config),
  post: (url, data, config) => api.post(url, data, config),
  put: (url, data, config) => api.put(url, data, config),
  patch: (url, data, config) => api.patch(url, data, config),
  delete: (url, config) => api.delete(url, config),

  // Auth endpoints
  auth: {
    login: (credentials) => api.post('/api/auth/login', credentials),
    signup: (data) => api.post('/api/auth/signup', data),
    register: (data) => api.post('/api/auth/register', data),
    me: () => api.get('/api/auth/me'),
    logout: () => api.post('/api/auth/logout'),
    verifyEmail: (token) => api.post('/api/auth/verify-email', { token }),
    reauthenticate: (password) => api.post('/api/auth/reauthenticate', { password }),
    googleAuth: (credential) => api.post('/api/auth/google', { credential }),
    googleCodeAuth: (code) => api.post('/api/auth/google/code', { code }),
    adminMfaChallenge: () => api.post('/api/auth/admin-mfa/challenge'),
    adminMfaVerify: (challengeId, code) => api.post('/api/auth/admin-mfa/verify', { challengeId, code }),
    adminMfaStatus: () => api.get('/api/auth/admin-mfa/status'),
  },

  // Dashboard stats
  dashboard: {
    getStats: () => api.get('/api/dashboard/stats'),
    getRecentCalls: () => api.get('/api/dashboard/recent-calls'),
    getChartData: (timeRange = '7d') => api.get(`/api/dashboard/chart?range=${timeRange}`),
  },

  // Assistants
  assistants: {
    getAll: () => api.get('/api/assistants'),
    getById: (id) => api.get(`/api/assistants/${id}`),
    create: (data) => api.post('/api/assistants', data),
    update: (id, data) => api.put(`/api/assistants/${id}`, data),
    delete: (id) => api.delete(`/api/assistants/${id}`),
    getTemplates: (language) => api.get('/api/assistants/templates', { params: { language } }),
    sync: (id) => api.post(`/api/assistants/${id}/sync`),
  },

  // Calls
  // Calls
  calls: {
    getAll: (params) => api.get('/api/call-logs', { params }),
    getById: (id) => api.get(`/api/call-logs/${id}`),
    export: (format = 'csv') => api.get(`/api/call-logs/export?format=${format}`, { responseType: 'blob' }),
  },

  // Analytics
  analytics: {
    getOverview: (timeRange = '30d') => api.get(`/api/analytics/overview?range=${timeRange}`),
    getCallMetrics: (timeRange) => api.get(`/api/analytics/calls?range=${timeRange}`),
    getAssistantPerformance: () => api.get('/api/analytics/assistants'),
  },

  // Settings
  settings: {
    getProfile: () => api.get('/api/settings/profile'),
    updateProfile: (data) => api.put('/api/settings/profile', data),
    getNotifications: () => api.get('/api/settings/notifications'),
    updateNotifications: (data) => api.put('/api/settings/notifications', data),
    changePassword: (data) => api.post('/api/settings/change-password', data),
  },

  // Subscription - supports both Stripe and iyzico
  subscription: {
    getCurrent: () => api.get('/api/subscription/current'),
    getPlans: () => api.get('/api/subscription/plans'),
    getPaymentProvider: () => api.get('/api/subscription/payment-provider'),
    createCheckout: (data) => api.post('/api/subscription/create-checkout', data),
    createAddOnCheckout: (data) => api.post('/api/subscription/addons/checkout', data),
    upgrade: (planId, locale) => api.post('/api/subscription/upgrade', { planId, locale }),
    cancel: () => api.post('/api/subscription/cancel'),
    reactivate: () => api.post('/api/subscription/reactivate'),
    undoScheduledChange: () => api.post('/api/subscription/undo-scheduled-change'),
    getBillingHistory: () => api.get('/api/subscription/billing-history'),
    createPortalSession: () => api.post('/api/subscription/create-portal-session'),
  },

  // Credits - Kredi Sistemi
  credits: {
    getBalance: () => api.get('/api/credits/balance'),
    getPricing: () => api.get('/api/credits/pricing'),
    calculate: (minutes) => api.post('/api/credits/calculate', { minutes }),
    purchase: (minutes) => api.post('/api/credits/purchase', { minutes }),
    getHistory: (params) => api.get('/api/credits/history', { params }),
    getUsageLogs: (params) => api.get('/api/credits/usage-logs', { params }),
    canMakeCall: () => api.get('/api/credits/can-make-call'),
  },

  // Integrations
  integrations: {
    getAll: () => api.get('/api/integrations'),
    connect: (provider, data) => api.post(`/api/integrations/${provider}/connect`, data),
    disconnect: (provider) => api.post(`/api/integrations/${provider}/disconnect`),
    test: (provider) => api.post(`/api/integrations/${provider}/test`),
    sendWhatsAppTestMessage: (data) => api.post('/api/integrations/whatsapp/send', data),
  },

  // Knowledge Base
  knowledge: {
    // Documents
    getDocuments: () => api.get('/api/knowledge/documents'),
    getDocument: (id) => api.get(`/api/knowledge/documents/${id}`),
    uploadDocument: (formData) => api.post('/api/knowledge/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    deleteDocument: (id) => api.delete(`/api/knowledge/documents/${id}`),

    // FAQs
    getFaqs: () => api.get('/api/knowledge/faqs'),
    createFaq: (data) => api.post('/api/knowledge/faqs', data),
    updateFaq: (id, data) => api.put(`/api/knowledge/faqs/${id}`, data),
    deleteFaq: (id) => api.delete(`/api/knowledge/faqs/${id}`),

    // URLs
    getUrls: () => api.get('/api/knowledge/urls'),
    getUrl: (id) => api.get(`/api/knowledge/urls/${id}`),
    addUrl: (data) => api.post('/api/knowledge/urls', data),
    deleteUrl: (id) => api.delete(`/api/knowledge/urls/${id}`),
  },

  // Voices
  voices: {
    getAll: (options = {}) => api.get('/api/voices', { params: options }),
    getSample: (voiceId) => api.get(`/api/voices/sample/${voiceId}`),
  },

  // Business
  business: {
    get: (businessId) => api.get(`/api/business/${businessId}`),
    update: (businessId, data) => api.put(`/api/business/${businessId}`, data),
  },

  // Phone Numbers
  phoneNumbers: {
    getAll: () => api.get('/api/phone-numbers'),
    provision: (data) => api.post('/api/phone-numbers/provision', data),
    importSip: (data) => api.post('/api/phone-numbers/import-sip', data),
    updateRouting: (id, data) => api.patch(`/api/phone-numbers/${id}/routing`, data),
    delete: (id) => api.delete(`/api/phone-numbers/${id}`),
    testCall: (id, testPhoneNumber) => api.post(`/api/phone-numbers/${id}/test-call`, { testPhoneNumber }),
    getCountries: () => api.get('/api/phone-numbers/countries'),
  },

  // Demo Call
  demo: {
    requestCall: (data) => api.post('/api/demo/request-call', data),
    submitFeedback: (data) => api.post('/api/demo/feedback', data),
  },

  // Team Management
  team: {
    getMembers: () => api.get('/api/team'),
    updateRole: (userId, role) => api.put(`/api/team/${userId}/role`, { role }),
    removeMember: (userId) => api.delete(`/api/team/${userId}`),
    getInvitations: () => api.get('/api/team/invitations'),
    sendInvite: (data) => api.post('/api/team/invite', data),
    cancelInvite: (id) => api.delete(`/api/team/invitations/${id}`),
    resendInvite: (id) => api.post(`/api/team/invitations/${id}/resend`),
    getInvitationByToken: (token) => api.post('/api/team/invitation/lookup', { token }),
    acceptInvitation: (token, data) => api.post('/api/team/invitation/accept', { token, ...data }),
  },

  // Onboarding
  onboarding: {
    complete: () => api.post('/api/onboarding/complete'),
  },

  // ElevenLabs
  elevenlabs: {
    syncConversations: () => api.post('/api/elevenlabs/sync-conversations'),
  },

  // Email Features
  email: {
    // Status & Sync
    getStatus: () => api.get('/api/email/status'),
    sync: () => api.post('/api/email/sync'),
    getStats: () => api.get('/api/email/stats'),

    // Threads
    getThreads: (params) => api.get('/api/email/threads', { params }),
    getThread: (threadId) => api.get(`/api/email/threads/${threadId}`),
    closeThread: (threadId) => api.post(`/api/email/threads/${threadId}/close`),
    updateThread: (threadId, data) => api.patch(`/api/email/threads/${threadId}`, data),
    generateDraft: (threadId) => api.post(`/api/email/threads/${threadId}/generate-draft`),

    // Drafts
    getDrafts: () => api.get('/api/email/drafts'),
    getDraft: (draftId) => api.get(`/api/email/drafts/${draftId}`),
    updateDraft: (draftId, content) => api.put(`/api/email/drafts/${draftId}`, { content }),
    approveDraft: (draftId) => api.post(`/api/email/drafts/${draftId}/approve`),
    sendDraft: (draftId) => api.post(`/api/email/drafts/${draftId}/send`),
    rejectDraft: (draftId) => api.post(`/api/email/drafts/${draftId}/reject`),
    regenerateDraft: (draftId, feedback) => api.post(`/api/email/drafts/${draftId}/regenerate`, { feedback }),

    // Style Profile
    getStyleProfile: () => api.get('/api/email/style-profile'),
    analyzeStyleProfile: () => api.post('/api/email/style-profile/analyze'),

    // Email Classification
    classifyEmail: (data) => api.post('/api/email/classify', data),
    overrideClassification: (data) => api.post('/api/email/classify/override', data),
    getClassificationStats: () => api.get('/api/email/classify/stats'),

    // Email Signature
    getSignature: () => api.get('/api/email/signature'),
    updateSignature: (data) => api.put('/api/email/signature', data),
    getPairStats: () => api.get('/api/email/pairs/stats'),
  },

  // Customer Data (for AI assistant matching)
  customerData: {
    // File management (new file-based structure)
    getFiles: () => api.get('/api/customer-data/files'),
    getFile: (id, params) => api.get(`/api/customer-data/files/${id}`, { params }),
    deleteFile: (id) => api.delete(`/api/customer-data/files/${id}`),
    // Record management
    getAll: (params) => api.get('/api/customer-data', { params }),
    getById: (id) => api.get(`/api/customer-data/${id}`),
    create: (data) => api.post('/api/customer-data', data),
    update: (id, data) => api.put(`/api/customer-data/${id}`, data),
    delete: (id) => api.delete(`/api/customer-data/${id}`),
    bulkDelete: (ids) => api.delete('/api/customer-data/bulk', { data: { ids } }),
    lookup: (phone) => api.get('/api/customer-data/lookup', { params: { phone } }),
    getTags: () => api.get('/api/customer-data/tags/list'),
    // File operations
    parseFile: (formData) => api.post('/api/customer-data/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    importFile: (formData) => api.post('/api/customer-data/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    downloadTemplate: (type = 'accounting') => api.get(`/api/customer-data/template/${type}`, { responseType: 'blob' }),
  },

  // Callbacks (Geri Arama)
  callbacks: {
    getAll: (params) => api.get('/api/callbacks', { params }),
    getStats: () => api.get('/api/callbacks/stats'),
    getById: (id) => api.get(`/api/callbacks/${id}`),
    update: (id, data) => api.patch(`/api/callbacks/${id}`, data),
    delete: (id) => api.delete(`/api/callbacks/${id}`),
    retry: (id) => api.post(`/api/callbacks/${id}/retry`),
  },

  // Admin Panel
  admin: {
    // Stats
    getStats: () => api.get('/api/admin/stats'),

    // Users
    getUsers: (params) => api.get('/api/admin/users', { params }),
    getUser: (id) => api.get(`/api/admin/users/${id}`),
    updateUser: (id, data) => api.patch(`/api/admin/users/${id}`, data),
    suspendUser: (id, data) => api.post(`/api/admin/users/${id}/suspend`, data),
    resetPassword: (id) => api.post(`/api/admin/users/${id}/reset-password`),
    deleteUser: (id) => api.delete(`/api/admin/users/${id}`),

    // Assistants
    getAssistants: (params) => api.get('/api/admin/assistants', { params }),
    deleteAssistant: (id) => api.delete(`/api/admin/assistants/${id}`),

    // Calls
    getCalls: (params) => api.get('/api/admin/calls', { params }),

    // Callbacks
    getCallbacks: (params) => api.get('/api/admin/callbacks', { params }),
    updateCallback: (id, data) => api.patch(`/api/admin/callbacks/${id}`, data),

    // Subscriptions
    getSubscriptions: (params) => api.get('/api/admin/subscriptions', { params }),
    updateSubscription: (id, data) => api.patch(`/api/admin/subscriptions/${id}`, data),

    // Audit Log
    getAuditLogs: (params) => api.get('/api/admin/audit-log', { params }),

    // Enterprise (existing)
    getEnterpriseCustomers: () => api.get('/api/admin/enterprise-customers'),
    createEnterpriseCustomer: (data) => api.post('/api/admin/enterprise-customers', data),
    updateEnterpriseCustomer: (id, data) => api.put(`/api/admin/enterprise-customers/${id}`, data),
    generatePaymentLink: (id) => api.post(`/api/admin/enterprise-customers/${id}/payment-link`),
  },
};

export default api;
