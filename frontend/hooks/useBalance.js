import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Hook to fetch balance information
 * @returns {object} Query result with balance data
 */
export function useBalance() {
  return useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      const response = await apiClient.get('/api/balance');
      return response.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
