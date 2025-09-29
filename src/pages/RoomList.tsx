import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { NavLink, useNavigate } from 'react-router-dom'

// 型定義
interface Room { id: string; name: string; is_group: boolean; }
interface Profile { id: string; username: string; nickname: string | null; avatar_public_id: string | null; }
interface RoomListProps { session: any; }

export default function RoomList({ session }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const navigate = useNavigate()
  const user = session.user

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: participationData } = await supabase.from('room_participants').select('room_id').eq('user_id', user.id);
      if (participationData) {
        const roomIds = participationData.map(p => p.room_id);
        if (roomIds.length > 0) {
          const { data: roomData } = await supabase.from('rooms').select('id, name, is_group').in('id', roomIds);
          if (roomData) setRooms(roomData);
        } else {
          setRooms([]); // 参加ルームがない場合は空にする
        }
      }
      const { data: profilesData } = await supabase.from('profiles').select('id, username, nickname, avatar_public_id').neq('id', user.id);
      if (profilesData) setProfiles(profilesData);
    };
    fetchInitialData();
    
    const channel = supabase.channel('realtime rooms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants', filter: `user_id=eq.${user.id}` }, 
      () => {
        fetchInitialData();
      }
    ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user.id]);
  
  const handleCreateGroupRoom = async () => { 
    if (!newRoomName || selectedUserIds.length === 0) { alert('グループ名を入力し、1人以上のメンバーを選択してください。'); return; }
    const participantIds = [user.id, ...selectedUserIds];
    const { data: newRoom } = await supabase.from('rooms').insert({ name: newRoomName, is_group: true, created_by: user.id }).select().single();
    if (newRoom) {
      const participants = participantIds.map(userId => ({ room_id: newRoom.id, user_id: userId }));
      await supabase.from('room_participants').insert(participants);
      setIsCreatingRoom(false); setNewRoomName(''); setSelectedUserIds([]);
      navigate(`/chat/${newRoom.id}`);
    }
  };
  
  const handleCreatePersonalRoom = async (profile: Profile) => { 
    try {
      const { data: existingRoom } = await supabase.rpc('get_personal_room', { other_user_id: profile.id });
      if (existingRoom && existingRoom.length > 0) { navigate(`/chat/${existingRoom[0].room_id}`); return; }
      const { data: newRoom } = await supabase.from('rooms').insert({ name: profile.nickname || profile.username, is_group: false, created_by: user.id }).select().single();
      if (newRoom) {
        const participants = [{ room_id: newRoom.id, user_id: user.id }, { room_id: newRoom.id, user_id: profile.id }];
        await supabase.from('room_participants').insert(participants);
        navigate(`/chat/${newRoom.id}`);
      }
    } catch (error: any) { console.error(error); alert("チャットの開始に失敗しました。"); }
  };
  
  const handleLogout = async () => { if (window.confirm("本当にログアウトしますか？")) { await supabase.auth.signOut(); navigate('/auth'); } };

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
          <input type="text" placeholder="グループ名" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} className="p-2 rounded bg-gray-700 mb-4" />
          <h3 className="mb-2">メンバーを選択</h3>
          <ul className="flex-1 overflow-y-auto">
            {profiles.map(profile => (
              <li key={profile.id} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded">
                <input type="checkbox" id={`user-${profile.id}`} checked={selectedUserIds.includes(profile.id)} onChange={() => setSelectedUserIds(prev => prev.includes(profile.id) ? prev.filter(id => id !== profile.id) : [...prev, profile.id])} className="w-4 h-4" />
                <label htmlFor={`user-${profile.id}`}>{profile.nickname || profile.username}</label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-4"><button onClick={handleCreateGroupRoom} className="flex-1 px-3 py-2 bg-green-600 rounded">作成</button><button onClick={() => setIsCreatingRoom(false)} className="flex-1 px-3 py-2 bg-gray-600 rounded">キャンセル</button></div>
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto">
            <h2 className="p-4 text-sm font-semibold text-gray-400">個人チャット</h2>
            <ul>
              {profiles.map(profile => (
                <li key={profile.id} onClick={() => handleCreatePersonalRoom(profile)}
                    className="flex items-center gap-3 p-4 border-b border-gray-700 hover:bg-gray-800 cursor-pointer">
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0">
                    {profile.avatar_public_id && <img src={`https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/w_40,h_40,c_fill,r_max/${profile.avatar_public_id}`} alt="avatar" className="w-full h-full rounded-full object-cover" />}
                  </div>
                  <span>{profile.nickname || profile.username}</span>
                </li>
              ))}
            </ul>

            <h2 className="p-4 mt-4 text-sm font-semibold text-gray-400">グループ</h2>
            <ul>
              {rooms.filter(r => r.is_group).map(room => (
                <li key={room.id}>
                  <NavLink to={`/chat/${room.id}`} className={({ isActive }) => `block p-4 border-b border-gray-700 hover:bg-gray-800 ${isActive ? 'bg-blue-800' : ''}`}>
                    {room.name || '名称未設定'}
                  </NavLink>
                </li>
              ))}
            </ul>
        </main>
      )}
    </div>
  )
}