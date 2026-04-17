import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Hook to fetch user profile
 * @returns {object} Query result with profile data
 */
export function useProfile() {
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: async () => {
      const response = await apiClient.settings.getProfile();
      return {
        name: response.data?.name || '',
        email: response.data?.email || '',
        company: response.data?.company || '',
        user: response.data?.user || null,
        business: response.data?.business || {},
        subscription: response.data?.subscription || null,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch email signature
 * @returns {object} Query result with signature data
 */
export function useEmailSignature() {
  return useQuery({
    queryKey: ['settings', 'emailSignature'],
    queryFn: async () => {
      try {
        const response = await apiClient.email.getSignature();
        return {
          signature: response.data?.emailSignature || '',
          signatureType: response.data?.signatureType || 'PLAIN',
        };
      } catch (error) {
        return {
          signature: '',
          signatureType: 'PLAIN',
        };
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch email pair stats
 * @returns {object} Query result with pair stats data
 */
export function useEmailPairStats() {
  return useQuery({
    queryKey: ['settings', 'emailPairStats'],
    queryFn: async () => {
      try {
        const response = await apiClient.email.getPairStats();
        return response.data;
      } catch (error) {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update profile
 * @returns {object} Mutation object
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData) => {
      return await apiClient.settings.updateProfile(profileData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
    },
  });
}

/**
 * Hook to update email signature
 * @returns {object} Mutation object
 */
export function useUpdateEmailSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (signatureData) => {
      return await apiClient.email.updateSignature(signatureData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'emailSignature'] });
    },
  });
}

/**
 * Hook to change password
 * @returns {object} Mutation object
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (passwordData) => {
      return await apiClient.settings.changePassword(passwordData);
    },
  });
}

/**
 * Hook to change login email
 * @returns {object} Mutation object
 */
export function useChangeEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      return await apiClient.auth.changeEmail(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
    },
  });
}

/**
 * Hook to delete account or workspace
 * @returns {object} Mutation object
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (payload) => {
      return await apiClient.settings.deleteAccount(payload);
    },
  });
}
