import { ConfigProvider, Spin, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, errorMessage } from './api';
import { AdminUsersScreen } from './components/AdminUsersScreen';
import { AppShell } from './components/AppShell';
import { ChangePasswordModal, RequiredPasswordChangeScreen } from './components/ChangePasswordScreen';
import { DoudizhuBoard } from './components/DoudizhuBoard';
import { GameBoard } from './components/GameBoard';
import { GoujiBoard } from './components/GoujiBoard';
import { LobbyScreen } from './components/LobbyScreen';
import { LoginScreen } from './components/LoginScreen';
import { NovelReaderScreen } from './components/NovelReaderScreen';
import { RoomScreen } from './components/RoomScreen';
import { RoomChat } from './components/RoomChat';
import { realtime } from './realtime';
import type {
  AuthUser,
  BotIntelligence,
  BotMode,
  DeepSeekModel,
  DoudizhuLlmRecommendation,
  FullGeneralId,
  AnyGameAction,
  GameLogEntry,
  GameType,
  LlmSettings,
  PlayableFaction,
  RoomDetail,
  RoomRuleConfig,
  RoomSummary,
  UpdateLlmSettings,
} from './types';
import { isDoudizhuGameView, isGoujiGameView, normalizeGameView } from './types';

const documentTheme = {
  token: {
    colorPrimary: '#111111',
    colorInfo: '#111111',
    colorSuccess: '#3f3f3f',
    colorWarning: '#595959',
    colorError: '#444444',
    colorText: '#1f1f1f',
    colorTextSecondary: '#666666',
    colorBgContainer: '#ffffff',
    colorBorder: '#dedede',
    borderRadius: 6,
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: 'none' },
    Table: { headerBg: '#f7f7f7', headerColor: '#3d3d3d' },
    Modal: { headerBg: '#ffffff', contentBg: '#ffffff' },
  },
};

export default function App() {
  const [toast, toastContext] = message.useMessage();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [rawGame, setRawGame] = useState<unknown | null>(null);
  const [extraLogs, setExtraLogs] = useState<GameLogEntry[]>([]);
  const [workspaceView, setWorkspaceView] = useState<'lobby' | 'reader' | 'admin'>('lobby');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>();
  const [llmSettingsLoading, setLlmSettingsLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();

  const game = useMemo(() => {
    if (!rawGame || !user || isGoujiGameView(rawGame) || isDoudizhuGameView(rawGame)) return null;
    const normalized = normalizeGameView(rawGame, { roomId: room?.id, room, userId: user.id });
    return extraLogs.length ? { ...normalized, logs: [...normalized.logs, ...extraLogs] } : normalized;
  }, [extraLogs, rawGame, room, user]);
  const goujiGame = useMemo(() => isGoujiGameView(rawGame) ? rawGame : null, [rawGame]);
  const doudizhuGame = useMemo(() => isDoudizhuGameView(rawGame) ? rawGame : null, [rawGame]);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const lobby = await api.listRooms();
      setRooms(lobby.rooms);
      if (lobby.currentRoom) setRoom(lobby.currentRoom);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRoomsLoading(false);
    }
  }, [toast]);

  const refreshUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers(await api.listUsers());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const refreshLlmSettings = useCallback(async () => {
    setLlmSettingsLoading(true);
    try {
      setLlmSettings(await api.getLlmSettings());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLlmSettingsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    api.me()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setLoginError(errorMessage(error));
        }
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user || user.mustChangePassword) {
      realtime.disconnect();
      setConnected(false);
      return;
    }
    realtime.connect({
      onConnectionChange: setConnected,
      onRooms: setRooms,
      onRoom: (nextRoom) => {
        setRoom(nextRoom);
        if (!nextRoom) {
          setRawGame(null);
          setExtraLogs([]);
        }
      },
      onGame: (nextGame) => {
        setRawGame(nextGame);
        setExtraLogs([]);
      },
      onLog: (log) => setExtraLogs((current) => [...current, log]),
      onError: (text) => toast.error(text),
    });
    void refreshRooms();
    return () => realtime.disconnect();
  }, [refreshRooms, toast, user]);

  const login = async ({ username, password }: { username: string; password: string }) => {
    setLoginLoading(true);
    setLoginError(undefined);
    setPasswordError(undefined);
    try {
      setUser(await api.login(username.trim(), password));
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // The local session is still cleared if the server is temporarily unavailable.
    }
    realtime.disconnect();
    setUser(null);
    setRoom(null);
    setRawGame(null);
    setRooms([]);
    setUsers([]);
    setWorkspaceView('lobby');
    setPasswordOpen(false);
    setPasswordError(undefined);
  };

  const changePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setPasswordLoading(true);
    setPasswordError(undefined);
    try {
      const updated = await api.changePassword(values.currentPassword, values.newPassword);
      setUser(updated);
      setPasswordOpen(false);
      toast.success('密码已修改');
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setPasswordLoading(false);
    }
  };

  const createRoom = async (
    name: string,
    maxPlayers: number,
    ruleConfig: RoomRuleConfig | undefined,
    botIntelligence: BotIntelligence,
    gameType: GameType,
    botMode: BotMode,
  ) => {
    try {
      const created = await api.createRoom(name, maxPlayers, ruleConfig, botIntelligence, gameType, botMode);
      setRoom(created);
      setWorkspaceView('lobby');
      toast.success('房间已创建');
      return created;
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const joinRoom = async (roomId: string) => {
    try {
      setRoom(await api.joinRoom(roomId));
      setWorkspaceView('lobby');
      toast.success('已加入房间');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const setReady = async (ready: boolean) => {
    if (!room) return;
    try {
      const updated = await api.setReady(room.id, ready);
      if (updated) setRoom(updated);
      toast.success(ready ? '已准备' : '已取消准备');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const startRoom = async () => {
    if (!room) return;
    try {
      const updated = await api.startRoom(room.id);
      setRoom(updated);
      toast.success(updated.status === 'drafting' ? '进入选将' : '游戏开始');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const rematchRoom = async () => {
    if (!room) return;
    try {
      const updated = await api.rematchRoom(room.id);
      setRoom(updated);
      toast.success(updated.status === 'playing' ? '下一局已开始' : '已确认，等待其他真人玩家');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const chooseGeneral = async (generalId: FullGeneralId) => {
    if (!room) return;
    try {
      setRoom(await api.chooseGeneral(room.id, generalId));
      toast.success('武将已确认');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const chooseGodFaction = async (faction: PlayableFaction) => {
    if (!room) return;
    try {
      setRoom(await api.chooseGodFaction(room.id, faction));
      toast.success('势力已确认');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const addBot = async () => {
    if (!room) return;
    try { setRoom(await api.addBot(room.id)); toast.success('已添加机器人'); }
    catch (error) { toast.error(errorMessage(error)); throw error; }
  };

  const removeBot = async (botId: string) => {
    if (!room) return;
    try { setRoom(await api.removeBot(room.id, botId)); toast.success('已移除机器人'); }
    catch (error) { toast.error(errorMessage(error)); throw error; }
  };

  const leaveRoom = async () => {
    if (!room) return;
    try {
      await api.leaveRoom(room.id);
      setRoom(null);
      setRawGame(null);
      setExtraLogs([]);
      await refreshRooms();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const sendAction = async (action: AnyGameAction) => {
    if (!game && !goujiGame && !doudizhuGame) return;
    try {
      await realtime.sendGameAction(game?.roomId || room?.id || '', action);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const sendRoomChat = async (text: string) => {
    if (!room) return;
    try {
      await realtime.sendRoomChat(room.id, text);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const createUser = async (values: {
    username: string;
    displayName: string;
    password: string;
  }) => {
    try {
      const created = await api.createUser(values);
      setUsers((current) => [created, ...current]);
      toast.success(`账号 ${created.username} 已创建`);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const changeUserStatus = async (userId: string, disabled: boolean) => {
    try {
      const updated = await api.setUserDisabled(userId, disabled);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(disabled ? '账号已停用' : '账号已启用');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const changeUserDisplayName = async (userId: string, displayName: string) => {
    try {
      const updated = await api.setUserDisplayName(userId, displayName);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (updated.id === user?.id) setUser(updated);
      toast.success('玩家昵称已修改');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await api.deleteUser(userId);
      setUsers((current) => current.filter((item) => item.id !== userId));
      toast.success('账号已删除');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const resetPassword = async (userId: string, password: string) => {
    try {
      const updated = await api.resetPassword(userId, password);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (updated.id === user?.id) {
        toast.success('当前账号密码已重置，请重新登录');
        await logout();
        return;
      }
      toast.success('密码已重置');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const getDoudizhuLlmRecommendation =
    async (): Promise<DoudizhuLlmRecommendation> => {
      if (!room) throw new Error('当前不在房间中');
      try {
        const recommendation = await api.getDoudizhuLlmRecommendation(room.id);
        if (recommendation.source === 'rules') {
          toast.warning('大模型未返回有效建议，已提供规则推荐');
        }
        return recommendation;
      } catch (error) {
        toast.error(errorMessage(error));
        throw error;
      }
    };

  const saveLlmSettings = async (values: UpdateLlmSettings) => {
    try {
      const updated = await api.updateLlmSettings(values);
      setLlmSettings(updated);
      toast.success(updated.enabled ? 'DeepSeek 机器人已启用' : '大模型机器人配置已保存');
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const testLlmConnection = async (apiKey?: string, model?: DeepSeekModel) => {
    try {
      const result = await api.testLlmConnection(apiKey, model);
      toast.success(`${result.model} 连接成功 · ${result.latencyMs} ms`);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  if (booting) {
    return (
      <div className="boot-screen">
        <span className="boot-seal">01</span>
        <Spin size="large" />
        <p>正在载入工作区……</p>
      </div>
    );
  }

  if (!user) {
    return (
      <ConfigProvider theme={documentTheme}>
        {toastContext}
        <LoginScreen loading={loginLoading} error={loginError} onLogin={login} />
      </ConfigProvider>
    );
  }

  if (user.mustChangePassword) {
    return (
      <ConfigProvider theme={documentTheme}>
        {toastContext}
        <RequiredPasswordChangeScreen
          displayName={user.displayName}
          loading={passwordLoading}
          error={passwordError}
          onChangePassword={changePassword}
          onLogout={() => void logout()}
        />
      </ConfigProvider>
    );
  }

  const view = game || goujiGame || doudizhuGame ? 'game' : room ? 'room' : workspaceView;

  return (
    <ConfigProvider
      theme={documentTheme}
    >
      {toastContext}
      <AppShell
        user={user}
        view={view}
        connected={connected}
        onLobby={() => setWorkspaceView('lobby')}
        onReader={() => setWorkspaceView('reader')}
        onAdmin={() => setWorkspaceView('admin')}
        onChangePassword={() => {
          setPasswordError(undefined);
          setPasswordOpen(true);
        }}
        onLogout={() => void logout()}
      >
        {doudizhuGame ? (
          <DoudizhuBoard
            game={doudizhuGame}
            room={room}
            userId={user.id}
            connected={connected}
            onAction={sendAction}
            onLlmRecommendation={getDoudizhuLlmRecommendation}
            onExit={leaveRoom}
            onRematch={rematchRoom}
          />
        ) : goujiGame ? (
          <GoujiBoard
            game={goujiGame}
            userId={user.id}
            connected={connected}
            onAction={sendAction}
            onExit={leaveRoom}
          />
        ) : game ? (
          <GameBoard game={game} room={room} connected={connected} onAction={sendAction} onExit={leaveRoom} />
        ) : room ? (
          <RoomScreen
            room={room}
            user={user}
            connected={connected}
            onReady={setReady}
            onStart={startRoom}
            onLeave={leaveRoom}
            onAddBot={addBot}
            onRemoveBot={removeBot}
            onChooseGeneral={chooseGeneral}
            onChooseGodFaction={chooseGodFaction}
          />
        ) : workspaceView === 'reader' ? (
          <NovelReaderScreen />
        ) : workspaceView === 'admin' && user.role === 'admin' ? (
          <AdminUsersScreen
            currentUser={user}
            users={users}
            loading={usersLoading}
            llmSettings={llmSettings}
            llmSettingsLoading={llmSettingsLoading}
            onRefresh={refreshUsers}
            onRefreshLlmSettings={refreshLlmSettings}
            onSaveLlmSettings={saveLlmSettings}
            onTestLlmConnection={testLlmConnection}
            onCreate={createUser}
            onDisplayName={changeUserDisplayName}
            onStatus={changeUserStatus}
            onResetPassword={resetPassword}
            onDelete={deleteUser}
          />
        ) : (
          <LobbyScreen rooms={rooms} loading={roomsLoading} onRefresh={refreshRooms} onCreate={createRoom} onJoin={joinRoom} />
        )}
      </AppShell>
      {room && (
        <RoomChat
          roomName={room.name}
          messages={room.chatMessages}
          user={user}
          connected={connected}
          onSend={sendRoomChat}
        />
      )}
      <ChangePasswordModal
        open={passwordOpen}
        loading={passwordLoading}
        error={passwordError}
        onClose={() => {
          if (!passwordLoading) {
            setPasswordOpen(false);
            setPasswordError(undefined);
          }
        }}
        onChangePassword={changePassword}
      />
    </ConfigProvider>
  );
}
