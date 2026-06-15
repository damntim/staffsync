import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qrApi } from '@/lib/api'
import toast from 'react-hot-toast'

export function useQRZones() {
  return useQuery({
    queryKey: ['qr', 'zones'],
    queryFn:  qrApi.listZones,
    refetchInterval: 30_000,
  })
}

export function useRotateZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: qrApi.rotate,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['qr'] }),
    onError:    (e) => toast.error(e.message),
  })
}

export function useToggleZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }) => qrApi.toggleZone(id, active),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['qr'] }),
    onError:    (e) => toast.error(e.message),
  })
}

export function useValidateQR() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: qrApi.validate,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    onError:    (e) => toast.error(e.message),
  })
}

export function useCreateZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: qrApi.createZone,
    onSuccess:  () => {
      toast.success('Zone created')
      qc.invalidateQueries({ queryKey: ['qr'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useUpdateZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: qrApi.updateZone,
    onSuccess:  () => {
      toast.success('Zone updated')
      qc.invalidateQueries({ queryKey: ['qr'] })
    },
    onError: (e) => toast.error(e.message),
  })
}
