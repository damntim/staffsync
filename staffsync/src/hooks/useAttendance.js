import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi } from '@/lib/api'
import toast from 'react-hot-toast'

export function useMyToday() {
  return useQuery({
    queryKey: ['attendance', 'my_today'],
    queryFn:  attendanceApi.myToday,
    staleTime: 60_000,
  })
}

export function useAttendanceList(params) {
  return useQuery({
    queryKey: ['attendance', 'list', params],
    queryFn:  () => attendanceApi.list(params),
  })
}

export function useAttendanceSummary(params) {
  return useQuery({
    queryKey: ['attendance', 'summary', params],
    queryFn:  () => attendanceApi.summary(params),
  })
}

export function useTeamToday() {
  return useQuery({
    queryKey: ['attendance', 'team_today'],
    queryFn:  attendanceApi.teamToday,
    refetchInterval: 60_000,
  })
}

export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: attendanceApi.checkIn,
    onSuccess:  () => {
      toast.success('Checked in successfully')
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useCheckOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: attendanceApi.checkOut,
    onSuccess:  () => {
      toast.success('Checked out successfully')
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useRegularise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: attendanceApi.regularise,
    onSuccess:  () => {
      toast.success('Regularisation request submitted')
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e) => toast.error(e.message),
  })
}
