import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface BanCheckerProps {
  session: any;
  children: React.ReactNode;
}

export default function BanChecker({ session, children }: BanCheckerProps) {
  const [isBanned, setIsBanned] = useState<boolean | null>(null)
  const [banInfo, setBanInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = session?.user

  useEffect(() => {
    const checkBanStatus = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        // BAN状態を確認
        const { data: banData, error } = await supabase
          .from('user_bans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Ban check error:', error)
        }

        if (banData) {
          // 有効期限をチェック
          const now = new Date()
          const expiresAt = banData.expires_at ? new Date(banData.expires_at) : null
          
          if (!expiresAt || expiresAt > now) {
            // BANが有効
            setIsBanned(true)
            setBanInfo(banData)
          } else {
            // 期限切れ
            setIsBanned(false)
          }
        } else {
          setIsBanned(false)
        }
      } catch (error) {
        console.error('Ban check error:', error)
        setIsBanned(false)
      } finally {
        setLoading(false)
      }
    }

    checkBanStatus()

    // 1分ごとにBAN状態を再チェック
    const interval = setInterval(checkBanStatus, 60000)
    return () => clearInterval(interval)
  }, [user])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-lg">確認中...</p>
        </div>
      </div>
    )
  }

  // BANされている場合
  if (isBanned) {
    const expiresAt = banInfo?.expires_at ? new Date(banInfo.expires_at) : null
    const isPermanent = !expiresAt

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-red-900 text-white p-8">
        <div className="text-center max-w-md bg-red-800 p-8 rounded-lg shadow-2xl">
          <div className="text-8xl mb-6">🚫</div>
          <h1 className="text-4xl font-bold mb-4">アカウント停止</h1>
          <p className="text-xl mb-6">
            あなたのアカウントは利用停止されています
          </p>
          
          <div className="bg-red-950 p-4 rounded mb-6 text-left">
            {banInfo?.reason && (
              <div className="mb-3">
                <p className="text-sm text-gray-300">理由:</p>
                <p className="text-lg font-semibold">{banInfo.reason}</p>
              </div>
            )}
            
            <div className="mb-3">
              <p className="text-sm text-gray-300">停止日時:</p>
              <p className="text-lg">{new Date(banInfo.banned_at).toLocaleString('ja-JP')}</p>
            </div>
            
            {isPermanent ? (
              <div>
                <p className="text-sm text-gray-300">期間:</p>
                <p className="text-lg font-bold text-red-400">永久停止</p>
              </div>
            ) : expiresAt && (
              <div>
                <p className="text-sm text-gray-300">解除予定:</p>
                <p className="text-lg">{expiresAt.toLocaleString('ja-JP')}</p>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-300 mb-6">
            この措置について異議がある場合は、管理者にお問い合わせください。
          </p>

          <button
            onClick={handleLogout}
            className="w-full px-6 py-3 bg-white text-red-900 rounded font-bold text-lg hover:bg-gray-200 transition"
          >
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  // BANされていない場合は通常のコンテンツを表示
  return <>{children}</>
}