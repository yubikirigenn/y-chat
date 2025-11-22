import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useParams, useNavigate } from 'react-router-dom'

// --- 型定義 ---
interface Profile { 
  id: string; 
  username: string; 
  nickname: string | null; 
  avatar_public_id: string | null; 
}

interface Message { 
  id: number; 
  content: string | null; 
  image_url: string | null; 
  is_deleted: boolean; 
  created_at: string; 
  user_id: string; 
  profiles: Profile | null; 
  read_statuses: { user_id: string }[] 
}

interface ChatProps { 
  session: any; 
}

export default function Chat({ session }: ChatProps) {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [room, setRoom] = useState<{ name: string, is_group: boolean } | null>(null)
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const user = session.user

  const scrollToBottom = () => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) 
  }
  
  useEffect(() => { 
    scrollToBottom()
  }, [messages]);

  useEffect(() => {
    if (!roomId) return;
    
    const fetchAllData = async () => {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('name, is_group')
        .eq('id', roomId)
        .single();
      if (roomData) setRoom(roomData);
      
      // 1. まずメッセージだけを取得
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select(`*, read_statuses(user_id)`)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (messagesError) { 
        console.error("メッセージ取得エラー:", messagesError); 
        setMessages([]);
        return; 
      }
      if (!messagesData) { 
        setMessages([]);
        return; 
      }

      // 2. メッセージからユーザーIDのリストを作成
      const userIds = [...new Set(messagesData.map((msg) => msg.user_id))];
      if (userIds.length === 0) { 
        setMessages(messagesData as any);
        return; 
      }

      // 3. ユーザーIDのリストを元に、プロフィールを一括で取得
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`*`)
        .in('id', userIds);
      
      if (profilesError) { 
        console.error("プロフィール取得エラー:", profilesError); 
      }

      // 4. プログラム側で、メッセージとプロフィールを結合する
      const messagesWithProfiles = messagesData.map((msg) => {
        const profile = profilesData?.find((p) => p.id === msg.user_id) || null;
        return { ...msg, profiles: profile };
      });

      setMessages(messagesWithProfiles as any);

      // 5. 既読処理
      const { data: unreadMessages } = await supabase.rpc('get_unread_messages', { p_room_id: roomId });
      if (unreadMessages && unreadMessages.length > 0) {
        const statuses = unreadMessages.map((msg: any) => ({ message_id: msg.id, user_id: user.id }));
        await supabase.from('read_statuses').insert(statuses);
      }
      
      // 6. 初回読み込み後、少し遅延させて確実にスクロール
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    };
    
    fetchAllData();

    const channel = supabase.channel(`room_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { 
        fetchAllData(); 
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel) 
    };
  }, [roomId, user.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !roomId) return;
    
    await supabase.from('messages').insert({ 
      content: newMessage, 
      user_id: user.id, 
      room_id: roomId 
    });
    setNewMessage('');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !roomId) return;
    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
    try {
      setUploading(true);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, 
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      if (data.secure_url) {
        await supabase.from('messages').insert({ 
          image_url: data.secure_url, 
          user_id: user.id, 
          room_id: roomId 
        });
      }
    } catch (error) { 
      alert('画像のアップロードに失敗しました。'); 
    } finally { 
      setUploading(false); 
    }
  };
  
  const handleInviteUser = async () => {
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, username, nickname, avatar_public_id')
      .neq('id', user.id);
      
    const { data: currentParticipants } = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_id', roomId);
      
    if (!allProfiles || !currentParticipants) return;
    
    const currentParticipantIds = currentParticipants.map(p => p.user_id);
    const available = allProfiles.filter(p => !currentParticipantIds.includes(p.id));
    
    if(available.length === 0) { 
      alert("招待できるユーザーがいません。"); 
      return; 
    }
    
    setAvailableProfiles(available);
    setIsAddingMember(true);
  };

  const handleConfirmInvite = async () => {
    if (selectedUserIds.length === 0 || !roomId) return;
    const newParticipants = selectedUserIds.map(userId => ({ 
      room_id: roomId, 
      user_id: userId 
    }));
    await supabase.from('room_participants').insert(newParticipants);
    alert("メンバーを招待しました。");
    setIsAddingMember(false);
    setSelectedUserIds([]);
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (window.confirm("メッセージの送信を取り消しますか?")) {
      try {
        const { error } = await supabase
          .from('messages')
          .update({ 
            is_deleted: true, 
            content: null, 
            image_url: null 
          })
          .eq('id', messageId);
        
        if (error) {
          console.error('削除エラー:', error);
          alert('メッセージの削除に失敗しました: ' + error.message);
        }
      } catch (err) {
        console.error('削除処理エラー:', err);
        alert('メッセージの削除中にエラーが発生しました');
      }
    }
  };

  const handleLeaveRoom = async () => {
    if (window.confirm("本当にこのトークルームから退出しますか?")) {
      try {
        const { error } = await supabase
          .from('room_participants')
          .delete()
          .match({ room_id: roomId, user_id: user.id });
          
        if (error) throw error;
        
        alert("トークルームから退出しました。");
        navigate('/');
      } catch (error: any) {
        console.error("退出エラー:", error);
        alert(`退出中にエラーが発生しました: ${error.message}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen font-sans bg-[#798696] relative">
      {/* スマホ用固定戻るボタン */}
      <button 
        onClick={() => navigate('/')} 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-full shadow-lg text-gray-700 hover:text-gray-900"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <header className="hidden md:flex items-center justify-between w-full h-12 px-4 bg-[#f6f7f9] border-b border-gray-300 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800">{room?.name || '...'}</h1>
        <div className="flex items-center gap-2">
          {room?.is_group && !isAddingMember && (
            <button 
              onClick={handleInviteUser} 
              className="text-xs px-3 py-1 bg-blue-500 text-white rounded"
            >
              メンバー追加
            </button>
          )}
          <button 
            onClick={handleLeaveRoom} 
            className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded border border-gray-400"
          >
            退出
          </button>
        </div>
      </header>
      
      {isAddingMember ? (
        <div className="flex flex-col p-4 flex-1 bg-gray-800">
          <h3 className="mb-2 text-white">招待するメンバーを選択</h3>
          <ul className="flex-1 overflow-y-auto">
            {availableProfiles.map(profile => (
              <li 
                key={profile.id} 
                className="flex items-center gap-3 p-2 text-white hover:bg-gray-700 rounded"
              >
                <input 
                  type="checkbox" 
                  id={`invite-${profile.id}`} 
                  checked={selectedUserIds.includes(profile.id)} 
                  onChange={() => setSelectedUserIds(prev => 
                    prev.includes(profile.id) 
                      ? prev.filter(id => id !== profile.id) 
                      : [...prev, profile.id]
                  )} 
                  className="w-4 h-4" 
                />
                <label htmlFor={`invite-${profile.id}`}>
                  {profile.nickname || profile.username}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-4">
            <button 
              onClick={handleConfirmInvite} 
              className="flex-1 px-3 py-2 bg-green-600 rounded text-white"
            >
              招待
            </button>
            <button 
              onClick={() => setIsAddingMember(false)} 
              className="flex-1 px-3 py-2 bg-gray-600 rounded text-white"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          <main className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-6">
              {messages.map((msg) => {
                const isMyMessage = msg.user_id === user.id;
                const readCount = msg.read_statuses.filter(s => s.user_id !== user.id).length;
                
                return (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3 group ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isMyMessage && (
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0 self-start">
                        {msg.profiles?.avatar_public_id && (
                          <img 
                            src={`https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/w_40,h_40,c_fill,r_max/${msg.profiles.avatar_public_id}`} 
                            alt="avatar" 
                            className="w-full h-full rounded-full object-cover" 
                          />
                        )}
                      </div>
                    )}
                    
                    <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                      {!isMyMessage && (
                        <p className="text-xs text-gray-800 mb-1 ml-1">
                          {msg.profiles?.nickname || msg.profiles?.username}
                        </p>
                      )}
                      
                      <div className="flex items-end gap-2">
                        {isMyMessage && (
                          <div className="text-xs text-white flex-shrink-0 pb-1 flex flex-col items-end gap-1">
                            {!msg.is_deleted && (
                              <button 
                                onClick={() => handleDeleteMessage(msg.id)} 
                                className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-700 transition opacity-0 group-hover:opacity-100"
                              >
                                削除
                              </button>
                            )}
                            {readCount > 0 && (
                              <span>既読 {room?.is_group ? readCount : ''}</span>
                            )}
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString('ja-JP', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        )}
                        
                        {msg.is_deleted ? (
                          <div className="px-3 py-2 text-sm text-gray-400 border border-gray-500 rounded-lg bg-gray-800">
                            メッセージの送信を取り消しました
                          </div>
                        ) : (
                          <div className={`max-w-xs md:max-w-md rounded-lg shadow ${
                            isMyMessage ? 'bg-[#8de055] rounded-br-none' : 'bg-white rounded-tl-none'
                          }`}>
                            {msg.image_url ? (
                              <img 
                                src={msg.image_url} 
                                alt="送信された画像" 
                                className="rounded-lg max-w-full h-auto" 
                              />
                            ) : (
                              <p 
                                className="px-3 py-2 text-gray-800" 
                                style={{ wordBreak: 'break-word' }}
                              >
                                {msg.content}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {!isMyMessage && (
                          <span className="text-xs text-white flex-shrink-0 pb-1">
                            {new Date(msg.created_at).toLocaleTimeString('ja-JP', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </main>
          
          <footer className="flex items-center p-2 bg-[#f6f7f9] border-t border-gray-300 flex-shrink-0">
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="p-2 text-gray-500 hover:text-gray-700" 
              disabled={uploading}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                />
              </svg>
            </button>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
              disabled={uploading}
            />
            
            <form onSubmit={handleSendMessage} className="flex-1 flex items-center">
              <input 
                type="text" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                className="w-full px-4 py-2 text-gray-800 bg-white border border-gray-300 rounded-full focus:outline-none" 
                disabled={uploading}
              />
            </form>
            
            <button 
              onClick={handleSendMessage} 
              className="p-2 text-gray-500" 
              disabled={uploading}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" 
                />
              </svg>
            </button>
          </footer>
        </>
      )}
    </div>
  )
}