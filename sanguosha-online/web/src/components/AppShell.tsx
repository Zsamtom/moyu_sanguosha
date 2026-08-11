import { Badge, Button, Layout, Space, Tag } from 'antd';
import { GAME_REGISTRY } from '../games/registry';
import type { AuthUser } from '../types';
import { Brand } from './Brand';

type ShellView = 'lobby' | 'homestead' | 'farm' | 'ranch' | 'mine' | 'restaurant' | 'reader' | 'admin' | 'room' | 'game';

interface AppShellProps {
  user: AuthUser;
  view: ShellView;
  connected: boolean;
  children: React.ReactNode;
  onLobby: () => void;
  onFarm: () => void;
  onReader: () => void;
  onAdmin: () => void;
  onProfile: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}

export function AppShell({
  user,
  view,
  connected,
  children,
  onLobby,
  onFarm,
  onReader,
  onAdmin,
  onProfile,
  onChangePassword,
  onLogout,
}: AppShellProps) {
  const lockedInRoom = view === 'room' || view === 'game';
  const inHomestead = view === 'homestead' || view === 'farm' || view === 'ranch' || view === 'mine';
  const immersive = lockedInRoom || inHomestead;
  return (
    <Layout className={`app-layout${inHomestead ? ' app-layout--farm' : ''}`}>
      {!immersive && <header className="app-header">
        <Brand compact />
        <nav className="app-nav" aria-label="主导航">
          <section className="app-nav__section" aria-labelledby="game-navigation">
            <span id="game-navigation" className="app-nav__label">游戏</span>
            <Button aria-current={view === 'lobby' ? 'page' : undefined} type={view === 'lobby' ? 'primary' : 'text'} disabled={lockedInRoom} onClick={onLobby}>
              游戏大厅
            </Button>
            <div className="app-nav__meta" aria-label="已接入游戏">
              {Object.entries(GAME_REGISTRY).map(([gameType, game]) => (
                <span key={gameType}>{game.label}</span>
              ))}
            </div>
          </section>
          <section className="app-nav__section" aria-labelledby="function-navigation">
            <span id="function-navigation" className="app-nav__label">功能</span>
            <Button type="text" disabled={lockedInRoom} onClick={onFarm}>
              庄园
            </Button>
            <Button aria-current={view === 'reader' ? 'page' : undefined} type={view === 'reader' ? 'primary' : 'text'} disabled={lockedInRoom} onClick={onReader}>
              TXT 小说阅读
            </Button>
          </section>
          {user.role === 'admin' && (
            <section className="app-nav__section" aria-labelledby="admin-navigation">
              <span id="admin-navigation" className="app-nav__label">管理</span>
              <Button aria-current={view === 'admin' ? 'page' : undefined} type={view === 'admin' ? 'primary' : 'text'} disabled={lockedInRoom} onClick={onAdmin}>
                账号管理
              </Button>
            </section>
          )}
        </nav>
        <Space className="app-account" size="middle">
          <Badge status={connected ? 'success' : 'warning'} text={connected ? '同步正常' : '正在重连'} />
          <div className="account-name">
            <span>{user.displayName}</span>
            {user.role === 'admin' && <Tag color="gold">管理员</Tag>}
          </div>
          <Button size="small" onClick={onProfile}>个人资料</Button>
          <Button size="small" onClick={onChangePassword}>修改密码</Button>
          <Button size="small" onClick={onLogout}>退出</Button>
        </Space>
      </header>}
      <div className={`${view === 'game' ? 'app-content app-content--game' : 'app-content'}${immersive ? ' app-content--immersive' : ''}`}>
        {children}
      </div>
    </Layout>
  );
}
