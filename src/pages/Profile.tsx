import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface ProfileProps { session: any; }

export default function Profile({ session }: ProfileProps) {
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatarPublicId, setAvatarPublicId] = useState('')
  const user = session.user
  const navigate = useNavigate()

  useEffect(() => {
    const getProfile = async () => {
      const { data, error } = await supabase.from('profiles').select(`username, nickname, avatar_public_id`).eq('id', user.id).single()
      if (error) console.warn(error)
      else if (data) {
        setUsername(data.username || '')
        setNickname(data.nickname || '')
        setAvatarPublicId(data.avatar_public_id || '')
      }
      setLoading(false)
    }
    getProfile()
  }, [user.id])

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

    try {
      setLoading(true);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.secure_url) {
        setAvatarPublicId(data.public_id);
      }
    } catch (error) {
      console.error('Upload error', error);
      alert('画像のアップロードに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    setLoading(true)
    const updates = {
      id: user.id,
      nickname,
      avatar_public_id: avatarPublicId,
    }
    const { error } = await supabase.from('profiles').upsert(updates)
    if (error) alert(error.message)
    else alert('プロフィールを更新しました！')
    setLoading(false)
  }

  return (
    <div className="p-4 bg-gray-800 text-white min-h-screen">
      <h1 className="text-2xl mb-4">プロフィール編集</h1>
      {avatarPublicId && (
        <img 
          src={`https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/w_100,h_100,c_fill,r_max/${avatarPublicId}`} 
          alt="Avatar"
          className="w-24 h-24 rounded-full mb-4 object-cover"
        />
      )}
      <div><label>ユーザーネーム (変更不可)</label><input type="text" value={username} disabled className="w-full p-2 bg-gray-600 text-gray-400 rounded mt-1" /></div>
      <div className="mt-4"><label>ニックネーム</label><input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full p-2 bg-gray-700 rounded mt-1" /></div>
      <div className="mt-4">
        <label>アイコン画像を変更</label>
        <input type="file" accept="image/*" onChange={handleAvatarUpload} className="w-full p-2 bg-gray-700 rounded mt-1"/>
      </div>
      <div className="mt-6"><button onClick={updateProfile} disabled={loading} className="px-4 py-2 bg-green-600 rounded">{loading ? '更新中...' : '更新'}</button><button onClick={() => navigate('/')} className="ml-4 px-4 py-2 bg-gray-600 rounded">戻る</button></div>
    </div>
  )
}