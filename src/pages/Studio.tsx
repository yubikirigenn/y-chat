import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface Room { 
  id: string; 
  name: string; 
  is_group: boolean; 
  created_at: string;
  message_count?: number;
}
interface Profile { 
  id: string; 
  username: string; 
  nickname: string | null;
  is_banned?: boolean;
}
interface Message { 
  id: number; 
  content: string | null; 
  image_url: string | null;
  is_deleted: boolean;
  is_locked: boolean;
  created_at: string; 
  user_id: string;
  room_id: string;
  profiles?: Profile;
}

interface StudioProps { session: any; }

export default function Studio({ session: _session }: StudioProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMessage, setEditingMessage] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [changingUserId, setChangingUserId] = useState<number | null>(null)
  const [hideEmptyRooms, setHideEmptyRooms] = useState(false)
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [editingNickname, setEditingNickname] = useState<string | null>(null)
  const [newNickname, setNewNickname] = useState('')
  const navigate = useNavigate()

  // 全ユーザー取得（BAN状態付き）
  const fetchProfiles = async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, nickname')
        .order('username', { ascending: true })
      
      if (profilesError) {
        console.error('Profiles fetch error:', profilesError)
        return
      }

      const { data: bansData, error: bansError } = await supabase
        .from('user_bans')
        .select('*')
        .eq('is_active', true)

      if (bansError) {
        console.error('Bans fetch error:', bansError)
      }

      console.log('📊 全BAN一覧:', bansData)

      const now = new Date()
      const profilesWithBanStatus = (profilesData || []).map(profile => {
        const userBans = (bansData || []).filter(ban => ban.user_id === profile.id)
        const hasActiveBan = userBans.some(ban => {
          const isActive = ban.is_active === true
          const notExpired = ban.expires_at === null || new Date(ban.expires_at) > now
          return isActive && notExpired
        })
        
        console.log(`🔍 ${profile.username}:`, {
          userBans: userBans.length,
          hasActiveBan,
          is_banned: hasActiveBan
        })
        
        return {
          id: profile.id,
          username: profile.username,
          nickname: profile.nickname,
          is_banned: hasActiveBan
        }
      })

      console.log('✅ 最終プロフィール一覧（全データ）:', profilesWithBanStatus)

      setProfiles(profilesWithBanStatus)
    } catch (error) {
      console.error('fetchProfiles error:', error)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [showUserManagement])

  useEffect(() => {
    const fetchRooms = async () => {
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('id, name, is_group, created_at')
        .order('created_at', { ascending: false })
      
      if (roomsError) {
        console.error('Rooms fetch error:', roomsError)
        setLoading(false)
        return
      }

      if (!roomsData) {
        setRooms([])
        setLoading(false)
        return
      }

      const roomsWithCount = await Promise.all(
        roomsData.map(async (room) => {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id)
          
          return { ...room, message_count: count || 0 }
        })
      )

      setRooms(roomsWithCount)
      setLoading(false)
    }
    fetchRooms()
  }, [])

  useEffect(() => {
    if (!selectedRoomId) return

    const fetchMessages = async () => {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', selectedRoomId)
        .order('created_at', { ascending: true })
      
      if (messagesError) {
        console.error('Messages fetch error:', messagesError)
        return
      }

      if (!messagesData || messagesData.length === 0) {
        setMessages([])
        return
      }

      const userIds = [...new Set(messagesData.map(msg => msg.user_id))]
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, nickname')
        .in('id', userIds)

      const messagesWithProfiles = messagesData.map(msg => {
        const profile = profilesData?.find(p => p.id === msg.user_id)
        return { ...msg, profiles: profile }
      })

      setMessages(messagesWithProfiles as any)
    }
    fetchMessages()
  }, [selectedRoomId])

  const handleEmergencyStop = async () => {
    if (!window.confirm('🚨 緊急停止しますか？\n\n全ユーザーのStudioアクセスがブロックされます。\n解除するにはSupabaseで手動操作が必要です。')) {
      return
    }

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ studio_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', 1)

      if (error) {
        alert('緊急停止に失敗しました: ' + error.message)
      } else {
        alert('🚨 緊急停止しました。\nページをリロードします。')
        window.location.reload()
      }
    } catch (error) {
      console.error('Emergency stop error:', error)
      alert('緊急停止中にエラーが発生しました')
    }
  }

  const handleEditNickname = (userId: string, currentNickname: string | null) => {
    setEditingNickname(userId)
    setNewNickname(currentNickname || '')
  }

  const handleSaveNickname = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: newNickname })
        .eq('id', userId)

      if (error) {
        alert('ニックネーム変更に失敗しました: ' + error.message)
      } else {
        setProfiles(prev => prev.map(p => 
          p.id === userId ? { ...p, nickname: newNickname } : p
        ))
        setEditingNickname(null)
      }
    } catch (error) {
      console.error('Nickname update error:', error)
      alert('ニックネーム変更中にエラーが発生しました')
    }
  }

  const handleBanUser = async (userId: string) => {
    const profile = profiles.find(p => p.id === userId)
    if (!profile) return

    const duration = window.prompt(
      `${profile.nickname || profile.username} をBANしますか？\n\n期間を選択してください:\n` +
      '1: 60秒\n2: 5分\n3: 1時間\n4: 1日\n5: 1年\n6: 永久BAN\n\n数字を入力:',
      '1'
    )

    if (!duration) return

    let expiresAt: string | null = null
    const now = new Date()

    switch(duration) {
      case '1': expiresAt = new Date(now.getTime() + 60 * 1000).toISOString(); break
      case '2': expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); break
      case '3': expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); break
      case '4': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); break
      case '5': expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(); break
      case '6': expiresAt = null; break
      default: alert('無効な選択です'); return
    }

    const reason = window.prompt('BAN理由（任意）:')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('ユーザー情報の取得に失敗しました')
        return
      }

      console.log('🔍 BAN実行:', { user_id: userId, banned_by: user.id, expires_at: expiresAt })

      const { data, error } = await supabase
        .from('user_bans')
        .insert({
          user_id: userId,
          banned_by: user.id,
          reason: reason || null,
          expires_at: expiresAt
        })
        .select()

      console.log('📊 BAN結果:', { data, error })

      if (error) {
        console.error('Ban error detail:', error)
        alert('BAN処理に失敗しました: ' + error.message)
      } else {
        console.log('✅ BAN成功、ユーザーリスト再取得')
        alert('✅ BAN処理が完了しました')
        await fetchProfiles()
      }
    } catch (error) {
      console.error('Ban error:', error)
      alert('BAN処理中にエラーが発生しました')
    }
  }

  const handleUnbanUser = async (userId: string) => {
    const profile = profiles.find(p => p.id === userId)
    if (!profile || !window.confirm(`${profile.nickname || profile.username} のBANを解除しますか？`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('user_bans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true)

      if (error) {
        alert('BAN解除に失敗しました: ' + error.message)
      } else {
        alert('✅ BAN解除が完了しました')
        await fetchProfiles()
      }
    } catch (error) {
      console.error('Unban error:', error)
      alert('BAN解除中にエラーが発生しました')
    }
  }

  const handleEditMessage = (messageId: number, currentContent: string) => {
    setEditingMessage(messageId)
    setEditContent(currentContent)
  }

  const handleSaveEdit = async (messageId: number) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: editContent })
        .eq('id', messageId)

      if (error) {
        alert('編集に失敗しました: ' + error.message)
      } else {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, content: editContent } : msg
        ))
        setEditingMessage(null)
      }
    } catch (error) {
      console.error('Edit error:', error)
      alert('編集中にエラーが発生しました')
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    const message = messages.find(m => m.id === messageId)
    
    if (message?.is_locked) {
      alert('🔒 このメッセージはロックされているため削除できません。\n先にロックを解除してください。')
      return
    }

    if (!window.confirm('このメッセージを削除しますか？')) return

    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, content: null, image_url: null })
        .eq('id', messageId)

      if (error) {
        alert('削除に失敗しました: ' + error.message)
      } else {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, is_deleted: true, content: null, image_url: null } : msg
        ))
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('削除中にエラーが発生しました')
    }
  }

  const handleToggleLock = async (messageId: number, currentLockState: boolean) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_locked: !currentLockState })
        .eq('id', messageId)

      if (error) {
        alert('ロック切替に失敗しました: ' + error.message)
      } else {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, is_locked: !currentLockState } : msg
        ))
      }
    } catch (error) {
      console.error('Lock toggle error:', error)
      alert('ロック切替中にエラーが発生しました')
    }
  }

  const handleShowUserChange = (messageId: number) => {
    setChangingUserId(messageId)
  }

  const handleChangeUser = async (messageId: number, newUserId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (message?.user_id === newUserId) {
      setChangingUserId(null)
      return
    }

    if (!window.confirm('発信者を変更しますか？')) {
      setChangingUserId(null)
      return
    }

    try {
      const { error } = await supabase
        .from('messages')
        .update({ user_id: newUserId })
        .eq('id', messageId)

      if (error) {
        alert('発信者変更に失敗しました: ' + error.message)
      } else {
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', selectedRoomId)
          .order('created_at', { ascending: true })
        
        if (messagesData) {
          const userIds = [...new Set(messagesData.map(msg => msg.user_id))]
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username, nickname')
            .in('id', userIds)

          const messagesWithProfiles = messagesData.map(msg => {
            const profile = profilesData?.find(p => p.id === msg.user_id)
            return { ...msg, profiles: profile }
          })

          setMessages(messagesWithProfiles as any)
        }
        setChangingUserId(null)
      }
    } catch (error) {
      console.error('User change error:', error)
      alert('発信者変更中にエラーが発生しました')
    }
  }

  const filteredRooms = hideEmptyRooms 
    ? rooms.filter(room => (room.message_count ?? 0) > 0)
    : rooms

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-lg">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <aside className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <header className="p-4 bg-gray-950 border-b border-gray-700">
          <h1 className="text-xl font-bold mb-2">🎛️ Y-Chat Studio</h1>
          <div className="flex gap-2 mb-2">
            <button onClick={() => navigate('/')} className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-700">ホーム</button>
            <button onClick={handleEmergencyStop} className="flex-1 px-3 py-2 bg-red-600 rounded text-sm hover:bg-red-700 font-bold">🚨 緊急停止</button>
          </div>
          <button onClick={() => setShowUserManagement(!showUserManagement)} className="w-full px-3 py-2 bg-purple-600 rounded text-sm hover:bg-purple-700">
            {showUserManagement ? '📋 ルーム一覧' : '👥 ユーザー管理'}
          </button>
        </header>

        {showUserManagement ? (
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">ユーザー一覧 ({profiles.length})</h2>
            <ul className="space-y-2">
              {profiles.map(profile => {
                console.log(`🎨 Rendering ${profile.username}:`, profile.is_banned)
                return (
                  <li key={profile.id} className={`p-3 rounded border ${profile.is_banned ? 'bg-red-900 border-red-700' : 'bg-gray-700 border-gray-600'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          {profile.nickname || profile.username}
                          {profile.is_banned && <span className="text-red-400">🚫</span>}
                        </div>
                        <div className="text-xs text-gray-400">@{profile.username}</div>
                      </div>
                    </div>

                    {editingNickname === profile.id ? (
                      <div className="flex gap-2 mt-2">
                        <input type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} className="flex-1 px-2 py-1 bg-gray-600 rounded text-sm" placeholder="新しいニックネーム" />
                        <button onClick={() => handleSaveNickname(profile.id)} className="px-2 py-1 bg-green-600 rounded text-xs hover:bg-green-700">保存</button>
                        <button onClick={() => setEditingNickname(null)} className="px-2 py-1 bg-gray-600 rounded text-xs hover:bg-gray-700">×</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleEditNickname(profile.id, profile.nickname)} className="flex-1 px-2 py-1 bg-blue-600 rounded text-xs hover:bg-blue-700">✏️ ニックネーム</button>
                        {profile.is_banned ? (
                          <button onClick={() => handleUnbanUser(profile.id)} className="flex-1 px-2 py-1 bg-green-600 rounded text-xs hover:bg-green-700">✅ BAN解除</button>
                        ) : (
                          <button onClick={() => handleBanUser(profile.id)} className="flex-1 px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700">🚫 BAN</button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <>
            <div className="p-4 bg-gray-800 border-b border-gray-700">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={hideEmptyRooms} onChange={(e) => setHideEmptyRooms(e.target.checked)} className="w-4 h-4" />
                <span>0件ルームを非表示</span>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold text-gray-400 mb-3">トークルーム一覧 ({filteredRooms.length}/{rooms.length})</h2>
              <ul className="space-y-2">
                {filteredRooms.map(room => (
                  <li key={room.id} onClick={() => setSelectedRoomId(room.id)} className={`p-3 rounded cursor-pointer transition ${selectedRoomId === room.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <div className="font-semibold">{room.name || '名称未設定'}</div>
                    <div className="text-xs text-gray-400 mt-1 flex items-center justify-between">
                      <span>{room.is_group ? '📢 グループ' : '💬 個人'}</span>
                      <span className="font-semibold">{room.message_count}件</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>

      <main className="flex-1 flex flex-col">
        {!showUserManagement && selectedRoomId ? (
          <>
            <header className="p-4 bg-gray-800 border-b border-gray-700">
              <h2 className="text-lg font-bold">{rooms.find(r => r.id === selectedRoomId)?.name || '選択中のルーム'}</h2>
              <p className="text-sm text-gray-400 mt-1">メッセージ数: {messages.length}件</p>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`p-4 rounded-lg border ${msg.is_deleted ? 'bg-gray-800 border-gray-700' : msg.is_locked ? 'bg-yellow-900 border-yellow-700' : 'bg-gray-800 border-gray-600'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{msg.profiles?.nickname || msg.profiles?.username || '不明'}</span>
                      <span className="text-xs text-gray-400">({msg.user_id.substring(0, 8)}...)</span>
                      {msg.is_locked && <span className="text-yellow-400">🔒</span>}
                      {msg.is_deleted && <span className="text-red-400">🗑️</span>}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString('ja-JP')}</span>
                  </div>
                  <div className="mb-3">
                    {msg.is_deleted ? (
                      <p className="text-gray-500 italic">メッセージの送信を取り消しました</p>
                    ) : editingMessage === msg.id ? (
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-2 bg-gray-700 rounded text-white" rows={3} />
                    ) : msg.image_url ? (
                      <img src={msg.image_url} alt="送信画像" className="max-w-md rounded" />
                    ) : (
                      <p className="text-gray-200">{msg.content}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!msg.is_deleted && (
                      <>
                        {editingMessage === msg.id ? (
                          <>
                            <button onClick={() => handleSaveEdit(msg.id)} className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700">保存</button>
                            <button onClick={() => setEditingMessage(null)} className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-700">キャンセル</button>
                          </>
                        ) : changingUserId === msg.id ? (
                          <>
                            <select onChange={(e) => handleChangeUser(msg.id, e.target.value)} className="px-3 py-1 bg-purple-600 rounded text-sm text-white" defaultValue="">
                              <option value="" disabled>発信者を選択...</option>
                              {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>{profile.nickname || profile.username}</option>
                              ))}
                            </select>
                            <button onClick={() => setChangingUserId(null)} className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-700">キャンセル</button>
                          </>
                        ) : (
                          <>
                            {msg.content && <button onClick={() => handleEditMessage(msg.id, msg.content!)} className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700">✏️ 編集</button>}
                            <button onClick={() => handleToggleLock(msg.id, msg.is_locked)} className={`px-3 py-1 rounded text-sm ${msg.is_locked ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}`}>{msg.is_locked ? '🔓 解除' : '🔒 ロック'}</button>
                            <button onClick={() => handleShowUserChange(msg.id)} className="px-3 py-1 bg-purple-600 rounded text-sm hover:bg-purple-700">👤 発信者変更</button>
                            <button onClick={() => handleDeleteMessage(msg.id)} disabled={msg.is_locked} className={`px-3 py-1 rounded text-sm ${msg.is_locked ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>🗑️ 削除</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-20">このルームにはメッセージがありません</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">{showUserManagement ? '👥' : '💬'}</div>
              <p className="text-lg">{showUserManagement ? 'ユーザー管理画面' : '左からトークルームを選択してください'}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}