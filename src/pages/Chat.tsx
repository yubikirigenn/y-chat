import { supabase } from '../lib/supabaseClient'
import { Session } from '@supabase/supabase-js'

// session propsの型を定義
interface ChatProps {
  session: Session;
}

export default function Chat({ session }: ChatProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">ログイン成功！</h1>
        <p className="text-sm">ようこそ, {session.user.email}</p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700"
        >
          ログアウト
        </button>
      </div>
      <div className="p-4 bg-gray-700 rounded">
        <p>ここにチャットルームが表示されます。</p>
      </div>
    </div>
  )
}