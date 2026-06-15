import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leaveApi } from '@/lib/api'
import toast from 'react-hot-toast'

export function useLeaveBalance(userId) {
  return useQuery({
    queryKey: ['leave', 'balance', userId ?? 'me'],
    queryFn:  () => leaveApi.balance(userId),
    staleTime: 120_000,
    enabled: userId !== false,
  })
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave', 'types'],
    queryFn:  leaveApi.types,
    staleTime: 600_000,
  })
}

export function useMyLeaves(params) {
  return useQuery({
    queryKey: ['leave', 'my_leaves', params],
    queryFn:  () => leaveApi.myLeaves(params),
  })
}

export function useLeaveList(params) {
  return useQuery({
    queryKey: ['leave', 'list', params],
    queryFn:  () => leaveApi.list(params),
  })
}

export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ data, file }) => leaveApi.apply(data, file ?? null),
    onSuccess:  () => {
      toast.success('Leave request submitted')
      qc.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useApproveLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }) => leaveApi.approve(id, comment),
    onSuccess:  () => {
      toast.success('Leave approved')
      qc.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useRejectLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comment }) => leaveApi.reject(id, comment),
    onSuccess:  () => {
      toast.success('Leave rejected')
      qc.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useCancelLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: leaveApi.cancel,
    onSuccess:  () => {
      toast.success('Leave cancelled')
      qc.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (e) => toast.error(e.message),
  })
}
