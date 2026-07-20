import { Badge, Button, Layout, Space, Tag } from 'antd';
import type { AuthUser } from '../types';
import { Brand } from './Brand';

type ShellView = 'lobby' | 'admin' | 'room' | 'game';

interface AppShellProps {
  user: AuthUser;
  view: ShellView;
  connected: boolean;
  children: React.ReactNode;
  onLobby: () => void;
  onAdmin: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}

export function AppShell({
  user,
  view,
  connected,
  children,
  onLobby,
  onAdmin,
  onChangePassword,
  onLogout,
}: AppShellProps) {
  const lockedInRoom = view === 'room' || view === 'game';
  return (
    <Layout className="app-layout">
      <header className="app-header">
        <Brand compact />
        <nav className="app-nav" aria-label="主导航">
          <Button aria-current={view === 'lobby' ? 'page' : undefined} type={view === 'lobby' ? 'primary' : 'text'} disabled={lockedInRoom} onClick={onLobby}>
            房间目录
          </Button>
          {user.role === 'admin' && (
            <Button aria-current={view === 'admin' ? 'page' : undefined} type={view === 'admin' ? 'primary' : 'text'} disabled={lockedInRoom} onClick={onAdmin}>
              账号管理
            </Button>
          )}
        </nav>
        <Space className="app-account" size="middle">
          <Badge status={connected ? 'success' : 'warning'} text={connected ? '同步正常' : '正在重连'} />
          <div className="account-name">
            <span>{user.displayName}</span>
            {user.role === 'admin' && <Tag color="gold">管理员</Tag>}
          </div>
          <Button size="small" onClick={onChangePassword}>修改密码</Button>
          <Button size="small" onClick={onLogout}>退出</Button>
        </Space>
      </header>
      <div className={view === 'game' ? 'app-content app-content--game' : 'app-content'}>
        {children}
      </div>
    </Layout>
  );
}
