import { Button, Checkbox, Collapse, Empty, Form, Input, InputNumber, Modal, Progress, Select, Skeleton, Tag } from 'antd';
import { useMemo, useRef, useState } from 'react';
import {
  BOT_INTELLIGENCE_NAMES,
  DOUDIZHU_BOT_INTELLIGENCE_NAMES,
  GOUJI_BOT_INTELLIGENCE_NAMES,
  type BotIntelligence,
  type BotMode,
  type GameType,
  type PackId,
  type RoomDetail,
  type RoomRuleConfig,
  type RoomSummary,
} from '../types';

interface CreateRoomValues {
  name: string;
  gameType: GameType;
  maxPlayers: number;
  botIntelligence: BotIntelligence;
  botMode: BotMode;
  enabledGeneralPacks: PackId[];
  selectionMode: 'choice' | 'random';
  candidatesPerPlayer: number;
  allowDuplicateGenerals: boolean;
  maximumReshuffles: number;
  lordBonusMinimumPlayers: number;
  godFactionChoice: boolean;
}

interface LobbyScreenProps {
  rooms: RoomSummary[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreate: (
    name: string,
    maxPlayers: number,
    ruleConfig: RoomRuleConfig | undefined,
    botIntelligence: BotIntelligence,
    gameType: GameType,
    botMode: BotMode,
  ) => Promise<RoomDetail>;
  onJoin: (roomId: string) => Promise<void>;
}

const statusLabel: Record<RoomSummary['status'], string> = {
  waiting: '等待中',
  drafting: '选将中',
  playing: '对局中',
  finished: '已结束',
};

const packOptions: Array<{ label: string; value: PackId }> = [
  { label: '标准', value: 'standard' },
  { label: 'SP', value: 'sp' },
  { label: '风', value: 'wind' },
  { label: '火', value: 'fire' },
  { label: '林', value: 'forest' },
  { label: '山', value: 'mountain' },
  { label: '神', value: 'god' },
];

export function LobbyScreen({ rooms, loading, onRefresh, onCreate, onJoin }: LobbyScreenProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const createInFlight = useRef(false);
  const [joiningId, setJoiningId] = useState<string>();
  const [filter, setFilter] = useState<'all' | RoomSummary['status']>('all');
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm<CreateRoomValues>();
  const gameType = Form.useWatch('gameType', form) ?? 'sanguosha';
  const selectionMode = Form.useWatch('selectionMode', form);
  const enabledPacks = Form.useWatch('enabledGeneralPacks', form);

  const visibleRooms = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    return rooms.filter((room) => {
      const statusMatches = filter === 'all' || room.status === filter;
      const keywordMatches = !lowerKeyword || room.name.toLowerCase().includes(lowerKeyword) || room.hostName.toLowerCase().includes(lowerKeyword);
      return statusMatches && keywordMatches;
    });
  }, [filter, keyword, rooms]);

  const waitingCount = rooms.filter((room) => room.status === 'waiting').length;
  const playingCount = rooms.filter((room) => room.status === 'drafting' || room.status === 'playing').length;
  const playerCount = rooms.reduce((total, room) => total + room.playerCount, 0);

  const createRoom = async (values: CreateRoomValues) => {
    if (createInFlight.current) return;
    createInFlight.current = true;
    setCreating(true);
    try {
      const ruleConfig: RoomRuleConfig | undefined = values.gameType === 'sanguosha'
        ? {
            ruleSetVersion: 'original-66-v1',
            enabledGeneralPacks: values.enabledGeneralPacks,
            generalSelection: {
              mode: values.selectionMode,
              candidatesPerPlayer: values.selectionMode === 'choice' ? values.candidatesPerPlayer : 1,
              allowDuplicateGenerals: values.allowDuplicateGenerals,
            },
            deckProfile: 'original-160',
            maximumReshuffles: values.maximumReshuffles,
            lordBonusMinimumPlayers: values.lordBonusMinimumPlayers,
            godFactionChoice: values.godFactionChoice ?? true,
          }
        : undefined;
      await onCreate(
        values.name.trim(),
        values.gameType === 'gouji' ? 6 : values.gameType === 'doudizhu' ? 3 : values.maxPlayers,
        ruleConfig,
        values.botIntelligence ?? 3,
        values.gameType,
        values.gameType === 'gouji' ? 'rules' : values.botMode ?? 'rules',
      );
      setCreateOpen(false);
      form.resetFields();
    } finally {
      createInFlight.current = false;
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
          <span className="section-kicker">Workspace / Rooms</span>
          <h1>房间目录</h1>
          <p>查看实时协作房间，或按当前规则模板新建一个工作区。</p>
        </div>
        <Button className="primary-ink-button" type="primary" size="large" onClick={() => setCreateOpen(true)}>
          创建房间
        </Button>
      </section>

      <section className="lobby-stats" aria-label="大厅统计">
        <div><strong>{waitingCount}</strong><span>等待房间</span></div>
        <div><strong>{playingCount}</strong><span>活动房间</span></div>
        <div><strong>{playerCount}</strong><span>在线成员</span></div>
      </section>

      <section className="paper-card lobby-list-section">
        <div className="section-toolbar">
          <div>
            <h2>房间索引</h2>
            <p>状态由服务器实时同步</p>
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
                { value: 'drafting', label: '选将中' },
                { value: 'playing', label: '对局中' },
                { value: 'finished', label: '已结束' },
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
                    <div className="room-mark" aria-hidden="true">#</div>
                    <div>
                      <h3>{room.name}</h3>
                      <p>
                        {room.gameType === 'gouji' ? '够级' : room.gameType === 'doudizhu' ? '斗地主' : '三国杀'} · {' '}
                        {room.hostName ? `房主 ${room.hostName}` : `房间号 ${room.id.slice(0, 8)}`}
                      </p>
                    </div>
                    <Tag color={room.status === 'waiting' ? 'green' : room.status === 'drafting' ? 'blue' : room.status === 'playing' ? 'orange' : 'default'}>
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
                    strokeColor="#111111"
                    trailColor="#e8e8e8"
                  />
                  <Button
                    block
                    type={joinable ? 'primary' : 'default'}
                    disabled={!joinable}
                    loading={joiningId === room.id}
                    onClick={() => void joinRoom(room.id)}
                  >
                    {room.status === 'drafting' ? '正在选将' : room.status === 'playing' ? '对局进行中' : room.status === 'finished' ? '房间已结束' : room.playerCount >= room.maxPlayers ? '房间已满' : '加入房间'}
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
          initialValues={{
            gameType: 'sanguosha',
            maxPlayers: 5,
            botIntelligence: 3,
            botMode: 'rules',
            enabledGeneralPacks: ['standard', 'sp'],
            selectionMode: 'random',
            candidatesPerPlayer: 3,
            allowDuplicateGenerals: false,
            maximumReshuffles: 5,
            lordBonusMinimumPlayers: 5,
            godFactionChoice: true,
          }}
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
          <Form.Item label="游戏类型" name="gameType">
            <Select options={[
              { value: 'sanguosha', label: '三国杀 · 经典身份局' },
              { value: 'gouji', label: '够级 · 山东 6 人 3V3' },
              { value: 'doudizhu', label: '斗地主 · 经典 3 人局' },
            ]} />
          </Form.Item>
          {gameType === 'gouji' ? (
            <>
              <div className="game-type-note">
                <strong>够级固定 6 人</strong>
                <p>196 张牌，甲乙联邦交错落座；支持真人与服务器机器人混合开局。</p>
                <p>已启用憋 3、4 全出、够级隔离、开点、烧牌、让牌与头科至大拉结算。</p>
              </div>
              <Form.Item
                label="机器人水平"
                name="botIntelligence"
                extra="昵称随机生成；小字显示对应水平头衔。"
              >
                <Select options={Object.entries(GOUJI_BOT_INTELLIGENCE_NAMES).map(([value, label]) => ({
                  value: Number(value),
                  label: `${value} · ${label}`,
                }))} />
              </Form.Item>
            </>
          ) : gameType === 'doudizhu' ? (
            <>
              <div className="game-type-note">
                <strong>斗地主固定 3 人</strong>
                <p>标准 54 张牌，三人依次叫分；地主获得 3 张底牌，先出完手牌的一方获胜。</p>
                <p>支持顺子、连对、飞机、四带二、炸弹、王炸，以及炸弹与春天倍率。</p>
              </div>
              <Form.Item
                label="机器人水平"
                name="botIntelligence"
                extra="机器人会自动叫分、跟牌或不出，可与真人混合开局。"
              >
                <Select options={Object.entries(DOUDIZHU_BOT_INTELLIGENCE_NAMES).map(([value, label]) => ({
                  value: Number(value),
                  label: `${value} · ${label}`,
                }))} />
              </Form.Item>
              <Form.Item
                label="机器人决策引擎"
                name="botMode"
                extra="选择大模型后，机器人每次叫分和出牌都会请求当前模型；短上下文和分级提示词负责节省 Token，调用失败时回退规则机器人。"
              >
                <Select options={[
                  { value: 'rules', label: '规则机器人（零 Token）' },
                  { value: 'llm', label: '大模型全程决策' },
                ]} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                label="最大人数"
                name="maxPlayers"
                extra="经典身份局建议 5—8 人，最多支持 10 人"
                rules={[{ required: true, message: '请选择人数' }]}
              >
                <InputNumber min={2} max={10} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="机器人智略" name="botIntelligence" extra="仅影响机器人决策；默认虎贲校尉。">
                <Select options={Object.entries(BOT_INTELLIGENCE_NAMES).map(([value, label]) => ({
                  value: Number(value),
                  label: `${value} · ${label}`,
                }))} />
              </Form.Item>
              <Form.Item
                label="机器人决策引擎"
                name="botMode"
                extra="选择大模型后，机器人每次需要操作都会请求当前模型；仅发送短局面摘要和合法候选编号，失败时回退规则机器人。"
              >
                <Select options={[
                  { value: 'rules', label: '规则机器人（零 Token）' },
                  { value: 'llm', label: '大模型全程决策' },
                ]} />
              </Form.Item>
              <Form.Item
                label="武将扩展包"
                name="enabledGeneralPacks"
                rules={[{ required: true, message: '请至少启用一个武将包' }]}
              >
                <Checkbox.Group options={packOptions} />
              </Form.Item>
              <Form.Item label="选将方式" name="selectionMode">
                <Select options={[
                  { value: 'random', label: '服务器随机分配' },
                  { value: 'choice', label: '每人从私有候选中选择' },
                ]} />
              </Form.Item>
              {selectionMode === 'choice' && (
            <Form.Item
              label="每人候选数"
              name="candidatesPerPlayer"
              extra="候选仅本人可见；武将不足时请增加扩展包或允许重复。"
            >
              <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} />
            </Form.Item>
              )}
              <Collapse
            ghost
            items={[{
              key: 'advanced',
              label: '高级规则',
              forceRender: true,
              children: (
                <div className="advanced-rule-fields">
                  <Form.Item name="allowDuplicateGenerals" valuePropName="checked">
                    <Checkbox>允许不同玩家使用相同武将</Checkbox>
                  </Form.Item>
                  {enabledPacks?.includes('god') && (
                    <Form.Item name="godFactionChoice" valuePropName="checked">
                      <Checkbox>神武将由玩家选择魏、蜀、吴或群势力</Checkbox>
                    </Form.Item>
                  )}
                  <Form.Item label="牌堆最多重洗次数" name="maximumReshuffles">
                    <InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item label="主公增加体力的人数门槛" name="lordBonusMinimumPlayers">
                    <InputNumber min={2} max={10} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              ),
            }]}
              />
            </>
          )}
          <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={creating}>
            创建并入席
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
