import { Alert, Button, Popconfirm, Tag, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { gameRegistration, isSplendorGameType } from '../games/registry';
import { getRoomStartBlockReason } from '../interactionRules';
import {
  DOUDIZHU_BOT_INTELLIGENCE_NAMES,
  DIGIT_BOMB_BOT_INTELLIGENCE_NAMES,
  GOUJI_BOT_INTELLIGENCE_NAMES,
  NUMBER_CONNECT_BOT_INTELLIGENCE_NAMES,
  SPLENDOR_BOT_INTELLIGENCE_NAMES,
  type AuthUser,
  type FullGeneralId,
  type GameRole,
  type PlayableFaction,
  type RoomDetail,
} from '../types';

interface RoomScreenProps {
  room: RoomDetail;
  user: AuthUser;
  connected: boolean;
  onReady: (ready: boolean) => Promise<void>;
  onStart: () => Promise<void>;
  onLeave: () => Promise<void>;
  onAddBot: () => Promise<void>;
  onRemoveBot: (botId: string) => Promise<void>;
  onChooseGeneral: (generalId: FullGeneralId) => Promise<void>;
  onChooseGodFaction: (faction: PlayableFaction) => Promise<void>;
}

export const generalNames = {
  cao_cao: '曹操', guo_jia: '郭嘉', si_ma_yi: '司马懿', xia_hou_dun: '夏侯惇', xu_chu: '许褚', zhang_liao: '张辽', zhen_ji: '甄姬',
  guan_yu: '关羽', huang_yue_ying: '黄月英', liu_bei: '刘备', ma_chao: '马超', zhang_fei: '张飞', zhao_yun: '赵云', zhu_ge_liang: '诸葛亮',
  da_qiao: '大乔', gan_ning: '甘宁', huang_gai: '黄盖', lu_xun: '陆逊', lv_meng: '吕蒙', sun_quan: '孙权', sun_shang_xiang: '孙尚香', zhou_yu: '周瑜',
  diao_chan: '貂蝉', hua_tuo: '华佗', lv_bu: '吕布', yuan_shu: '袁术',
  cao_ren: '曹仁', huang_zhong: '黄忠', wei_yan: '魏延', xia_hou_yuan: '夏侯渊', xiao_qiao: '小乔', yu_ji: '于吉', zhang_jiao: '张角', zhou_tai: '周泰',
  dian_wei: '典韦', pang_de: '庞德', pang_tong: '庞统', tai_shi_ci: '太史慈', wo_long: '卧龙诸葛亮', xun_yu: '荀彧', yan_liang_wen_chou: '颜良文丑', yuan_shao: '袁绍',
  cao_pi: '曹丕', dong_zhuo: '董卓', jia_xu: '贾诩', lu_su: '鲁肃', meng_huo: '孟获', sun_jian: '孙坚', xu_huang: '徐晃', zhu_rong: '祝融',
  cai_wen_ji: '蔡文姬', deng_ai: '邓艾', jiang_wei: '姜维', liu_chan: '刘禅', sun_ce: '孙策', zhang_he: '张郃', zhang_zhao_zhang_hong: '张昭张纮', zuo_ci: '左慈',
  shen_cao_cao: '神曹操', shen_guan_yu: '神关羽', shen_lv_bu: '神吕布', shen_lv_meng: '神吕蒙', shen_si_ma_yi: '神司马懿', shen_zhao_yun: '神赵云', shen_zhou_yu: '神周瑜', shen_zhu_ge_liang: '神诸葛亮',
} satisfies Record<FullGeneralId, string>;

const factionNames: Record<PlayableFaction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
const draftFactionNames = { ...factionNames, selectable: '神' } as const;
const roleNames: Record<GameRole, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' };
export function RoomScreen({
  room,
  user,
  connected,
  onReady,
  onStart,
  onLeave,
  onAddBot,
  onRemoveBot,
  onChooseGeneral,
  onChooseGodFaction,
}: RoomScreenProps) {
  const [busy, setBusy] = useState<'ready' | 'start' | 'leave' | 'draft'>();
  const self = room.members.find((member) => member.userId === user.id || member.username === user.username);
  const isHost = self?.isHost || room.hostId === user.id;
  const allReady = room.members.every((member) => member.ready);
  const allOnline = room.members.every((member) => member.online);
  const startBlockReason = getRoomStartBlockReason(room, connected);
  const canStart = Boolean(isHost && !startBlockReason);
  const botIntelligence = room.botIntelligence ?? 3;
  const registration = gameRegistration(room.gameType);

  const seats = useMemo(() => {
    const bySeat = new Map(room.members.map((member) => [member.seat, member]));
    return Array.from({ length: room.maxPlayers }, (_, index) => ({ seat: index, member: bySeat.get(index) }));
  }, [room.maxPlayers, room.members]);

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
    } catch {
      // Clipboard access is optional; the visible room id remains selectable.
    }
  };

  const ready = async () => {
    setBusy('ready');
    try {
      await onReady(!self?.ready);
    } finally {
      setBusy(undefined);
    }
  };

  const start = async () => {
    setBusy('start');
    try {
      await onStart();
    } finally {
      setBusy(undefined);
    }
  };

  const leave = async () => {
    setBusy('leave');
    try {
      await onLeave();
    } finally {
      setBusy(undefined);
    }
  };

  const chooseGeneral = async (generalId: FullGeneralId) => {
    setBusy('draft');
    try {
      await onChooseGeneral(generalId);
    } finally {
      setBusy(undefined);
    }
  };

  const chooseGodFaction = async (faction: PlayableFaction) => {
    setBusy('draft');
    try {
      await onChooseGodFaction(faction);
    } finally {
      setBusy(undefined);
    }
  };

  if (room.status === 'drafting' && room.draft) {
    const ownDraft = room.draft.players.find((player) => player.playerId === user.id);
    const selectedName = ownDraft?.generalId ? generalNames[ownDraft.generalId] : undefined;
    const isOwnTurn = room.draft.currentPlayerId === null || room.draft.currentPlayerId === user.id;
    const currentMember = room.members.find((member) => member.userId === room.draft?.currentPlayerId);
    const waitingFor = currentMember?.displayName ?? '当前成员';
    return (
      <main className="page room-page draft-page">
        <section className="room-heading paper-card">
          <div>
            <span className="section-kicker">Room / General selection</span>
            <h1>{room.name}</h1>
            <p className="document-lead">1 号位主公先选，其他成员按座位顺序选择；身份和候选均由服务器确认。</p>
          </div>
          <div className="room-heading__status">
            <Tag color="blue">选将中</Tag>
            <span>{room.draft.players.filter((player) => player.selected).length} / {room.draft.players.length} 已确认</span>
          </div>
        </section>

        {!connected && (
          <Alert className="connection-alert" type="warning" showIcon message="实时连接暂时中断，恢复后才能提交选择。" />
        )}

        <div className="draft-layout">
          <section className="paper-card draft-document">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">Private candidates</span>
                <h2>{ownDraft?.needsFaction && isOwnTurn ? '选择神武将势力' : ownDraft?.selected ? '选择已提交' : isOwnTurn ? '选择一名武将' : `等待 ${waitingFor} 选择`}</h2>
                <p>
                  {ownDraft?.role ? `你的身份是${roleNames[ownDraft.role]}。` : ''}
                  {ownDraft?.selected ? `${selectedName ?? '服务器随机武将'}已由服务器记录。` : isOwnTurn ? '候选仅在当前账号中可见，提交后不可更改。' : '轮到你时才可提交武将。'}
                </p>
              </div>
            </div>

            {!ownDraft?.selected && isOwnTurn && room.draft.stage === 'selecting_generals' ? (
              <div className="general-option-grid">
                {room.draft.candidates.map((generalId, index) => {
                  const details = room.draft?.candidateDetails?.find((candidate) => candidate.id === generalId);
                  return (
                    <article className="general-option" key={generalId}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div className="general-option__content">
                        <div className="general-option__heading">
                          <strong>{details?.name ?? generalNames[generalId]}</strong>
                          <small>{details ? `${draftFactionNames[details.faction]}势力 · ${details.maxHp} 点体力` : generalId.startsWith('shen_') ? '神武将 · 后续选择势力' : '候选武将'}</small>
                        </div>
                        <div className="general-option__skills">
                          {details?.skills.map((skill) => (
                            <p key={skill.id}><b>{skill.name}</b>{skill.description}</p>
                          )) ?? <p>技能说明正在同步，请稍候。</p>}
                        </div>
                      </div>
                      <Button
                        disabled={!connected || busy === 'draft'}
                        loading={busy === 'draft'}
                        onClick={() => void chooseGeneral(generalId)}
                      >
                        选择
                      </Button>
                    </article>
                  );
                })}
              </div>
            ) : ownDraft?.needsFaction && isOwnTurn ? (
              <div className="faction-options" aria-label="神武将势力">
                {(Object.keys(factionNames) as PlayableFaction[]).map((faction) => (
                  <Button
                    key={faction}
                    size="large"
                    disabled={!connected}
                    loading={busy === 'draft'}
                    onClick={() => void chooseGodFaction(faction)}
                  >
                    {factionNames[faction]}势力
                  </Button>
                ))}
              </div>
            ) : (
              <div className="draft-waiting" role="status">
                <strong>{selectedName ?? '选择已完成'}</strong>
                <p>{room.draft.stage === 'complete' ? '正在创建权威游戏状态……' : `等待 ${waitingFor} 完成选择。`}</p>
              </div>
            )}
          </section>

          <aside className="paper-card draft-progress" aria-label="成员选择进度">
            <div className="draft-progress__heading">
              <strong>成员进度</strong>
              <small>实时更新</small>
            </div>
            <ol>
              {room.draft.players.map((player, index) => {
                const member = room.members.find((candidate) => candidate.userId === player.playerId);
                return (
                  <li key={player.playerId}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{member?.displayName ?? `成员 ${index + 1}`}{player.role ? ` · ${roleNames[player.role]}` : ''}</strong>
                      <small>{player.playerId === user.id && player.generalId ? generalNames[player.generalId] : player.needsFaction ? '待选择势力' : player.selected ? '已确认' : player.playerId === room.draft?.currentPlayerId ? '正在选择' : '等待顺序'}</small>
                    </div>
                    <Tag color={player.selected && !player.needsFaction ? 'green' : player.playerId === room.draft?.currentPlayerId ? 'blue' : 'default'}>
                      {player.selected && !player.needsFaction ? '完成' : player.playerId === room.draft?.currentPlayerId ? '进行中' : '等待'}
                    </Tag>
                  </li>
                );
              })}
            </ol>
            <Popconfirm title="确定离开房间？" onConfirm={() => void leave()}>
              <Button danger block loading={busy === 'leave'}>离开房间</Button>
            </Popconfirm>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="page room-page">
      <section className="room-heading paper-card">
        <div>
          <span className="section-kicker">
            {registration.kicker}
          </span>
          <h1>{room.name}</h1>
          <button className="room-id" type="button" onClick={() => void copyRoomId()} title="复制房间号">
            房间号 {room.id} · 点击复制
          </button>
        </div>
        <div className="room-heading__status">
          {room.gameType === 'sanguosha' && (
            <Tag color={room.botMode === 'llm' && room.llmBot.available ? 'purple' : 'default'}>
              {room.botMode === 'llm'
                ? room.llmBot.available
                  ? '大模型全程决策'
                  : '大模型未配置 · 规则回退'
                : '规则机器人'}
            </Tag>
          )}
          <Tag color="green">等待开始</Tag>
          <span>{room.playerCount} / {room.maxPlayers} 人</span>
        </div>
      </section>

      {!connected && (
        <Alert className="connection-alert" type="warning" showIcon message="实时连接暂时中断，恢复前无法准备或开始游戏。" />
      )}

      {room.gameType === 'gouji' ? (
        <section className="room-rule-summary" aria-label="够级房间规则">
          <div><span>玩法</span><strong>山东够级 3V3</strong></div>
          <div><span>牌堆</span><strong>196 张</strong></div>
          <div><span>座位</span><strong>甲乙联邦交错</strong></div>
          <div><span>核心规则</span><strong>憋 3 / 开点 / 烧牌</strong></div>
          <div><span>机器人</span><strong>{botIntelligence} · {GOUJI_BOT_INTELLIGENCE_NAMES[botIntelligence]}</strong></div>
        </section>
      ) : room.gameType === 'doudizhu' ? (
        <section className="room-rule-summary" aria-label="斗地主房间规则">
          <div><span>玩法</span><strong>经典斗地主</strong></div>
          <div><span>牌堆</span><strong>54 张</strong></div>
          <div><span>座位</span><strong>固定 3 人</strong></div>
          <div><span>核心规则</span><strong>叫分 / 炸弹 / 春天</strong></div>
          <div><span>机器人</span><strong>{botIntelligence} · {DOUDIZHU_BOT_INTELLIGENCE_NAMES[botIntelligence]}</strong></div>
          <div>
            <span>决策引擎</span>
            <strong>
              {room.botMode === 'llm'
                ? room.llmBot.available
                  ? `大模型全程 · ${room.llmBot.usage.calls} 次 / ${room.llmBot.usage.promptTokens + room.llmBot.usage.completionTokens} Token`
                  : '大模型未配置 · 规则回退'
                : '规则机器人 · 零 Token'}
            </strong>
          </div>
        </section>
      ) : isSplendorGameType(room.gameType) ? (
        <section className={`room-rule-summary room-rule-summary--${room.gameType}`} aria-label={`${registration.label}房间规则`}>
          {registration.roomRuleSummary?.map((item) => (
            <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
          ))}
          <div><span>机器人</span><strong>{botIntelligence} · {SPLENDOR_BOT_INTELLIGENCE_NAMES[botIntelligence]} / 零 Token</strong></div>
        </section>
      ) : room.gameType === 'digit_bomb' ? (
        <section className="room-rule-summary room-rule-summary--digit_bomb" aria-label="数字炸弹房间规则">
          <div><span>玩法</span><strong>数字炸弹</strong></div>
          <div><span>座位</span><strong>固定 2 人</strong></div>
          <div><span>密码</span><strong>{room.digitBombDigits ?? 4} 位 / 可重复 / 可 0 开头</strong></div>
          <div><span>赛制</span><strong>多局积分 / 双方投票结算</strong></div>
          <div><span>机器人</span><strong>{botIntelligence} · {DIGIT_BOMB_BOT_INTELLIGENCE_NAMES[botIntelligence]} / 零 Token</strong></div>
        </section>
      ) : room.gameType === 'number_connect' ? (
        <section className="room-rule-summary room-rule-summary--number_connect" aria-label="数字连连看房间规则">
          {registration.roomRuleSummary?.map((item) => (
            <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
          ))}
          <div><span>机器人</span><strong>{botIntelligence} · {NUMBER_CONNECT_BOT_INTELLIGENCE_NAMES[botIntelligence]} / 零 Token</strong></div>
        </section>
      ) : null}

      <section className="seat-section">
        <div className="section-title-row">
          <div>
            <h2>成员列表</h2>
            <p>
              {registration.waitingCopy}
            </p>
          </div>
          <span className="ready-summary">
            {room.members.filter((member) => member.ready).length} / {room.members.length} 已就绪
          </span>
        </div>
        <div className="seat-grid">
          {seats.map(({ seat, member }) => (
            <article
              key={seat}
              className={member ? `seat-card${member.userId === user.id ? ' seat-card--self' : ''}` : 'seat-card seat-card--empty'}
            >
              <span className="seat-number">{seat + 1}</span>
              {member ? (
                <>
                  <div className="player-monogram" aria-hidden="true">{member.displayName.slice(0, 1)}</div>
                  <div className="seat-card__identity">
                    <h3>{member.displayName}</h3>
                    <p>{member.isBot && member.botTitle ? member.botTitle : `@${member.username || 'player'}`}</p>
                  </div>
                  <div className="seat-card__tags">
                    {member.isHost && <Tag color="gold">房主</Tag>}
                    {member.isBot && <Tag color="blue">机器人</Tag>}
                    <Tag color={member.ready ? 'green' : 'default'}>
                      {member.ready ? '已准备' : '未准备'}
                    </Tag>
                    {!member.online && <Tag>离线</Tag>}
                    {isHost && member.isBot && (
                      <Button size="small" danger onClick={() => void onRemoveBot(member.userId)}>移除</Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-seat">
                  <span>空</span>
                  <p>等待玩家加入</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="paper-card room-actions">
        <div>
          <h2>{self?.ready ? '你已准备就绪' : '准备好了吗？'}</h2>
          <p>
            {isHost && startBlockReason
              ? `${startBlockReason}。`
              : isHost && allReady && allOnline
                ? '所有玩家已准备，可以开始。'
                : self?.ready
                  ? '请等待房主开始游戏。'
                  : '准备后仍可在开局前取消。'}
          </p>
        </div>
        <div className="room-actions__buttons">
          <Button
            type={self?.ready ? 'default' : 'primary'}
            size="large"
            disabled={!connected}
            loading={busy === 'ready'}
            onClick={() => void ready()}
          >
            {self?.ready ? '取消准备' : '准备'}
          </Button>
          {isHost && (
            <Tooltip title={startBlockReason}>
              <Button
                className="primary-ink-button"
                type="primary"
                size="large"
                disabled={!canStart}
                loading={busy === 'start'}
                onClick={() => void start()}
              >
                开始游戏
              </Button>
            </Tooltip>
          )}
          {isHost && room.playerCount < room.maxPlayers && (
            <Button size="large" disabled={!connected} onClick={() => void onAddBot()}>添加机器人</Button>
          )}
          <Popconfirm title="确定离开房间？" description={isHost ? '房主离开后，房主身份将移交或房间关闭。' : undefined} onConfirm={() => void leave()}>
            <Button danger size="large" loading={busy === 'leave'}>离开房间</Button>
          </Popconfirm>
        </div>
      </section>
    </main>
  );
}
