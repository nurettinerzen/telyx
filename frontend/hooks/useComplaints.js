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

export function useComplaintThreads(filters = {}) {
  return useQuery({
    queryKey: ['complaints', 'threads', filters],
    queryFn: async () => {
      const query = buildQueryString(filters);
      const response = await apiClient.get(`/api/complaints/threads${query ? `?${query}` : ''}`);
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useComplaintThread(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['complaints', 'thread', id],
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const response = await apiClient.get(`/api/complaints/threads/${id}`);
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useComplaintStats() {
  return useQuery({
    queryKey: ['complaints', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/complaints/stats');
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useComplaintSettings() {
  return useQuery({
    queryKey: ['complaints', 'settings'],
    queryFn: async () => {
      const response = await apiClient.get('/api/complaints/settings');
      return response.data;
    },
    staleTime: 30000,
  });
}

function invalidateComplaintQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['complaints'] });
  queryClient.invalidateQueries({ queryKey: ['integrations'] });
  queryClient.invalidateQueries({ queryKey: ['integrations', 'sikayetvar', 'status'] });
}

export function useApproveComplaintThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, answerText }) => {
      return await apiClient.post(`/api/complaints/threads/${id}/approve`, { answerText });
    },
    onSuccess: () => invalidateComplaintQueries(queryClient),
  });
}

export function useEditComplaintThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, answerText }) => {
      return await apiClient.post(`/api/complaints/threads/${id}/edit`, { answerText });
    },
    onSuccess: () => invalidateComplaintQueries(queryClient),
  });
}

export function useRejectComplaintThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, rejectionReason }) => {
      return await apiClient.post(`/api/complaints/threads/${id}/reject`, { rejectionReason });
    },
    onSuccess: () => invalidateComplaintQueries(queryClient),
  });
}

export function useUpdateComplaintSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ platform, complaintSettings }) => {
      return await apiClient.put('/api/complaints/settings', { platform, complaintSettings });
    },
    onSuccess: () => invalidateComplaintQueries(queryClient),
  });
}
