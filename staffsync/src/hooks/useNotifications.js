import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export function useNotifications(limit = 30) {
  const isAuth = useAuthStore(s => s.isAuthenticated)
  return useQuery({
    queryKey:      ['notifications', limit],
    queryFn:       () => notificationsApi.list(limit),
    enabled:       isAuth,
    refetchInterval: 30_000,
  })
}

export function useUnreadCount() {
  const isAuth = useAuthStore(s => s.isAuthenticated)
  return useQuery({
    queryKey:      ['notifications', 'unread_count'],
    queryFn:       notificationsApi.unreadCount,
    enabled:       isAuth,
    refetchInterval: 15_000,
    select:        (d) => d?.count ?? 0,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
