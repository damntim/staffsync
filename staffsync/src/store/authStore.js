import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      faceVerified: false,

      setAuth: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
      }),

      setFaceVerified: (val) => set({ faceVerified: val }),

      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        faceVerified: false,
      }),

      getRole: () => get().user?.role ?? null,

      hasRole: (roles) => {
        const role = get().user?.role
        if (!role) return false
        return Array.isArray(roles) ? roles.includes(role) : role === roles
      },
    }),
    {
      name: 'staffsync-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
