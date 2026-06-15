import { useState, useRef, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/cn'
import { Bell, Search, Settings, ChevronRight, LogOut } from 'lucide-react'
import { useNotifications, useUnreadCount, useMarkRead } from '@/hooks/useNotifications'
import { authApi } from '@/lib/api'

const TYPE_DOT = {
  success:    '#10b981',
  warning:    '#f59e0b',
  error:      '#ef4444',
  leave:      '#22d3ee',
  attendance: '#6366f1',
  task:       '#a78bfa',
  face:       '#8b5cf6',
  qr:         '#06b6d4',
  info:       '#64748b',
}

function getBreadcrumb(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  return parts.map((p, i) => ({
    label: p.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    path: '/' + parts.slice(0, i + 1).join('/'),
  }))
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function Topbar() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen,  setUserOpen]  = useState(false)
  const notifRef = useRef(null)
  const userRef  = useRef(null)
  const breadcrumbs = getBreadcrumb(location.pathname)

  const { data: notifications = [] } = useNotifications(20)
  const { data: unread = 0 }         = useUnreadCount()
  const markRead                     = useMarkRead()

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userRef.current  && !userRef.current.contains(e.target))  setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleLogout() {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
  }

  return (
    <header
      className="h-16 flex items-center px-6 gap-4 flex-shrink-0 glass-strong border-b"
      style={{ borderColor: 'rgba(99,102,241,0.12)' }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 flex-1 min-w-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-text-muted flex-shrink-0" />}
            <span
              className={cn(
                'text-sm truncate',
                i === breadcrumbs.length - 1
                  ? 'font-semibold text-text-primary'
                  : 'text-text-muted'
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center',
            'text-text-muted hover:text-text-primary',
            'hover:bg-surface-3 border border-transparent hover:border-border-subtle',
            'transition-all duration-200'
          )}
        >
          <Search size={16} />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false) }}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center relative',
              'text-text-muted hover:text-text-primary',
              'hover:bg-surface-3 border border-transparent hover:border-border-subtle',
              'transition-all duration-200'
            )}
          >
            <Bell size={16} />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ background: '#6366f1', color: '#fff', boxShadow: '0 0 8px rgba(99,102,241,0.6)' }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-12 w-80 glass-strong rounded-2xl shadow-2xl z-50 overflow-hidden"
              style={{ border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: 'rgba(99,102,241,0.12)' }}>
                <span className="text-sm font-semibold text-text-primary">Notifications</span>
                {unread > 0 && (
                  <button
                    onClick={() => markRead.mutate(null)}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell size={24} className="mx-auto text-text-muted mb-2" />
                    <p className="text-sm text-text-muted">No notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markRead.mutate(n.id)}
                      className={cn(
                        'px-4 py-3 cursor-pointer transition-colors hover:bg-surface-3 border-b last:border-0',
                        !n.is_read && 'border-l-2'
                      )}
                      style={{
                        borderBottomColor: 'rgba(99,102,241,0.08)',
                        borderLeftColor: !n.is_read ? (TYPE_DOT[n.type] ?? '#6366f1') : undefined,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                          style={{ background: TYPE_DOT[n.type] ?? '#64748b' }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate">{n.title}</p>
                          <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-text-muted mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border-subtle mx-1" />

        {/* User chip + dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => { setUserOpen(!userOpen); setNotifOpen(false) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass border border-border-subtle hover:border-brand-500/30 transition-colors"
          >
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))',
                color: '#818cf8',
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <span className="text-xs font-medium text-text-secondary hidden sm:block">
              {user?.full_name?.split(' ')[0] ?? 'User'}
            </span>
          </button>

          {userOpen && (
            <div
              className="absolute right-0 top-12 w-48 glass-strong rounded-2xl shadow-2xl z-50 overflow-hidden py-1"
              style={{ border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                <p className="text-xs font-semibold text-text-primary truncate">{user?.full_name}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{user?.role?.replace('_',' ')}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                <Settings size={13} /> Settings
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-surface-3 transition-colors"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
