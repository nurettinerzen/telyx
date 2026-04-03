import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

function buildQueryString(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'ALL') {
      return;
    }
    params.append(key, String(value));
  });

  return params.toString();
}

export function useMarketplaceQuestions(filters = {}) {
  return useQuery({
    queryKey: ['marketplace-qa', 'questions', filters],
    queryFn: async () => {
      const query = buildQueryString(filters);
      const response = await apiClient.get(`/api/marketplace-qa/questions${query ? `?${query}` : ''}`);
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useMarketplaceQuestion(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['marketplace-qa', 'question', id],
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const response = await apiClient.get(`/api/marketplace-qa/questions/${id}`);
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useMarketplaceQaStats() {
  return useQuery({
    queryKey: ['marketplace-qa', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/marketplace-qa/stats');
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useMarketplaceQaSettings() {
  return useQuery({
    queryKey: ['marketplace-qa', 'settings'],
    queryFn: async () => {
      const response = await apiClient.get('/api/marketplace-qa/settings');
      return response.data;
    },
    staleTime: 30000,
  });
}

function invalidateMarketplaceQaQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['marketplace-qa'] });
  queryClient.invalidateQueries({ queryKey: ['integrations'] });
  queryClient.invalidateQueries({ queryKey: ['integrations', 'trendyol', 'status'] });
  queryClient.invalidateQueries({ queryKey: ['integrations', 'hepsiburada', 'status'] });
}

export function useApproveMarketplaceQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, answerText }) => {
      return await apiClient.post(`/api/marketplace-qa/questions/${id}/approve`, { answerText });
    },
    onSuccess: () => invalidateMarketplaceQaQueries(queryClient),
  });
}

export function useEditMarketplaceQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, answerText }) => {
      return await apiClient.post(`/api/marketplace-qa/questions/${id}/edit`, { answerText });
    },
    onSuccess: () => invalidateMarketplaceQaQueries(queryClient),
  });
}

export function useRejectMarketplaceQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, rejectionReason }) => {
      return await apiClient.post(`/api/marketplace-qa/questions/${id}/reject`, { rejectionReason });
    },
    onSuccess: () => invalidateMarketplaceQaQueries(queryClient),
  });
}

export function useUpdateMarketplaceQaSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ platform, qaSettings }) => {
      return await apiClient.put('/api/marketplace-qa/settings', { platform, qaSettings });
    },
    onSuccess: () => invalidateMarketplaceQaQueries(queryClient),
  });
}

