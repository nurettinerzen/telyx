import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Hook to fetch all assistants
 * @returns {object} Query result with assistants data
 */
export function useAssistants() {
  return useQuery({
    queryKey: ['assistants'],
    queryFn: async () => {
      const data = await apiClient.assistants.getAll();
      return data;
    },
    staleTime: 60000, // 1 minute - assistants don't change often
  });
}

/**
 * Hook to fetch all voices
 * @returns {object} Query result with voices data
 */
export function useVoices({ withSamples = false } = {}) {
  return useQuery({
    queryKey: ['voices', { withSamples }],
    queryFn: async () => {
      const data = await apiClient.voices.getAll({ withSamples: withSamples ? 'true' : undefined });
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - voices rarely change
  });
}

/**
 * Hook to fetch business info
 * @param {number} businessId - Business ID
 * @returns {object} Query result with business data
 */
export function useBusiness(businessId) {
  return useQuery({
    queryKey: ['business', businessId],
    queryFn: async () => {
      const data = await apiClient.business.get(businessId);
      return data;
    },
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a new assistant
 * @returns {object} Mutation object with mutate function
 */
export function useCreateAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      return await apiClient.assistants.create(formData);
    },
    onSuccess: () => {
      // Invalidate assistants cache to refetch
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
  });
}

/**
 * Hook to update an assistant
 * @returns {object} Mutation object with mutate function
 */
export function useUpdateAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }) => {
      return await apiClient.assistants.update(id, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
  });
}

/**
 * Hook to delete an assistant
 * @returns {object} Mutation object with mutate function
 */
export function useDeleteAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assistantId) => {
      return await apiClient.assistants.delete(assistantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
  });
}

/**
 * Hook to sync an assistant
 * @returns {object} Mutation object with mutate function
 */
export function useSyncAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assistantId) => {
      return await apiClient.assistants.sync(assistantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
  });
}
