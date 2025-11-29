import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface Room { id: string; name: string; is_group: boolean; created_at: string; }
interface Profile { id: string; username: string; nickname: string | null; }
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
  const navigate = useNavigate()

  // 全トークルーム取得
  useEffect(() => {
    const fetchRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, is_group, created_at')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Rooms fetch error:', error)
      } else if (data) {
        setRooms(data)
      }
      setLoading(false)
    }
    fetchRooms()
  }, [])

  // 全ユーザー取得
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, nickname')
      
      if (error) {
        console.error('Profiles fetch error:', error)
      } else if (data) {
        setProfiles(data)
      }
    }
    fetchProfiles()
  }, [])

  // 選択されたルームのメッセージ取得
  useEffect(() => {
    if (!selectedRoomId) return

    const fetchMessages = async () => {
      // 1. メッセージを取得
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

      // 2. ユーザーIDを抽出
      const userIds = [...new Set(messagesData.map(msg => msg.user_id))]

      // 3. プロフィールを一括取得
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, nickname')
        .in('id', userIds)

      if (profilesError) {
        console.error('Profiles fetch error:', profilesError)
      }

      // 4. メッセージとプロフィールを結合
      const messagesWithProfiles = messagesData.map(msg => {
        const profile = profilesData?.find(p => p.id === msg.user_id)
        return { ...msg, profiles: profile }
      })

      setMessages(messagesWithProfiles as any)
    }
    fetchMessages()
  }, [selectedRoomId])

  // 🚨 緊急停止ボタン
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

  // メッセージ編集
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

  // メッセージ削除
  const handleDeleteMessage = async (messageId: number) => {
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

  // メッセージロック/解除
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

  // 発信者変更
  const handleChangeUser = async (messageId: number, currentUserId: string) => {
    const newUserId = window.prompt(
      '新しい発信者のユーザーIDを入力してください\n\n利用可能なユーザー:\n' + 
      profiles.map(p => `${p.username} (${p.id})`).join('\n'),
      currentUserId
    )

    if (!newUserId || newUserId === currentUserId) return

    // ユーザーIDの存在確認
    const userExists = profiles.some(p => p.id === newUserId)
    if (!userExists) {
      alert('指定されたユーザーIDが見つかりません')
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
        // メッセージを再取得
        const { data } = await supabase
          .from('messages')
          .select('*, profiles(id, username, nickname)')
          .eq('room_id', selectedRoomId)
          .order('created_at', { ascending: true })
        
        if (data) setMessages(data as any)
      }
    } catch (error) {
      console.error('User change error:', error)
      alert('発信者変更中にエラーが発生しました')
    }
  }

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
      {/* 左サイドバー: ルーム一覧 */}
      <aside className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <header className="p-4 bg-gray-950 border-b border-gray-700">
          <h1 className="text-xl font-bold mb-2">🎛️ Y-Chat Studio</h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex-1 px-3 py-2 bg-blue-600 rounded text-sm hover:bg-blue-700"
            >
              ホーム
            </button>
            <button
              onClick={handleEmergencyStop}
              className="flex-1 px-3 py-2 bg-red-600 rounded text-sm hover:bg-red-700 font-bold"
            >
              🚨 緊急停止
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">
            トークルーム一覧 ({rooms.length})
          </h2>
          <ul className="space-y-2">
            {rooms.map(room => (
              <li
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`p-3 rounded cursor-pointer transition ${
                  selectedRoomId === room.id
                    ? 'bg-blue-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="font-semibold">{room.name || '名称未設定'}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {room.is_group ? '📢 グループ' : '💬 個人'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* メインコンテンツ: メッセージ一覧 */}
      <main className="flex-1 flex flex-col">
        {selectedRoomId ? (
          <>
            <header className="p-4 bg-gray-800 border-b border-gray-700">
              <h2 className="text-lg font-bold">
                {rooms.find(r => r.id === selectedRoomId)?.name || '選択中のルーム'}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                メッセージ数: {messages.length}件
              </p>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-lg border ${
                    msg.is_deleted
                      ? 'bg-gray-800 border-gray-700'
                      : msg.is_locked
                      ? 'bg-yellow-900 border-yellow-700'
                      : 'bg-gray-800 border-gray-600'
                  }`}
                >
                  {/* メッセージヘッダー */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {msg.profiles?.nickname || msg.profiles?.username || '不明'}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({msg.user_id.substring(0, 8)}...)
                      </span>
                      {msg.is_locked && <span className="text-yellow-400">🔒</span>}
                      {msg.is_deleted && <span className="text-red-400">🗑️</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>

                  {/* メッセージ内容 */}
                  <div className="mb-3">
                    {msg.is_deleted ? (
                      <p className="text-gray-500 italic">メッセージの送信を取り消しました</p>
                    ) : editingMessage === msg.id ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2 bg-gray-700 rounded text-white"
                        rows={3}
                      />
                    ) : msg.image_url ? (
                      <img src={msg.image_url} alt="送信画像" className="max-w-md rounded" />
                    ) : (
                      <p className="text-gray-200">{msg.content}</p>
                    )}
                  </div>

                  {/* 操作ボタン */}
                  <div className="flex gap-2 flex-wrap">
                    {!msg.is_deleted && (
                      <>
                        {editingMessage === msg.id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(msg.id)}
                              className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingMessage(null)}
                              className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-700"
                            >
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            {msg.content && (
                              <button
                                onClick={() => handleEditMessage(msg.id, msg.content!)}
                                className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
                              >
                                ✏️ 編集
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleLock(msg.id, msg.is_locked)}
                              className={`px-3 py-1 rounded text-sm ${
                                msg.is_locked
                                  ? 'bg-yellow-600 hover:bg-yellow-700'
                                  : 'bg-gray-600 hover:bg-gray-700'
                              }`}
                            >
                              {msg.is_locked ? '🔓 解除' : '🔒 ロック'}
                            </button>
                            <button
                              onClick={() => handleChangeUser(msg.id, msg.user_id)}
                              className="px-3 py-1 bg-purple-600 rounded text-sm hover:bg-purple-700"
                            >
                              👤 発信者変更
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
                            >
                              🗑️ 削除
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-20">
                  このルームにはメッセージがありません
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-lg">左からトークルームを選択してください</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}