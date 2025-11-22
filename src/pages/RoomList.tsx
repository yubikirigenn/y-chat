import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'

// 型定義
interface Room { id: string; name: string; is_group: boolean; }
interface Profile { id: string; username: string; nickname: string | null; avatar_public_id: string | null; }
interface UnreadCount { room_id: string; unread_count: number; }
interface RoomListProps { session: any; }

export default function RoomList({ session }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())
  const [personalRoomMap, setPersonalRoomMap] = useState<Map<string, string>>(new Map())
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const user = session.user

  // 初回読み込み用（ローディング表示あり）
  const fetchAllData = async () => {
    setLoading(true);
    
    const { data: participationData } = await supabase
      .from('room_participants')
      .select('room_id')
      .eq('user_id', user.id);
      
    if (participationData) {
      const roomIds = participationData.map(p => p.room_id);
      if (roomIds.length > 0) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('id, name, is_group')
          .in('id', roomIds);
        if (roomData) setRooms(roomData);
        
        // 個人チャット用のルームマッピングを作成
        const personalRooms = roomData?.filter(r => !r.is_group) || [];
        const newMap = new Map<string, string>();
        
        for (const room of personalRooms) {
          const { data: participants } = await supabase
            .from('room_participants')
            .select('user_id')
            .eq('room_id', room.id);
          
          if (participants) {
            const otherUserId = participants.find(p => p.user_id !== user.id)?.user_id;
            if (otherUserId) {
              newMap.set(otherUserId, room.id);
            }
          }
        }
        setPersonalRoomMap(newMap);
      } else {
        setRooms([]);
      }
    }
    
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, nickname, avatar_public_id')
      .neq('id', user.id);
    if (profilesData) setProfiles(profilesData);
    
    const { data: countsData, error: countsError } = await supabase
      .rpc('get_unread_counts_for_user');
      
    if (countsError) {
      console.error("Unread counts error:", countsError);
    } else if (countsData) {
      const countsMap = new Map((countsData as UnreadCount[]).map((item: UnreadCount) => 
        [item.room_id, item.unread_count]
      ));
      setUnreadCounts(countsMap);
    }
    
    setLoading(false);
  };

  // リアルタイム更新用（ローディング表示なし）
  const fetchAllDataWithoutLoading = async () => {
    const { data: participationData } = await supabase
      .from('room_participants')
      .select('room_id')
      .eq('user_id', user.id);
      
    if (participationData) {
      const roomIds = participationData.map(p => p.room_id);
      if (roomIds.length > 0) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('id, name, is_group')
          .in('id', roomIds);
        if (roomData) setRooms(roomData);
        
        const personalRooms = roomData?.filter(r => !r.is_group) || [];
        const newMap = new Map<string, string>();
        
        for (const room of personalRooms) {
          const { data: participants } = await supabase
            .from('room_participants')
            .select('user_id')
            .eq('room_id', room.id);
          
          if (participants) {
            const otherUserId = participants.find(p => p.user_id !== user.id)?.user_id;
            if (otherUserId) {
              newMap.set(otherUserId, room.id);
            }
          }
        }
        setPersonalRoomMap(newMap);
      } else {
        setRooms([]);
      }
    }
    
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, nickname, avatar_public_id')
      .neq('id', user.id);
    if (profilesData) setProfiles(profilesData);
    
    const { data: countsData, error: countsError } = await supabase
      .rpc('get_unread_counts_for_user');
      
    if (countsError) {
      console.error("Unread counts error:", countsError);
    } else if (countsData) {
      const countsMap = new Map((countsData as UnreadCount[]).map((item: UnreadCount) => 
        [item.room_id, item.unread_count]
      ));
      setUnreadCounts(countsMap);
    }
  };

  useEffect(() => {
    fetchAllData();
    
    const channel = supabase.channel('realtime rooms')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // リアルタイム更新時はローディングを表示しない
        fetchAllDataWithoutLoading();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [user.id]);

  useEffect(() => {
    const currentRoomId = location.pathname.split('/chat/')[1];
    if (currentRoomId && unreadCounts.has(currentRoomId)) {
      const newCounts = new Map(unreadCounts);
      newCounts.set(currentRoomId, 0);
      setUnreadCounts(newCounts);
    }
  }, [location.pathname]);

  const handleCreateGroupRoom = async () => {
    if (!newRoomName || selectedUserIds.length === 0) { 
      alert('グループ名を入力し、1人以上のメンバーを選択してください。'); 
      return; 
    }
    const participantIds = [user.id, ...selectedUserIds];
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert({ name: newRoomName, is_group: true, created_by: user.id })
      .select()
      .single();
      
    if (newRoom) {
      const participants = participantIds.map(userId => ({ 
        room_id: newRoom.id, 
        user_id: userId 
      }));
      await supabase.from('room_participants').insert(participants);
      setIsCreatingRoom(false); 
      setNewRoomName(''); 
      setSelectedUserIds([]);
      navigate(`/chat/${newRoom.id}`);
    }
  };
  
  const handleCreatePersonalRoom = async (profile: Profile) => {
    try {
      const { data: existingRoom } = await supabase
        .rpc('get_personal_room', { other_user_id: profile.id });
        
      if (existingRoom && existingRoom.length > 0) { 
        navigate(`/chat/${existingRoom[0].room_id}`); 
        return; 
      }
      
      const { data: newRoom } = await supabase
        .from('rooms')
        .insert({ 
          name: profile.nickname || profile.username, 
          is_group: false, 
          created_by: user.id 
        })
        .select()
        .single();
        
      if (newRoom) {
        const participants = [
          { room_id: newRoom.id, user_id: user.id }, 
          { room_id: newRoom.id, user_id: profile.id }
        ];
        await supabase.from('room_participants').insert(participants);
        navigate(`/chat/${newRoom.id}`);
      }
    } catch (error: any) { 
      console.error(error); 
      alert("チャットの開始に失敗しました。"); 
    }
  };
  
  const handleLogout = async () => {
    if (window.confirm("本当にログアウトしますか?")) { 
      await supabase.auth.signOut(); 
      navigate('/auth'); 
    } 
  };

  return (
    <div className="flex flex-col h-full text-white bg-[#303339]">
      <header className="flex items-center justify-between p-4 bg-[#212328] flex-shrink-0">
        <h1 className="text-xl font-bold">トーク</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/profile')} className="text-sm">👤</button>
          <button onClick={() => setIsCreatingRoom(true)} className="text-sm">➕</button>
          <button onClick={handleLogout} className="text-sm">↪</button>
        </div>
      </header>
      
      {isCreatingRoom ? (
        <div className="flex flex-col p-4 flex-1">
          <input 
            type="text" 
            placeholder="グループ名" 
            value={newRoomName} 
            onChange={(e) => setNewRoomName(e.target.value)} 
            className="p-2 rounded bg-gray-700 mb-4" 
          />
          <h3 className="mb-2">メンバーを選択</h3>
          <ul className="flex-1 overflow-y-auto">
            {profiles.map(profile => (
              <li 
                key={profile.id} 
                className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded"
              >
                <input 
                  type="checkbox" 
                  id={`user-${profile.id}`} 
                  checked={selectedUserIds.includes(profile.id)} 
                  onChange={() => setSelectedUserIds(prev => 
                    prev.includes(profile.id) 
                      ? prev.filter(id => id !== profile.id) 
                      : [...prev, profile.id]
                  )} 
                  className="w-4 h-4" 
                />
                <label htmlFor={`user-${profile.id}`}>
                  {profile.nickname || profile.username}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-4">
            <button 
              onClick={handleCreateGroupRoom} 
              className="flex-1 px-3 py-2 bg-green-600 rounded"
            >
              作成
            </button>
            <button 
              onClick={() => setIsCreatingRoom(false)} 
              className="flex-1 px-3 py-2 bg-gray-600 rounded"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                <p className="text-gray-400">読み込み中...</p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="p-4 text-sm font-semibold text-gray-400">個人チャット</h2>
              <ul>
                {profiles.map(profile => {
                  const roomId = personalRoomMap.get(profile.id);
                  const unreadCount = roomId ? (unreadCounts.get(roomId) || 0) : 0;
                  
                  return (
                    <li 
                      key={profile.id} 
                      onClick={() => handleCreatePersonalRoom(profile)}
                      className="flex items-center justify-between gap-3 p-4 border-b border-gray-700 hover:bg-gray-800 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0">
                          {profile.avatar_public_id && (
                            <img 
                              src={`https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/w_40,h_40,c_fill,r_max/${profile.avatar_public_id}`} 
                              alt="avatar" 
                              className="w-full h-full rounded-full object-cover" 
                            />
                          )}
                        </div>
                        <span>{profile.nickname || profile.username}</span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              <h2 className="p-4 mt-4 text-sm font-semibold text-gray-400">グループ</h2>
              <ul>
                {rooms.filter(r => r.is_group).map(room => (
                  <li key={room.id}>
                    <NavLink 
                      to={`/chat/${room.id}`} 
                      className={({ isActive }) => 
                        `flex items-center justify-between p-4 border-b border-gray-700 hover:bg-gray-800 ${
                          isActive ? 'bg-blue-800' : ''
                        }`
                      }
                    >
                      <span>{room.name || '名称未設定'}</span>
                      {(unreadCounts.get(room.id) || 0) > 0 && (
                        <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full">
                          {unreadCounts.get(room.id)}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      )}
    </div>
  )
}