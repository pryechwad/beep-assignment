import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '@/lib/api';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EVALUATOR';
}

/** The session lives in an httpOnly cookie; the client only asks the API who it is. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: SessionUser }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<{ user: SessionUser }>('/auth/login', body),
    onSuccess: (res) => qc.setQueryData(['session'], res.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      qc.setQueryData(['session'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'admin' });
      navigate('/admin/login');
    },
  });
}
