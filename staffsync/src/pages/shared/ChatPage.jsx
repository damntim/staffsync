/**
 * StaffSync Chat — WhatsApp-style
 * - DMs, public group, team groups, status/stories
 * - @mention with dropdown (type @ to tag someone, @all to tag everyone)
 * - File/image/video attachments, reply-to, emoji reactions
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { chatApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  Send, Paperclip, X, Search, Plus,
  ChevronLeft, Smile, Reply, Trash2, Eye,
  Users, Globe, MessageCircle, FileText, CheckCheck, Camera,
  Download, ZoomIn, AtSign,
} from 'lucide-react'

const POLL_MS = 3000

/* ── helpers ─────────────────────────────────────── */
function timeAgo(d) {
  if (!d) return ''
  const sec = Math.floor((Date.now() - new Date(d)) / 1000)
  if (sec < 60)    return 'just now'
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
const fmt  = d => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
const uid  = v => parseInt(v, 10)   // PHP returns strings — always cast to int before comparing

const EMOJIS = ['👍','❤️','😂','😮','😢','🙏','🔥','✅','👏','🎉']

/* render message body — highlight @mentions */
function renderBody(body) {
  if (!body) return null
  const parts = body.split(/(@\w[\w\s]*?\b)/g)
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="font-semibold text-brand-300 bg-brand-500/15 rounded px-0.5">{p}</span>
      : p
  )
}

/* ═══════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════ */
export default function ChatPage() {
  const { user } = useAuthStore()
  const myId = uid(user?.id ?? 0)

  const [channels,       setChannels]       = useState([])
  const [activeChannel,  setActiveChannel]  = useState(null)
  const [messages,       setMessages]       = useState([])
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [channelMembers, setChannelMembers] = useState([])  // for @mention

  const [view,           setView]           = useState('chat')
  const [showSideSearch, setShowSideSearch] = useState(false)
  const [sideQ,          setSideQ]          = useState('')
  const [userResults,    setUserResults]    = useState([])
  const [showNewGroup,   setShowNewGroup]   = useState(false)
  const [showStatusPost, setShowStatusPost] = useState(false)
  const [statuses,       setStatuses]       = useState([])
  const [activeStatus,   setActiveStatus]   = useState(null)
  const [mobileShowChat, setMobileShowChat] = useState(false)

  /* composer */
  const [text,        setText]        = useState('')
  const [replyTo,     setReplyTo]     = useState(null)
  const [attach,      setAttach]      = useState(null)
  const [emojiMsg,    setEmojiMsg]    = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  /* @mention */
  const [mentionQ,    setMentionQ]    = useState('')   // text after @
  const [mentionList, setMentionList] = useState([])   // dropdown options
  const [mentionIdx,  setMentionIdx]  = useState(0)    // keyboard nav
  const [mentionOpen, setMentionOpen] = useState(false)

  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)
  const textareaRef    = useRef(null)
  const pollRef        = useRef(null)
  const lastMsgIdRef   = useRef(0)

  /* ── load channels ── */
  const loadChannels = useCallback(async () => {
    try { setChannels(await chatApi.channelList()) } catch {}
  }, [])

  useEffect(() => {
    loadChannels()
    chatApi.statusList().then(setStatuses).catch(() => {})
    const t = setInterval(loadChannels, POLL_MS * 2)
    return () => clearInterval(t)
  }, [loadChannels])

  /* ── load messages on channel change ── */
  useEffect(() => {
    if (!activeChannel) return
    setMessages([])
    lastMsgIdRef.current = 0
    setLoadingMsgs(true)
    setMentionOpen(false)

    chatApi.messageList(activeChannel.id, { limit: 60 })
      .then(msgs => {
        const arr = Array.isArray(msgs) ? msgs : []
        setMessages(arr)
        if (arr.length) lastMsgIdRef.current = uid(arr[arr.length - 1].id)
        setLoadingMsgs(false)
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      })
      .catch(err => { console.error('[ChatPage] messageList failed:', err); setLoadingMsgs(false) })

    chatApi.markRead(activeChannel.id, 0).catch(() => {})

    /* fetch members for @ mentions */
    chatApi.channelMembers(activeChannel.id).then(setChannelMembers).catch(() => {})

    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const raw = await chatApi.messageList(activeChannel.id, { limit: 60 })
        const all = Array.isArray(raw) ? raw : []
        setMessages(all)
        if (all.length) {
          const lastId = uid(all[all.length - 1].id)
          if (lastId !== lastMsgIdRef.current) {
            lastMsgIdRef.current = lastId
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
            chatApi.markRead(activeChannel.id, lastId).catch(() => {})
            loadChannels()
          }
        }
      } catch (e) { console.error('[ChatPage] poll failed:', e) }
    }, POLL_MS)

    return () => clearInterval(pollRef.current)
  }, [activeChannel?.id, loadChannels])

  /* ── side search (DM people) ── */
  useEffect(() => {
    if (!showSideSearch || !sideQ.trim()) { setUserResults([]); return }
    const t = setTimeout(async () => {
      try { setUserResults(await chatApi.searchUsers(sideQ)) } catch { setUserResults([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [sideQ, showSideSearch])

  /* ── @mention filtering ── */
  useEffect(() => {
    if (!mentionOpen) { setMentionList([]); return }
    const q = mentionQ.toLowerCase()
    const base = [{ id: 'all', full_name: 'all', dept: 'Tag everyone' }, ...channelMembers]
    const filtered = base.filter(m =>
      m.full_name.toLowerCase().includes(q) && uid(m.id) !== myId
    )
    setMentionList(filtered)
    setMentionIdx(0)
  }, [mentionQ, mentionOpen, channelMembers, myId])

  /* ── open DM ── */
  async function openDM(peerId) {
    try {
      const res = await chatApi.dmOpen(peerId)
      const updated = await chatApi.channelList()
      setChannels(updated)
      const ch = updated.find(c => uid(c.id) === uid(res.channel_id))
      if (ch) { setActiveChannel(ch); setMobileShowChat(true) }
      setShowSideSearch(false); setSideQ('')
    } catch {}
  }

  /* ── textarea change — detect @ trigger ── */
  function handleTextChange(e) {
    const val = e.target.value
    setText(val)

    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match  = before.match(/@(\w*)$/)
    if (match) {
      setMentionQ(match[1])
      setMentionOpen(true)
    } else {
      setMentionOpen(false)
    }
  }

  /* ── pick @mention from dropdown ── */
  function pickMention(member) {
    const tag    = member.id === 'all' ? '@all' : `@${member.full_name}`
    const cursor = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const after  = text.slice(cursor)
    const replaced = before.replace(/@\w*$/, tag + ' ')
    setText(replaced + after)
    setMentionOpen(false)
    setTimeout(() => {
      textareaRef.current?.focus()
      const pos = replaced.length
      textareaRef.current?.setSelectionRange(pos, pos)
    }, 10)
  }

  /* ── keyboard nav in mention dropdown ── */
  function handleKeyDown(e) {
    if (mentionOpen && mentionList.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionList.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[mentionIdx]); return }
      if (e.key === 'Escape') { setMentionOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) { e.preventDefault(); sendMessage() }
  }

  /* ── send ── */
  async function sendMessage() {
    if (!activeChannel || (!text.trim() && !attach)) return
    const chanId = activeChannel.id
    try {
      let msg
      if (attach) {
        const fd = new FormData()
        fd.append('channel_id', chanId)
        if (text.trim())  fd.append('body', text.trim())
        if (replyTo)      fd.append('reply_to_id', replyTo.id)
        fd.append('file', attach.file)
        msg = await chatApi.messageSendFile(fd)
      } else {
        msg = await chatApi.messageSend({
          channel_id:  chanId,
          body:        text.trim(),
          reply_to_id: replyTo?.id ?? null,
        })
      }
      setMessages(prev => [...prev, { ...msg, reactions: msg.reactions ?? [] }])
      lastMsgIdRef.current = uid(msg.id)
      setText(''); setAttach(null); setReplyTo(null)
      setMentionOpen(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
      loadChannels()
    } catch (err) { alert(err.message) }
  }

  /* ── reactions ── */
  async function toggleReaction(msgId, emoji) {
    const msg     = messages.find(m => uid(m.id) === uid(msgId))
    const already = msg?.reactions?.find(r => uid(r.user_id) === myId && r.emoji === emoji)
    try {
      if (already) await chatApi.removeReaction(msgId, emoji)
      else         await chatApi.react(msgId, emoji)
      setMessages(prev => prev.map(m => {
        if (uid(m.id) !== uid(msgId)) return m
        const reactions = already
          ? m.reactions.filter(r => !(uid(r.user_id) === myId && r.emoji === emoji))
          : [...(m.reactions ?? []), { emoji, user_id: myId, user_name: user.full_name }]
        return { ...m, reactions }
      }))
    } catch {}
    setEmojiMsg(null); setShowEmojiPicker(false)
  }

  /* ── delete ── */
  async function deleteMessage(mid) {
    if (!confirm('Delete this message?')) return
    await chatApi.messageDelete(mid)
    setMessages(prev => prev.map(m => uid(m.id) === uid(mid) ? { ...m, is_deleted: true, body: null } : m))
  }

  /* ── file pick ── */
  function pickFile(e) {
    const file = e.target.files[0]; if (!file) return
    const ext  = file.name.split('.').pop().toLowerCase()
    const type = ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image'
               : ['mp4','webm','mov'].includes(ext)              ? 'video'
               : ['mp3','wav','ogg','m4a'].includes(ext)         ? 'audio' : 'doc'
    setAttach({ file, preview: type === 'image' ? URL.createObjectURL(file) : null, type, name: file.name })
    e.target.value = ''
  }

  /* ── status post ── */
  async function postStatus({ file, caption }) {
    const fd = new FormData(); fd.append('media', file)
    if (caption) fd.append('caption', caption)
    await chatApi.statusPost(fd)
    setStatuses(await chatApi.statusList())
    setShowStatusPost(false)
  }

  const filteredChannels = channels.filter(c =>
    !sideQ || (c.dm_peer_name ?? c.name ?? '').toLowerCase().includes(sideQ.toLowerCase())
  )

  /* ═══ RENDER ═══════════════════════════════════════ */
  return (
    <div className="flex h-full rounded-2xl overflow-hidden"
      style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid rgba(99,102,241,0.15)' }}>

      {/* ── SIDEBAR ──────────────────────────────────── */}
      <div className={cn(
        'flex flex-col border-r flex-shrink-0 transition-all',
        mobileShowChat ? 'hidden md:flex md:w-72' : 'flex w-full md:w-72',
      )} style={{ borderColor: 'rgba(99,102,241,0.15)' }}>

        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
          <div className="flex gap-1 mr-auto">
            <TabBtn active={view === 'chat'} onClick={() => setView('chat')}>Chats</TabBtn>
            <TabBtn active={view === 'status'} onClick={() => setView('status')}
              dot={statuses.filter(s => !s.is_own && !s.viewed).length > 0}>
              Status
            </TabBtn>
          </div>
          <IconBtn title="Search / New DM" onClick={() => setShowSideSearch(v => !v)}><Search size={16} /></IconBtn>
          <IconBtn title="New group" onClick={() => setShowNewGroup(true)}><Plus size={16} /></IconBtn>
        </div>

        {/* Search / DM finder */}
        {showSideSearch && (
          <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(99,102,241,0.12)' }}>
            <SearchBar value={sideQ} onChange={setSideQ}
              placeholder="Search people or chats…"
              onClear={() => { setShowSideSearch(false); setSideQ(''); setUserResults([]) }} />
            {userResults.map(u => (
              <button key={u.id} onClick={() => openDM(u.id)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-3 text-left mt-1">
                <Avatar name={u.full_name} size={32} />
                <div>
                  <p className="text-sm font-medium text-text-primary">{u.full_name}</p>
                  <p className="text-[10px] text-text-muted">{u.department} · {u.role}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {view === 'status' ? (
          <StatusList statuses={statuses} currentUser={user}
            onView={setActiveStatus} onPost={() => setShowStatusPost(true)}
            onDelete={async sid => { await chatApi.statusDelete(sid); setStatuses(p => p.filter(s => uid(s.id) !== uid(sid))) }} />
        ) : (
          <div className="flex-1 overflow-y-auto py-1">
            {filteredChannels.length === 0 && <p className="text-center text-text-muted text-sm py-12">No chats yet</p>}
            {filteredChannels.map(ch => {
              const isActive = uid(activeChannel?.id) === uid(ch.id)
              const name     = ch.type === 'dm' ? ch.dm_peer_name : ch.name
              const preview  = ch.last_msg_body ?? (ch.last_msg_attach_type ? `📎 ${ch.last_msg_attach_type}` : 'No messages yet')
              return (
                <button key={ch.id} onClick={() => { setActiveChannel(ch); setMobileShowChat(true) }}
                  className={cn('w-full flex items-center gap-3 px-3 py-3 transition-all text-left',
                    isActive ? 'bg-brand-500/15' : 'hover:bg-surface-3/60')}>
                  <div className="relative flex-shrink-0">
                    <Avatar name={name} size={40} type={ch.type} />
                    {ch.type === 'public' && <TypeDot color="#6366f1"><Globe size={8} className="text-white" /></TypeDot>}
                    {ch.type === 'team'   && <TypeDot color="#10b981"><Users size={8} className="text-white" /></TypeDot>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={cn('text-sm font-medium truncate', isActive ? 'text-brand-300' : 'text-text-primary')}>
                        {name ?? '—'}
                      </span>
                      <span className="text-[10px] text-text-muted ml-1 flex-shrink-0">{timeAgo(ch.last_msg_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs text-text-muted truncate">{preview}</span>
                      {ch.unread_count > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
                          style={{ background: '#6366f1' }}>
                          {ch.unread_count > 99 ? '99+' : ch.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── CHAT PANEL ───────────────────────────────── */}
      <div className={cn('flex flex-col flex-1 min-w-0', !mobileShowChat && 'hidden md:flex')}>
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <MessageCircle size={48} className="mb-4 opacity-30" />
            <p className="text-sm">Select a chat to start messaging</p>
          </div>
        ) : <>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
            <button className="md:hidden text-text-muted" onClick={() => setMobileShowChat(false)}>
              <ChevronLeft size={20} />
            </button>
            <Avatar name={activeChannel.type === 'dm' ? activeChannel.dm_peer_name : activeChannel.name}
              size={36} type={activeChannel.type} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {activeChannel.type === 'dm' ? activeChannel.dm_peer_name : activeChannel.name}
              </p>
              <p className="text-[10px] text-text-muted">
                {activeChannel.type === 'public' ? `Everyone · ${activeChannel.member_count ?? ''} members`
                 : activeChannel.type === 'team' ? `Team · ${activeChannel.member_count ?? ''} members`
                 : activeChannel.dm_peer_dept ?? 'Direct message'}
              </p>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
            {loadingMsgs && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              </div>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-16">
                <MessageCircle size={40} className="mb-3 opacity-20" />
                <p className="text-sm">No messages yet — say hello!</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isMe     = uid(msg.sender_id) === myId
              const showName = !isMe && activeChannel.type !== 'dm'
                && (idx === 0 || uid(messages[idx - 1].sender_id) !== uid(msg.sender_id))
              return (
                <MessageBubble key={uid(msg.id)} msg={msg} isMe={isMe} showName={showName}
                  onReply={() => setReplyTo(msg)}
                  onDelete={() => deleteMessage(msg.id)}
                  onReact={mid => { setEmojiMsg(mid); setShowEmojiPicker(true) }}
                  emojiPickerOpen={uid(emojiMsg) === uid(msg.id) && showEmojiPicker}
                  onPickEmoji={emoji => toggleReaction(msg.id, emoji)}
                  onCloseEmoji={() => { setShowEmojiPicker(false); setEmojiMsg(null) }}
                  currentUserId={myId} />
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply preview */}
          {replyTo && (
            <div className="mx-4 mb-1 px-3 py-2 rounded-xl flex items-start gap-2"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Reply size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-brand-400">{replyTo.sender_name}</p>
                <p className="text-xs text-text-muted truncate">
                  {replyTo.body ?? (replyTo.attachment_type ? `📎 ${replyTo.attachment_type}` : '')}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-text-muted hover:text-danger-400"><X size={13} /></button>
            </div>
          )}

          {/* Attach preview */}
          {attach && (
            <div className="mx-4 mb-1 px-3 py-2 rounded-xl flex items-center gap-3"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              {attach.type === 'image' && attach.preview
                ? <img src={attach.preview} alt="" className="w-12 h-12 rounded-lg object-cover" />
                : <FileIcon type={attach.type} />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary truncate">{attach.name}</p>
                <p className="text-[10px] text-text-muted capitalize">{attach.type}</p>
              </div>
              <button onClick={() => setAttach(null)} className="text-text-muted hover:text-danger-400"><X size={14} /></button>
            </div>
          )}

          {/* @mention dropdown */}
          {mentionOpen && mentionList.length > 0 && (
            <div className="mx-4 mb-1 rounded-xl overflow-hidden shadow-2xl z-50"
              style={{ background: '#1a2236', border: '1px solid rgba(99,102,241,0.3)' }}>
              {mentionList.map((m, i) => (
                <button key={m.id} onMouseDown={e => { e.preventDefault(); pickMention(m) }}
                  className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-all',
                    i === mentionIdx ? 'bg-brand-500/20 text-brand-300' : 'text-text-primary hover:bg-surface-3')}>
                  {m.id === 'all'
                    ? <><span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>@</span>
                        <div><p className="font-semibold">@all</p><p className="text-[10px] text-text-muted">Notify everyone</p></div></>
                    : <><Avatar name={m.full_name} size={28} />
                        <div><p className="font-medium">{m.full_name}</p><p className="text-[10px] text-text-muted">{m.department}</p></div></>}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl text-text-muted hover:text-brand-400 hover:bg-surface-3 transition-all flex-shrink-0 mb-0.5">
                <Paperclip size={18} />
              </button>
              <input ref={fileInputRef} type="file" className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp3,.wav"
                onChange={pickFile} />

              {/* @ button shortcut */}
              <button type="button"
                onClick={() => { setText(t => t + '@'); textareaRef.current?.focus(); setMentionOpen(true); setMentionQ('') }}
                className="p-2 rounded-xl text-text-muted hover:text-brand-400 hover:bg-surface-3 transition-all flex-shrink-0 mb-0.5"
                title="Mention someone">
                <AtSign size={18} />
              </button>

              <div className="flex-1 relative">
                <textarea ref={textareaRef}
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (@ to mention)"
                  rows={1}
                  className="w-full resize-none px-4 py-2.5 rounded-2xl text-sm text-text-primary outline-none placeholder:text-text-muted"
                  style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    maxHeight: '120px',
                    lineHeight: '1.6',
                  }}
                />
              </div>

              <button onClick={sendMessage} disabled={!text.trim() && !attach}
                className="p-2.5 rounded-xl transition-all flex-shrink-0 disabled:opacity-30 mb-0.5"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Send size={17} className="text-white" />
              </button>
            </div>
          </div>
        </>}
      </div>

      {/* ── MODALS ──────────────────────────────────── */}
      {showNewGroup && (
        <NewGroupModal onClose={() => setShowNewGroup(false)}
          onCreate={async data => { await chatApi.channelCreate(data); await loadChannels(); setShowNewGroup(false) }} />
      )}
      {showStatusPost && <StatusPostModal onClose={() => setShowStatusPost(false)} onPost={postStatus} />}
      {activeStatus && (
        <StatusViewer status={activeStatus} allStatuses={statuses}
          onClose={() => setActiveStatus(null)}
          onView={async sid => {
            await chatApi.statusView(sid).catch(() => {})
            setStatuses(p => p.map(s => uid(s.id) === uid(sid) ? { ...s, viewed: true } : s))
          }}
          onDelete={async sid => {
            await chatApi.statusDelete(sid)
            setStatuses(p => p.filter(s => uid(s.id) !== uid(sid)))
            setActiveStatus(null)
          }}
          currentUserId={myId} />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   SMALL UI ATOMS
═══════════════════════════════════════════════════ */
function TabBtn({ active, onClick, children, dot }) {
  return (
    <button onClick={onClick} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all relative',
      active ? 'bg-brand-500/20 text-brand-300' : 'text-text-muted hover:text-text-secondary')}>
      {children}
      {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full" />}
    </button>
  )
}
function IconBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-all">
      {children}
    </button>
  )
}
function TypeDot({ color, children }) {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
      style={{ background: color }}>{children}</span>
  )
}
function SearchBar({ value, onChange, placeholder, onClear }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
      <Search size={13} className="text-text-muted flex-shrink-0" />
      <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
      <button onClick={onClear}><X size={13} className="text-text-muted" /></button>
    </div>
  )
}
function FileIcon({ type }) {
  const colors = { image: '#818cf8', video: '#a78bfa', audio: '#34d399', doc: '#60a5fa' }
  return (
    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: 'rgba(99,102,241,0.12)', color: colors[type] ?? '#818cf8' }}>
      <FileText size={22} />
    </div>
  )
}
function Avatar({ name, size = 36, type }) {
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors   = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899']
  const color    = colors[(name?.charCodeAt(0) ?? 0) % colors.length]
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none"
      style={{ width: size, height: size, background: `${color}25`, color, border: `1.5px solid ${color}35`, fontSize: size * 0.38 }}>
      {type === 'public' ? <Globe size={size * 0.45} /> : type === 'team' ? <Users size={size * 0.45} /> : initials}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   MESSAGE BUBBLE
═══════════════════════════════════════════════════ */
function MessageBubble({ msg, isMe, showName, onReply, onDelete, onReact,
  emojiPickerOpen, onPickEmoji, onCloseEmoji, currentUserId }) {

  if (msg.is_deleted) {
    return (
      <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
        <span className="text-xs text-text-muted italic px-3 py-1.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)' }}>🚫 This message was deleted</span>
      </div>
    )
  }

  const grouped = {}
  for (const r of (msg.reactions ?? [])) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], isMine: false }
    grouped[r.emoji].count++
    grouped[r.emoji].users.push(r.user_name)
    if (uid(r.user_id) === currentUserId) grouped[r.emoji].isMine = true
  }

  return (
    <div className={cn('flex flex-col group', isMe ? 'items-end' : 'items-start')}>
      {showName && (
        <span className="text-[10px] font-semibold text-brand-400 ml-10 mb-0.5">{msg.sender_name}</span>
      )}

      <div className={cn('flex items-end gap-1.5 max-w-[75%]', isMe && 'flex-row-reverse')}>
        {!isMe && <Avatar name={msg.sender_name} size={28} />}

        <div className="relative min-w-0">
          {/* Reply quote */}
          {msg.reply_to_id && (
            <div className={cn('px-2.5 py-1.5 mb-0.5 text-xs rounded-xl',
              isMe ? 'text-right' : 'text-left')}
              style={{ background: 'rgba(99,102,241,0.15)', borderLeft: '2px solid #6366f1' }}>
              <p className="text-[10px] font-semibold text-brand-400">{msg.reply_sender_name}</p>
              <p className="text-text-muted truncate">
                {msg.reply_body ?? (msg.reply_attach_type ? `📎 ${msg.reply_attach_type}` : '…')}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div className={cn('px-3 py-2 rounded-2xl text-sm break-words',
            isMe ? 'rounded-br-sm text-white' : 'rounded-bl-sm text-text-primary')}
            style={{
              background: isMe ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(36,51,82,0.9)',
              border:     isMe ? 'none' : '1px solid rgba(99,102,241,0.15)',
            }}>
            {msg.attachment_url && <Attachment msg={msg} />}
            {msg.body && <p className="whitespace-pre-wrap leading-relaxed">{renderBody(msg.body)}</p>}
            <p className={cn('text-[10px] mt-1 text-right', isMe ? 'text-indigo-200' : 'text-text-muted')}>
              {fmt(msg.created_at)}
              {isMe && <CheckCheck size={10} className="inline ml-1 opacity-70" />}
            </p>
          </div>

          {/* Reactions */}
          {Object.keys(grouped).length > 0 && (
            <div className={cn('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
              {Object.entries(grouped).map(([emoji, data]) => (
                <button key={emoji} onClick={() => onPickEmoji(emoji)} title={data.users.join(', ')}
                  className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all',
                    data.isMine
                      ? 'bg-brand-500/25 border border-brand-500/40 text-brand-300'
                      : 'bg-surface-3 border border-border-default text-text-muted hover:bg-surface-4')}>
                  {emoji}{data.count > 1 && <span>{data.count}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Emoji picker */}
          {emojiPickerOpen && (
            <div className={cn('absolute z-50 flex gap-1 p-2 rounded-2xl shadow-2xl',
              isMe ? 'right-0 bottom-full mb-1' : 'left-0 bottom-full mb-1')}
              style={{ background: '#1a2236', border: '1px solid rgba(99,102,241,0.3)' }}>
              {EMOJIS.map(em => (
                <button key={em} onMouseDown={e => { e.preventDefault(); onPickEmoji(em) }}
                  className="text-lg hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-3">
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover actions */}
        <div className={cn('flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity items-center mb-2',
          isMe ? 'flex-row-reverse' : '')}>
          <IconBtn onClick={() => onReact(msg.id)} title="React"><Smile size={13} /></IconBtn>
          <IconBtn onClick={onReply} title="Reply"><Reply size={13} /></IconBtn>
          {isMe && <IconBtn onClick={onDelete} title="Delete" danger><Trash2 size={13} /></IconBtn>}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   ATTACHMENT
═══════════════════════════════════════════════════ */
function Attachment({ msg }) {
  const [lightbox, setLightbox] = useState(false)
  if (msg.attachment_type === 'image') return (
    <>
      <div className="relative mb-1 rounded-xl overflow-hidden cursor-zoom-in max-w-[220px]"
        onClick={() => setLightbox(true)}>
        <img src={msg.attachment_url} alt={msg.attachment_name}
          className="w-full max-h-60 object-cover rounded-xl" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.3)' }}>
          <ZoomIn size={24} className="text-white" />
        </div>
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setLightbox(false)}>
          <img src={msg.attachment_url} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 text-white"><X size={24} /></button>
        </div>
      )}
    </>
  )
  if (msg.attachment_type === 'video') return (
    <video controls src={msg.attachment_url}
      className="max-w-[260px] max-h-60 rounded-xl mb-1 w-full" style={{ background: '#000' }} />
  )
  if (msg.attachment_type === 'audio') return (
    <audio controls src={msg.attachment_url} className="mb-1 max-w-[220px]" />
  )
  return (
    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" download
      className="flex items-center gap-2 mb-1 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <FileText size={20} className="text-brand-300 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{msg.attachment_name}</p>
        <p className="text-[10px] opacity-60">Tap to download</p>
      </div>
      <Download size={14} className="flex-shrink-0 opacity-60" />
    </a>
  )
}

/* ═══════════════════════════════════════════════════
   STATUS LIST
═══════════════════════════════════════════════════ */
function StatusList({ statuses, currentUser, onView, onPost, onDelete }) {
  const mine   = statuses.filter(s => uid(s.user_id) === uid(currentUser.id))
  const others = statuses.filter(s => uid(s.user_id) !== uid(currentUser.id))
  const byUser = {}
  for (const s of others) {
    if (!byUser[s.user_id]) byUser[s.user_id] = { user_name: s.user_name, items: [] }
    byUser[s.user_id].items.push(s)
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 py-2">
        <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-2">My Status</p>
        <button onClick={onPost}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-3 text-left">
          <div className="relative">
            <Avatar name={currentUser.full_name} size={44} />
            {mine.length === 0 && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2"
                style={{ background: '#6366f1', borderColor: '#1a2236' }}>
                <Plus size={11} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{mine.length > 0 ? 'My status' : 'Add status'}</p>
            <p className="text-[10px] text-text-muted">{mine.length > 0 ? `${mine.length} update${mine.length > 1 ? 's' : ''}` : 'Photo or video'}</p>
          </div>
        </button>
        {mine.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-2 py-1.5">
            <button onClick={() => onView(s)} className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0"
              style={{ border: '2px solid #6366f1' }}>
              {s.media_url ? <img src={s.media_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: s.bg_color ?? '#6366f1' }}>T</div>}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted">{timeAgo(s.created_at)}</p>
              {s.caption && <p className="text-xs text-text-primary truncate">{s.caption}</p>}
            </div>
            <button onClick={() => onDelete(s.id)} className="text-text-muted hover:text-danger-400"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      {Object.keys(byUser).length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-2">Recent Updates</p>
          {Object.values(byUser).map((g, i) => {
            const allViewed = g.items.every(s => s.viewed)
            return (
              <button key={i} onClick={() => onView(g.items[0])}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-3 text-left">
                <div className={cn('rounded-full p-0.5', allViewed ? 'bg-surface-3' : '')}
                  style={!allViewed ? { background: 'linear-gradient(135deg, #6366f1, #22d3ee)' } : {}}>
                  <Avatar name={g.user_name} size={40} />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{g.user_name}</p>
                  <p className="text-[10px] text-text-muted">{timeAgo(g.items[0].created_at)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   STATUS VIEWER
═══════════════════════════════════════════════════ */
function StatusViewer({ status, allStatuses, onClose, onView, onDelete, currentUserId }) {
  const [current, setCurrent] = useState(status)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const sameUser = allStatuses.filter(s => uid(s.user_id) === uid(current.user_id))
  const idx      = sameUser.findIndex(s => uid(s.id) === uid(current.id))

  useEffect(() => {
    onView(current.id)
    setProgress(0)
    const start = Date.now(), duration = current.media_type === 'video' ? 15000 : 5000
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / duration) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(timerRef.current)
        const next = sameUser[idx + 1]
        if (next) setCurrent(next); else onClose()
      }
    }, 50)
    return () => clearInterval(timerRef.current)
  }, [current.id])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}>
      <div className="relative w-full max-w-sm" style={{ height: '85vh' }}>
        <div className="flex gap-1 p-2 absolute top-0 left-0 right-0 z-10">
          {sameUser.map((s, i) => (
            <div key={s.id} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
              <div className="h-full rounded-full" style={{ background: '#fff', width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="absolute top-6 left-0 right-0 z-10 flex items-center gap-2 px-3">
          <Avatar name={current.user_name} size={32} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{current.user_name}</p>
            <p className="text-[10px] text-white/60">{timeAgo(current.created_at)}</p>
          </div>
          {uid(current.user_id) === currentUserId && (
            <button onClick={() => onDelete(current.id)} className="text-white/60 hover:text-white"><Trash2 size={16} /></button>
          )}
          <button onClick={onClose} className="text-white/60 hover:text-white ml-1"><X size={20} /></button>
        </div>
        <div className="flex-1 flex items-center justify-center h-full">
          {current.media_type === 'video'
            ? <video src={current.media_url} autoPlay muted loop className="max-w-full max-h-full rounded-xl" />
            : current.media_url
            ? <img src={current.media_url} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
            : <div className="w-full h-96 rounded-xl flex items-center justify-center text-2xl font-bold text-white"
                style={{ background: current.bg_color ?? '#6366f1' }}>{current.caption}</div>}
        </div>
        {current.caption && current.media_url && (
          <div className="absolute bottom-4 left-0 right-0 px-4">
            <p className="text-sm text-white text-center bg-black/50 rounded-xl px-3 py-2">{current.caption}</p>
          </div>
        )}
        <div className="absolute inset-0 flex" style={{ pointerEvents: 'none' }}>
          <div className="flex-1" style={{ pointerEvents: 'auto' }}
            onClick={() => { const p = sameUser[idx - 1]; if (p) setCurrent(p) }} />
          <div className="flex-1" style={{ pointerEvents: 'auto' }}
            onClick={() => { const n = sameUser[idx + 1]; if (n) setCurrent(n); else onClose() }} />
        </div>
        {uid(current.user_id) === currentUserId && current.view_count > 0 && (
          <div className="absolute bottom-4 left-4 flex items-center gap-1 text-white/60 text-xs">
            <Eye size={13} /><span>{current.view_count} view{current.view_count !== '1' ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   NEW GROUP MODAL
═══════════════════════════════════════════════════ */
function NewGroupModal({ onClose, onCreate }) {
  const [name, setName]    = useState('')
  const [type, setType]    = useState('team')
  const [desc, setDesc]    = useState('')
  const [query, setQuery]  = useState('')
  const [results, setResults] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await chatApi.searchUsers(query).catch(() => [])
      setResults(res.filter(u => !members.find(m => uid(m.id) === uid(u.id))))
    }, 300)
    return () => clearTimeout(t)
  }, [query, members])

  async function submit() {
    if (!name.trim()) return
    setLoading(true)
    await onCreate({ name, type, description: desc, member_ids: members.map(m => m.id) })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#1a2236', border: '1px solid rgba(99,102,241,0.25)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-text-primary">New Group</h3>
          <button onClick={onClose}><X size={18} className="text-text-muted" /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Group name *"
            className="w-full px-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }} />
          <div className="flex gap-2">
            {['team','public'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={cn('flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all',
                  type === t ? 'bg-brand-500/25 text-brand-300 border border-brand-500/30'
                             : 'bg-surface-3 text-text-muted border border-transparent')}>
                {t === 'public' ? '🌐 Public' : '👥 Team'}
              </button>
            ))}
          </div>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full px-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }} />
          {type === 'team' && <>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search members…"
              className="w-full px-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }} />
            {results.map(u => (
              <button key={u.id} onClick={() => { setMembers(m => [...m, u]); setQuery('') }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-3 text-left text-sm text-text-primary">
                <Avatar name={u.full_name} size={28} />{u.full_name}
                <span className="text-text-muted text-xs ml-auto">{u.department}</span>
              </button>
            ))}
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {members.map(m => (
                  <span key={m.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {m.full_name}
                    <button onClick={() => setMembers(p => p.filter(x => uid(x.id) !== uid(m.id)))}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </>}
        </div>
        <button onClick={submit} disabled={!name.trim() || loading}
          className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          {loading ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   STATUS POST MODAL
═══════════════════════════════════════════════════ */
function StatusPostModal({ onClose, onPost }) {
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  function pickFile(e) {
    const f = e.target.files[0]; if (!f) return
    setFile(f)
    const ext = f.name.split('.').pop().toLowerCase()
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) setPreview(URL.createObjectURL(f))
    else setPreview(null)
  }

  async function submit() {
    if (!file) return
    setLoading(true)
    await onPost({ file, caption })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#1a2236', border: '1px solid rgba(99,102,241,0.25)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-text-primary">Add Status</h3>
          <button onClick={onClose}><X size={18} className="text-text-muted" /></button>
        </div>
        <div className="space-y-3">
          {preview
            ? <img src={preview} alt="" className="w-full h-52 object-cover rounded-xl" />
            : file
            ? <div className="h-24 rounded-xl flex items-center justify-center gap-2"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px dashed rgba(99,102,241,0.3)' }}>
                <FileText size={24} className="text-brand-400" />
                <span className="text-sm text-text-muted">{file.name}</span>
              </div>
            : <button onClick={() => inputRef.current?.click()}
                className="w-full h-36 rounded-xl flex flex-col items-center justify-center gap-2"
                style={{ background: 'rgba(99,102,241,0.06)', border: '2px dashed rgba(99,102,241,0.3)' }}>
                <Camera size={28} className="text-brand-400" />
                <span className="text-sm text-text-muted">Choose photo or video</span>
              </button>}
          <input ref={inputRef} type="file" className="hidden"
            accept="image/*,video/mp4,video/webm" onChange={pickFile} />
          {file && <button onClick={() => inputRef.current?.click()} className="text-xs text-brand-400 hover:underline">Change media</button>}
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption… (optional)"
            className="w-full px-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }} />
        </div>
        <button onClick={submit} disabled={!file || loading}
          className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          {loading ? 'Posting…' : 'Post Status'}
        </button>
      </div>
    </div>
  )
}
