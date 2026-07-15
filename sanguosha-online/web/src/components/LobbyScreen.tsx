import { Button, Empty, Form, Input, InputNumber, Modal, Progress, Select, Skeleton, Tag } from 'antd';
import { useMemo, useState } from 'react';
import type { RoomDetail, RoomSummary } from '../types';

interface CreateRoomValues {
  name: string;
  maxPlayers: number;
}

interface LobbyScreenProps {
  rooms: RoomSummary[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreate: (name: string, maxPlayers: number) => Promise<RoomDetail>;
  onJoin: (roomId: string) => Promise<void>;
}

const statusLabel: Record<RoomSummary['status'], string> = {
  waiting: '等待中',
  playing: '对局中',
  finished: '已结束',
};

export function LobbyScreen({ rooms, loading, onRefresh, onCreate, onJoin }: LobbyScreenProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string>();
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm<CreateRoomValues>();

  const visibleRooms = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    return rooms.filter((room) => {
      const statusMatches = filter === 'all' || room.status === filter;
      const keywordMatches = !lowerKeyword || room.name.toLowerCase().includes(lowerKeyword) || room.hostName.toLowerCase().includes(lowerKeyword);
      return statusMatches && keywordMatches;
    });
  }, [filter, keyword, rooms]);

  const waitingCount = rooms.filter((room) => room.status === 'waiting').length;
  const playingCount = rooms.filter((room) => room.status === 'playing').length;
  const playerCount = rooms.reduce((total, room) => total + room.playerCount, 0);

  const createRoom = async (values: CreateRoomValues) => {
    setCreating(true);
    try {
      await onCreate(values.name.trim(), values.maxPlayers);
      setCreateOpen(false);
      form.resetFields();
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (roomId: string) => {
    setJoiningId(roomId);
    try {
      await onJoin(roomId);
    } finally {
      setJoiningId(undefined);
    }
  };

  return (
    <main className="page lobby-page">
      <section className="lobby-hero">
        <div>
          <span className="section-kicker">群雄已至</span>
          <h1>房间大厅</h1>
          <p>择一席加入，或自行开局。房主可在全员准备后开始对战。</p>
        </div>
        <Button className="primary-ink-button" type="primary" size="large" onClick={() => setCreateOpen(true)}>
          创建房间
        </Button>
      </section>

      <section className="lobby-stats" aria-label="大厅统计">
        <div><strong>{waitingCount}</strong><span>等待房间</span></div>
        <div><strong>{playingCount}</strong><span>进行中</span></div>
        <div><strong>{playerCount}</strong><span>在席玩家</span></div>
      </section>

      <section className="paper-card lobby-list-section">
        <div className="section-toolbar">
          <div>
            <h2>公开房间</h2>
            <p>列表会随服务器状态实时更新</p>
          </div>
          <div className="room-filters">
            <Input.Search
              allowClear
              placeholder="搜索房间或房主"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'waiting', label: '等待中' },
                { value: 'playing', label: '对局中' },
              ]}
            />
            <Button loading={loading} onClick={() => void onRefresh()}>刷新</Button>
          </div>
        </div>

        {loading && rooms.length === 0 ? (
          <div className="room-grid">
            {[0, 1, 2].map((item) => <Skeleton.Node key={item} active className="room-skeleton" />)}
          </div>
        ) : visibleRooms.length === 0 ? (
          <Empty description={rooms.length ? '没有符合条件的房间' : '还没有房间，来开第一局吧'}>
            {!rooms.length && <Button type="primary" onClick={() => setCreateOpen(true)}>创建房间</Button>}
          </Empty>
        ) : (
          <div className="room-grid">
            {visibleRooms.map((room) => {
              const joinable = room.status === 'waiting' && room.playerCount < room.maxPlayers;
              return (
                <article className="room-card" key={room.id}>
                  <div className="room-card__head">
                    <div className="room-mark" aria-hidden="true">局</div>
                    <div>
                      <h3>{room.name}</h3>
                      <p>{room.hostName ? `房主 · ${room.hostName}` : `房间号 · ${room.id.slice(0, 8)}`}</p>
                    </div>
                    <Tag color={room.status === 'waiting' ? 'green' : room.status === 'playing' ? 'volcano' : 'default'}>
                      {statusLabel[room.status]}
                    </Tag>
                  </div>
                  <div className="room-card__occupancy">
                    <span>席位</span>
                    <strong>{room.playerCount} / {room.maxPlayers}</strong>
                  </div>
                  <Progress
                    percent={Math.round((room.playerCount / room.maxPlayers) * 100)}
                    showInfo={false}
                    strokeColor="#7c2428"
                    trailColor="#e8ddca"
                  />
                  <Button
                    block
                    type={joinable ? 'primary' : 'default'}
                    disabled={!joinable}
                    loading={joiningId === room.id}
                    onClick={() => void joinRoom(room.id)}
                  >
                    {room.status === 'playing' ? '对局进行中' : room.playerCount >= room.maxPlayers ? '房间已满' : '加入房间'}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        title="创建新房间"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form<CreateRoomValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ maxPlayers: 5 }}
          onFinish={createRoom}
        >
          <Form.Item
            label="房间名称"
            name="name"
            rules={[
              { required: true, message: '请输入房间名称' },
              { max: 24, message: '房间名称最多 24 个字' },
              { whitespace: true, message: '房间名称不能为空' },
            ]}
          >
            <Input placeholder="例如：周末欢乐局" maxLength={24} showCount autoFocus />
          </Form.Item>
          <Form.Item
            label="最大人数"
            name="maxPlayers"
            extra="经典身份局建议 5—8 人，最多支持 10 人"
            rules={[{ required: true, message: '请选择人数' }]}
          >
            <InputNumber min={2} max={10} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={creating}>
            创建并入席
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
