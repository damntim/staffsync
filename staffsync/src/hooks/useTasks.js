import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/lib/api'
import toast from 'react-hot-toast'

export function useTaskList(params) {
  return useQuery({
    queryKey: ['tasks', 'list', params],
    queryFn:  () => tasksApi.list(params),
  })
}

export function useTask(id) {
  return useQuery({
    queryKey: ['tasks', 'get', id],
    queryFn:  () => tasksApi.get(id),
    enabled:  !!id,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApi.create,
    onSuccess:  () => {
      toast.success('Task created')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApi.update,
    onSuccess:  () => {
      toast.success('Task updated')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApi.delete,
    onSuccess:  () => {
      toast.success('Task deleted')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useSubtaskUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subtaskId, isDone }) => tasksApi.subtaskUpdate(subtaskId, isDone),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError:    (e) => toast.error(e.message),
  })
}

export function useCommentAdd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, text }) => tasksApi.commentAdd(taskId, text),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError:    (e) => toast.error(e.message),
  })
}
