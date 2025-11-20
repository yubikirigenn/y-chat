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
    else alert('プロフィールを更新しました!')
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white relative">
      {/* スマホ用固定戻るボタン */}
      <button 
        onClick={() => navigate('/')} 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-700 rounded-full shadow-lg text-white hover:bg-gray-600"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* ヘッダー */}
      <header className="flex items-center gap-4 p-4 bg-gray-900 flex-shrink-0">
        <h1 className="text-2xl font-bold ml-12 md:ml-0">プロフィール編集</h1>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          {avatarPublicId && (
            <div className="flex justify-center mb-6">
              <img 
                src={`https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/w_100,h_100,c_fill,r_max/${avatarPublicId}`} 
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover"
              />
            </div>
          )}
          
          <div className="mb-4">
            <label className="block mb-2 text-sm font-semibold">ユーザーネーム (変更不可)</label>
            <input 
              type="text" 
              value={username} 
              disabled 
              className="w-full p-3 bg-gray-600 text-gray-400 rounded" 
            />
          </div>
          
          <div className="mb-4">
            <label className="block mb-2 text-sm font-semibold">ニックネーム</label>
            <input 
              type="text" 
              value={nickname} 
              onChange={(e) => setNickname(e.target.value)} 
              className="w-full p-3 bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>
          
          <div className="mb-6">
            <label className="block mb-2 text-sm font-semibold">アイコン画像を変更</label>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleAvatarUpload} 
              className="w-full p-3 bg-gray-700 rounded"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={updateProfile} 
              disabled={loading} 
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 rounded font-semibold transition disabled:opacity-50"
            >
              {loading ? '更新中...' : '更新'}
            </button>
            <button 
              onClick={() => navigate('/')} 
              className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded font-semibold transition"
            >
              戻る
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}