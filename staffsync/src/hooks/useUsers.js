import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import toast from 'react-hot-toast'

export function useUserList(params) {
  return useQuery({
    queryKey: ['users', 'list', params],
    queryFn:  () => usersApi.list(params),
  })
}

export function useUser(id) {
  return useQuery({
    queryKey: ['users', 'get', id],
    queryFn:  () => usersApi.get(id),
    enabled:  !!id,
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.update,
    onSuccess:  () => {
      toast.success('User updated')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess:  () => {
      toast.success('User deactivated')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useReactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.reactivate,
    onSuccess:  () => {
      toast.success('User reactivated')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useChangeRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }) => usersApi.changeRole(id, role),
    onSuccess:  () => {
      toast.success('Role updated')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: usersApi.changePassword,
    onSuccess:  () => toast.success('Password changed'),
    onError:    (e) => toast.error(e.message),
  })
}
