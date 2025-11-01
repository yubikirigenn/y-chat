import { Outlet, useLocation } from 'react-router-dom';
import RoomList from './RoomList';

interface MainLayoutProps {
  session: any;
}

export default function MainLayout({ session }: MainLayoutProps) {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat/');

  return (
    <div className="flex h-screen font-sans">
      {/* 左側サイドバー: トークルーム一覧 */}
      <div className="w-80 flex-shrink-0 bg-black">
        <RoomList session={session} />
      </div>

      {/* 右側メインコンテンツ: チャット画面またはプレースホルダー */}
      <main className="flex-1">
        {isChatRoute ? (
          <Outlet />
        ) : (
          <div className="flex flex-col h-screen justify-center items-center bg-[#798696] text-white">
            <h2 className="text-xl">トークルームを選択してください</h2>
          </div>
        )}
      </main>
    </div>
  );
}