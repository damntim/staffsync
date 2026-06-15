import { create } from 'zustand'

export const useUIStore = create((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activeModal: null,
  notifications: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  collapseSidebar: (val) => set({ sidebarCollapsed: val }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  addNotification: (notif) =>
    set((s) => ({
      notifications: [{ id: Date.now(), ...notif }, ...s.notifications].slice(0, 50),
    })),
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  clearNotifications: () => set({ notifications: [] }),
}))
