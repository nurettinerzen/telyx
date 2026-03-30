import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { LEGACY_PLAN_MAP } from '@/lib/planConfig';

function normalizePlan(plan) {
  const rawPlan = String(plan || '').trim().toUpperCase();
  return LEGACY_PLAN_MAP[rawPlan] || rawPlan || null;
}

/**
 * Hook to fetch available integrations
 * @returns {object} Query result with integrations data
 */
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await apiClient.get('/api/integrations/available');
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - integrations don't change often
  });
}

/**
 * Hook to fetch user plan
 * @returns {object} Query result with user plan data
 */
export function useUserPlan() {
  return useQuery({
    queryKey: ['userPlan'],
    queryFn: async () => {
      const response = await apiClient.get('/api/auth/me');
      let plan = normalizePlan(
        response.data?.business?.subscription?.plan
        || response.data?.subscription?.plan
        || response.data?.plan
      );

      if (!plan) {
        try {
          const subscriptionResponse = await apiClient.get('/api/subscription/current');
          plan = normalizePlan(subscriptionResponse.data?.plan);
        } catch (_error) {
          plan = null;
        }
      }

      return plan || 'FREE';
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch WhatsApp status
 * @returns {object} Query result with WhatsApp status
 */
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['integrations', 'whatsapp', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/integrations/whatsapp/status');
      return response.data;
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch iyzico status
 * @returns {object} Query result with iyzico status
 */
export function useIyzicoStatus() {
  return useQuery({
    queryKey: ['integrations', 'iyzico', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/iyzico/status');
      return response.data;
    },
    staleTime: 60000,
  });
}

/**
 * Hook to fetch email status
 * @returns {object} Query result with email status
 */
export function useEmailStatus() {
  return useQuery({
    queryKey: ['integrations', 'email', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/email/status');
      return response.data;
    },
    staleTime: 60000,
  });
}

/**
 * Hook to fetch Shopify status
 * @returns {object} Query result with Shopify status
 */
export function useShopifyStatus() {
  return useQuery({
    queryKey: ['integrations', 'shopify', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/shopify/status');
      return response.data;
    },
    staleTime: 60000,
  });
}

/**
 * Hook to fetch webhook status
 * @returns {object} Query result with webhook status
 */
export function useWebhookStatus() {
  return useQuery({
    queryKey: ['integrations', 'webhook', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/webhook/status');
      return response.data;
    },
    staleTime: 60000,
  });
}

/**
 * Hook to fetch CRM webhook status
 * @returns {object} Query result with { isActive, lastDataAt, hasWebhook }
 */
export function useCrmWebhookStatus({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['integrations', 'crm', 'status', enabled ? 'enabled' : 'disabled'],
    enabled,
    queryFn: async () => {
      try {
        const response = await apiClient.get('/api/crm/webhook', {
          // FREE/TRIAL locked plans can return 403 here; UI handles that gracefully.
          suppressExpected403: true,
        });
        const webhookData = response.data?.webhook;
        // Only show as "connected" if webhook has actually received data.
        // isActive defaults to true on auto-create, so lastDataAt is the real signal.
        const hasReceivedData = Boolean(webhookData?.lastDataAt);
        return {
          hasWebhook: true,
          isActive: (webhookData?.isActive ?? false) && hasReceivedData,
          lastDataAt: webhookData?.lastDataAt || null,
          stats: response.data?.stats || null,
          isLockedByAccess: false,
        };
      } catch (err) {
        if (err?.response?.status === 403) {
          return {
            hasWebhook: false,
            isActive: false,
            lastDataAt: null,
            stats: null,
            isLockedByAccess: true,
          };
        }

        // 404 means webhook is not configured yet.
        return {
          hasWebhook: false,
          isActive: false,
          lastDataAt: null,
          stats: null,
          isLockedByAccess: false,
        };
      }
    },
    staleTime: 60000,
  });
}

/**
 * Hook to fetch ikas status
 * @returns {object} Query result with ikas status
 */
export function useIkasStatus() {
  return useQuery({
    queryKey: ['integrations', 'ikas', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/integrations/ikas/status');
      return response.data;
    },
    staleTime: 60000,
  });
}

/**
 * Hook to connect WhatsApp
 * @returns {object} Mutation object
 */
export function useConnectWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      return await apiClient.post('/api/integrations/whatsapp/connect/manual', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'whatsapp', 'status'] });
    },
  });
}

/**
 * Hook to disconnect WhatsApp
 * @returns {object} Mutation object
 */
export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/whatsapp/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'whatsapp', 'status'] });
    },
  });
}

/**
 * Hook to refresh WhatsApp connection health/status
 * @returns {object} Mutation object
 */
export function useRefreshWhatsAppConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/whatsapp/refresh');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'whatsapp', 'status'] });
    },
  });
}

/**
 * Hook to connect iyzico
 * @returns {object} Mutation object
 */
export function useConnectIyzico() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      return await apiClient.post('/api/iyzico/connect', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'iyzico', 'status'] });
    },
  });
}

/**
 * Hook to disconnect iyzico
 * @returns {object} Mutation object
 */
export function useDisconnectIyzico() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/iyzico/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'iyzico', 'status'] });
    },
  });
}

/**
 * Hook to disconnect email
 * @returns {object} Mutation object
 */
export function useDisconnectEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/email/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'email', 'status'] });
    },
  });
}

/**
 * Hook to disconnect Shopify
 * @returns {object} Mutation object
 */
export function useDisconnectShopify() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/shopify/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'shopify', 'status'] });
    },
  });
}

/**
 * Hook to connect ikas
 * @returns {object} Mutation object
 */
export function useConnectIkas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      return await apiClient.post('/api/integrations/ikas/connect', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'ikas', 'status'] });
    },
  });
}

/**
 * Hook to disconnect ikas
 * @returns {object} Mutation object
 */
export function useDisconnectIkas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/ikas/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'ikas', 'status'] });
    },
  });
}

/**
 * Hook to setup webhook
 * @returns {object} Mutation object
 */
export function useSetupWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/webhook/setup');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'webhook', 'status'] });
    },
  });
}

/**
 * Hook to disable webhook
 * @returns {object} Mutation object
 */
export function useDisableWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/webhook/disable');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'webhook', 'status'] });
    },
  });
}

/**
 * Hook to regenerate webhook
 * @returns {object} Mutation object
 */
export function useRegenerateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/webhook/regenerate');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'webhook', 'status'] });
    },
  });
}

/**
 * Hook to disconnect Google Calendar
 * @returns {object} Mutation object
 */
export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/google-calendar/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

/**
 * Hook to disconnect Google Sheets
 * @returns {object} Mutation object
 */
export function useDisconnectGoogleSheets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/google-sheets/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

/**
 * Hook to test Google Calendar
 * @returns {object} Mutation object
 */
export function useTestGoogleCalendar() {
  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/google-calendar/test');
    },
  });
}

/**
 * Hook to test Google Sheets
 * @returns {object} Mutation object
 */
export function useTestGoogleSheets() {
  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/google-sheets/test');
    },
  });
}

/**
 * Hook to test ikas
 * @returns {object} Mutation object
 */
export function useTestIkas() {
  return useMutation({
    mutationFn: async () => {
      return await apiClient.post('/api/integrations/ikas/test');
    },
  });
}
