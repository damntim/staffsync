import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/cn'
import { chatApi } from '@/lib/api'
import { MessagesSquare, X, Minus } from 'lucide-react'

const ChatPage = lazy(() => import('@/pages/shared/ChatPage'))

export function AppShell({ children }) {
  const { sidebarCollapsed } = useUIStore()
  const { user } = useAuthStore()

  const [open,        setOpen]        = useState(false)
  const [minimised,   setMinimised]   = useState(false)
  const [unread,      setUnread]      = useState(0)
  const pollRef = useRef(null)

  /* poll total unread count for the badge */
  useEffect(() => {
    async function fetchUnread() {
      try {
        const counts = await chatApi.unreadCounts()
        const total  = Object.values(counts).reduce((s, v) => s + Number(v), 0)
        setUnread(total)
      } catch {}
    }
    fetchUnread()
    pollRef.current = setInterval(fetchUnread, 8000)
    return () => clearInterval(pollRef.current)
  }, [])

  /* clear badge when panel is opened */
  function toggleOpen() {
    setOpen(v => {
      if (!v) { setMinimised(false); setUnread(0) }
      return !v
    })
  }

  return (
    <div className="flex h-screen overflow-hidden mesh-bg">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 transition-all duration-300 ease-in-out">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* ── Floating chat bubble ─────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3" style={{ bottom: '24px', maxHeight: 'calc(100vh - 80px)' }}>

        {/* Chat panel */}
        {open && (
          <div
            className={cn(
              'rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200',
              minimised ? 'h-12' : '',
            )}
            style={{
              width: '780px',
              maxWidth: 'calc(100vw - 48px)',
              height: minimised ? '48px' : 'min(580px, calc(100vh - 120px))',
              background: 'rgba(13,17,23,0.97)',
              border: '1px solid rgba(99,102,241,0.25)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0 cursor-pointer select-none"
              style={{ borderBottom: minimised ? 'none' : '1px solid rgba(99,102,241,0.15)' }}
              onClick={() => setMinimised(v => !v)}
            >
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <MessagesSquare size={14} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-text-primary flex-1">Team Chat</span>
              <button
                onClick={e => { e.stopPropagation(); setMinimised(v => !v) }}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-all"
                title={minimised ? 'Expand' : 'Minimise'}
              >
                <Minus size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false) }}
                className="p-1 rounded-lg text-text-muted hover:text-danger-400 hover:bg-danger-500/10 transition-all"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Chat content */}
            {!minimised && (
              <div className="flex-1 min-h-0">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                  </div>
                }>
                  <ChatPage />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={toggleOpen}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 relative"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.45)' }}
          title="Team Chat"
        >
          {open
            ? <X size={22} className="text-white" />
            : <MessagesSquare size={22} className="text-white" />}

          {/* Unread badge */}
          {!open && unread > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
              style={{ background: '#ef4444', boxShadow: '0 2px 8px rgba(239,68,68,0.6)' }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
