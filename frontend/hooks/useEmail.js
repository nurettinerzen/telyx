import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Hook to fetch email connection status
 * @returns {object} Query result with email status
 */
export function useEmailStatus() {
  return useQuery({
    queryKey: ['email', 'status'],
    queryFn: async () => {
      const response = await apiClient.get('/api/email/status');
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch email threads
 * @param {string|null} status - Optional status filter
 * @param {string|null} search - Optional search query
 * @returns {object} Query result with threads
 */
export function useEmailThreads(status = null, search = null) {
  return useQuery({
    queryKey: ['email', 'threads', status, search],
    queryFn: async () => {
      const params = { limit: 500 };
      if (status) {
        params.status = status;
      }
      if (search && search.trim()) {
        params.search = search.trim();
      }
      const response = await apiClient.get('/api/email/threads', { params });
      return response.data.threads || [];
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch email thread details
 * @param {string} threadId - Thread ID
 * @param {boolean} enabled - Whether to fetch
 * @returns {object} Query result with thread details
 */
export function useEmailThread(threadId, enabled = true) {
  return useQuery({
    queryKey: ['email', 'threads', threadId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/email/threads/${threadId}`);
      return response.data;
    },
    enabled: !!threadId && enabled,
    staleTime: 10000, // 10 seconds - thread details change frequently
  });
}

/**
 * Hook to fetch email statistics
 * @returns {object} Query result with email stats
 */
export function useEmailStats() {
  return useQuery({
    queryKey: ['email', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/email/stats');
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch customer data by email address
 * Used by email panel sidebar for customer context
 * @param {string} email - Customer email address
 * @returns {object} Query result with customer data + order stats
 */
export function useCustomerByEmail(email) {
  return useQuery({
    queryKey: ['customer-data', 'by-email', email],
    queryFn: async () => {
      const response = await apiClient.get('/api/customer-data/by-email', { params: { email } });
      return response.data;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
