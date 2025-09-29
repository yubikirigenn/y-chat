import { Outlet } from 'react-router-dom';
import RoomList from './RoomList'; // RoomListをコンポーネントとして使用

interface MainLayoutProps {
  session: any;
}

export default function MainLayout({ session }: MainLayoutProps) {
  return (
    <div className="flex h-screen font-sans">
      {/* 左側サイドバー: トークルーム一覧 */}
      <div className="w-80 flex-shrink-0 bg-black">
        <RoomList session={session} />
      </div>

      {/* 右側メインコンテンツ: チャット画面 */}
      <main className="flex-1">
        <Outlet /> 
      </main>
    </div>
  );
}
