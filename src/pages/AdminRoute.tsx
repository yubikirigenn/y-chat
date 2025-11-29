import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface AdminRouteProps {
  session: any;
  children: React.ReactNode;
}

export default function AdminRoute({ session, children }: AdminRouteProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [studioEnabled, setStudioEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = session?.user

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user) {
        setIsAdmin(false)
        setLoading(false)
        return
      }

      try {
        // 1. 緊急停止状態をチェック
        const { data: systemData, error: systemError } = await supabase
          .from('system_settings')
          .select('studio_enabled')
          .eq('id', 1)
          .single()

        if (systemError) {
          console.error('System settings error:', systemError)
          setStudioEnabled(false)
          setLoading(false)
          return
        }

        setStudioEnabled(systemData?.studio_enabled ?? false)

        // 緊急停止中の場合は管理者チェックをスキップ
        if (!systemData?.studio_enabled) {
          setIsAdmin(false)
          setLoading(false)
          return
        }

        // 2. 管理者権限をチェック
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Profile error:', profileError)
          setIsAdmin(false)
        } else {
          setIsAdmin(profileData?.is_admin ?? false)
        }
      } catch (error) {
        console.error('Access check error:', error)
        setIsAdmin(false)
      } finally {
        setLoading(false)
      }
    }

    checkAdminAccess()
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-lg">認証確認中...</p>
        </div>
      </div>
    )
  }

  // 緊急停止中
  if (studioEnabled === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-900 text-white p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🚨</div>
          <h1 className="text-3xl font-bold mb-4">緊急停止中</h1>
          <p className="text-lg mb-6">
            Y-Chat Studioは現在、セキュリティ上の理由により停止されています。
          </p>
          <p className="text-sm text-gray-300">
            管理者の方へ: Supabaseで system_settings.studio_enabled を true に設定してください。
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-8 px-6 py-3 bg-white text-red-900 rounded font-semibold hover:bg-gray-200"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  // 管理者でない場合
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-bold mb-4">権限がありません</h1>
          <p className="text-lg mb-6">
            このページにアクセスするには管理者権限が必要です。
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 rounded font-semibold hover:bg-blue-700"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  // 管理者の場合のみ子コンポーネントを表示
  return <>{children}</>
}