import { Alert, Button, Divider, Empty, Modal, Popconfirm, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activeSkillDescriptions,
  canSubmitSkillUse,
  canSubmitCardPlay,
  cardPlayButtonLabel,
  cardRequiresTarget,
  createUseSkillAction,
  generalSkillNames,
  isCardAllowedByPrompt,
  isCardResponsePrompt,
  responseCardName,
  selectableResponseSkills,
  surrenderCopy,
} from '../interactionRules';
import type {
  ActiveGeneralSkillId,
  GameAction,
  GameCard,
  GameLogEntry,
  GamePlayerView,
  GameView,
  PlayableSkillHint,
  SkillChoiceId,
} from '../types';

interface GameBoardProps {
  game: GameView;
  connected: boolean;
  onAction: (action: GameAction) => Promise<void>;
  onExit: () => Promise<void>;
}

const phaseNames: Record<string, string> = {
  prepare: '准备阶段',
  judge: '判定阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  respond: '响应阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
  waiting: '等待响应',
};

const suitSymbols: Record<GameCard['suit'], string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
  none: '·',
};

function isRedSuit(suit: GameCard['suit']) {
  return suit === 'heart' || suit === 'diamond';
}

function categoryName(card: GameCard): string {
  if (card.category === 'basic') return '基本牌';
  if (card.category === 'equipment') return '装备牌';
  if (card.category === 'trick') return '锦囊牌';
  return '卡牌';
}

function cardStamp(card: GameCard): string {
  if (card.kind === 'fire_slash') return '火';
  if (card.kind === 'thunder_slash') return '雷';
  if (card.category === 'trick') return '谋';
  return '令';
}

function skillName(skillId: string): string {
  return generalSkillNames[skillId] ?? skillId;
}

function skillDescription(skillId: string): string {
  return activeSkillDescriptions[skillId] ?? '按当前提示选择费用与目标，提交后由服务器校验并结算。';
}

function GameCardTile({
  card,
  selected,
  disabled,
  onClick,
}: {
  card: GameCard;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const red = isRedSuit(card.suit);
  return (
    <button
      type="button"
      className={`game-card${selected ? ' game-card--selected' : ''}${disabled ? ' game-card--disabled' : ''}`}
      onClick={() => {
        if (!disabled) onClick();
      }}
      aria-disabled={disabled}
      aria-pressed={selected}
      aria-label={`${card.name}，${categoryName(card)}，${card.rank}${suitSymbols[card.suit]}。${card.description ?? ''}`}
      data-card-kind={card.kind}
    >
      <span className={red ? 'game-card__corner game-card__corner--red' : 'game-card__corner'}>
        <b>{card.rank}</b>{suitSymbols[card.suit]}
      </span>
      <strong>{card.name}</strong>
      <small>{categoryName(card)}</small>
      <span className="game-card__stamp">{cardStamp(card)}</span>
    </button>
  );
}

function PlayerPanel({
  player,
  selectable,
  selected,
  onSelect,
}: {
  player: GamePlayerView;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const details = (
    <div className="player-detail">
      <strong>{player.general ?? '未知武将'}</strong>
      <section>
        <b>武将技能</b>
        {player.effectiveSkills?.length
          ? player.effectiveSkills.map((skill) => (
              <p key={skill.id}><span>{skill.name}</span>{skill.description}</p>
            ))
          : <p>当前没有生效中的武将技能。</p>}
      </section>
      <section>
        <b>当前装备</b>
        {player.equipment?.length
          ? player.equipment.map((item) => (
              <p key={`${item.slot}-${item.id}`}><span>{item.name}</span>{item.description ?? '暂无效果说明。'}</p>
            ))
          : <p>当前没有装备。</p>}
      </section>
    </div>
  );

  return (
    <Tooltip title={details} placement="right" mouseEnterDelay={0.25} overlayClassName="player-detail-tooltip">
    <button
      type="button"
      className={`battle-player${player.isSelf ? ' battle-player--self' : ''}${player.isCurrent ? ' battle-player--current' : ''}${!player.alive ? ' battle-player--dead' : ''}${selectable ? ' battle-player--selectable' : ''}${selected ? ' battle-player--selected' : ''}`}
      onClick={() => {
        if (selectable) onSelect();
      }}
      aria-disabled={!selectable}
      aria-pressed={selected}
      aria-label={`${player.general ?? '未知武将'}，${player.displayName}，席位 ${player.seat + 1}，体力 ${player.hp}/${player.maxHp}，手牌 ${player.handCount} 张，${player.online ? '在线' : '离线'}${selectable ? '，可选为目标' : ''}`}
    >
      <div className="battle-player__topline">
        <span>席 {player.seat + 1}</span>
        <span className={player.online ? 'online-dot' : 'online-dot online-dot--off'}>{player.online ? '在线' : '离线'}</span>
      </div>
      <div className="battle-player__name">
        <span className="general-mark">{(player.general ?? player.displayName).slice(0, 1)}</span>
        <span>
          <strong>{player.general ?? '未知武将'}</strong>
          <small>{player.displayName}</small>
        </span>
        {player.identity && <Tag color={player.identity === '主公' ? 'gold' : 'default'}>{player.identity}</Tag>}
      </div>
      <div className="health-row" aria-label={`体力 ${player.hp} / ${player.maxHp}`}>
        {Array.from({ length: player.maxHp }, (_, index) => (
          <span key={index} className={index < player.hp ? 'health-point health-point--full' : 'health-point'}>命</span>
        ))}
      </div>
      <div className="battle-player__meta">
        <span>手牌 <b>{player.handCount}</b></span>
        <span>{player.faction ?? '未知势力'}</span>
      </div>
      {player.equipment && player.equipment.length > 0 && (
        <div className="equipment-row">
          {player.equipment.map((item) => <span key={`${item.slot}-${item.name}`}>{item.name}</span>)}
        </div>
      )}
      {player.judgment && player.judgment.length > 0 && (
        <div className="equipment-row equipment-row--judgment">
          {player.judgment.map((item) => <span key={`${item.slot}-${item.name}`}>判 · {item.name}</span>)}
        </div>
      )}
      {player.publicPiles?.buqu && player.publicPiles.buqu.length > 0 && (
        <div className="equipment-row">
          {player.publicPiles.buqu.map((card) => <span key={card.id}>不屈 · {card.rank}{suitSymbols[card.suit]}</span>)}
        </div>
      )}
      {player.chained && <Tag color="volcano">连环</Tag>}
      {!player.faceUp && <Tag color="purple">背面</Tag>}
      {player.isCurrent && <span className="turn-ribbon">当前回合</span>}
      {!player.alive && <span className="dead-stamp">阵亡</span>}
    </button>
    </Tooltip>
  );
}

function BattleLog({ logs }: { logs: GameLogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  return (
    <aside className="battle-log paper-card" aria-label="实时战报">
      <div className="battle-log__heading">
        <div><span className="live-pulse" />实时战报</div>
        <small>{logs.length} 条</small>
      </div>
      <div className="battle-log__entries" aria-live="polite">
        {logs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="战报将在这里出现" />
        ) : logs.map((log) => (
          <div key={log.id} className={`log-entry log-entry--${log.tone ?? 'normal'}`}>
            <time>{log.at ? new Date(log.at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '·'}</time>
            <p>{log.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}

export function GameBoard({ game, connected, onAction, onExit }: GameBoardProps) {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [zhangBaMode, setZhangBaMode] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<ActiveGeneralSkillId>();
  const [standardTopIds, setStandardTopIds] = useState<string[]>([]);
  const [standardBottomIds, setStandardBottomIds] = useState<string[]>([]);
  const [standardAllocations, setStandardAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedCardIds([]);
    setSelectedTargetIds([]);
    setZhangBaMode(false);
    setSelectedSkillId(undefined);
    setStandardTopIds([]);
    setStandardBottomIds([]);
    setStandardAllocations({});
  }, [game.prompt?.id, game.phase, game.turnPlayerId]);

  const self = game.players.find((player) => player.isSelf || player.id === game.selfPlayerId);
  const currentPlayer = game.players.find((player) => player.id === game.turnPlayerId || player.isCurrent);
  const selectedCard = game.hand.find((card) => card.id === selectedCardIds[0]) ??
    self?.equipment?.find((card) => card.id === selectedCardIds[0]);
  const isDiscardPrompt = game.prompt?.kind === 'discard';
  const isArmorPrompt = game.prompt?.kind === 'activate-armor';
  const isZonePrompt = game.prompt?.kind === 'choose-zone-card';
  const isFireAttackRevealPrompt = game.prompt?.kind === 'fire-attack-reveal';
  const isFireAttackDiscardPrompt = game.prompt?.kind === 'fire-attack-discard';
  const isFireAttackPrompt = isFireAttackRevealPrompt || isFireAttackDiscardPrompt;
  const isAmazingGracePrompt = game.prompt?.kind === 'amazing-grace-selection';
  const isWeaponPrompt = game.prompt?.kind === 'weapon-action';
  const isSkillChoicePrompt = game.prompt?.kind === 'skill-choice';
  const isFanjianSuitPrompt = game.prompt?.kind === 'choose-fanjian-suit';
  const isLordDispatchPrompt = game.prompt?.kind === 'lord-dispatch';
  const isStandardPrompt = game.prompt?.kind === 'standard-skill';
  const isResponsePrompt = isCardResponsePrompt(game.prompt);
  const canUseCards = connected && (game.canAct || Boolean(game.prompt));
  const responseSkills: PlayableSkillHint[] = selectableResponseSkills(game.prompt?.skillResponses ?? []);
  const availableSkills = game.canAct ? (game.skills ?? []) : responseSkills;
  const selectedSkill = availableSkills.find((skill) => skill.skillId === selectedSkillId);
  const requiresTarget = selectedSkill
    ? selectedSkill.targetMode !== 'none' && selectedSkill.targetMode !== 'self'
    : selectedCard ? cardRequiresTarget(selectedCard) : false;

  const selectableTargetIds = useMemo(() => {
    if (selectedSkill) {
      if (selectedSkill.targetMode === 'ordered-two' && selectedTargetIds.length === 1) {
        return new Set(
          (selectedSkill.targetPairs ?? [])
            .filter(([first]) => first === selectedTargetIds[0])
            .map(([, second]) => second),
        );
      }
      const costCardId = selectedCardIds.length === 1 ? selectedCardIds[0] : undefined;
      return new Set(costCardId && selectedSkill.cardTargetIds?.[costCardId]
        ? selectedSkill.cardTargetIds[costCardId]
        : selectedSkill.targetIds);
    }
    if (zhangBaMode && game.zhangBaSlash) return new Set(game.zhangBaSlash.targetIds);
    if (game.prompt?.kind === 'standard-skill' && selectedCardIds.length === 1 && game.prompt.cardTargetIds?.[selectedCardIds[0]!]) {
      return new Set(game.prompt.cardTargetIds[selectedCardIds[0]!]!);
    }
    if (game.prompt?.allowedTargetIds) return new Set(game.prompt.allowedTargetIds);
    if (selectedCard && cardRequiresTarget(selectedCard)) {
      if (selectedCard.targetMode === 'ordered-two' && selectedTargetIds.length === 1) {
        return new Set(
          (selectedCard.allowedTargetPairs ?? [])
            .filter(([first]) => first === selectedTargetIds[0])
            .map(([, second]) => second),
        );
      }
      if (selectedCard?.allowedTargetIds) return new Set(selectedCard.allowedTargetIds);
      return new Set(game.players.filter((player) => player.alive && !player.isSelf).map((player) => player.id));
    }
    return new Set<string>();
  }, [game.players, game.prompt?.allowedTargetIds, game.zhangBaSlash, selectedCard, selectedCardIds, selectedSkill, selectedTargetIds, zhangBaMode]);

  const selectSkill = (skillId: ActiveGeneralSkillId) => {
    setSelectedSkillId((current) => current === skillId ? undefined : skillId);
    setSelectedCardIds([]);
    setSelectedTargetIds([]);
    setZhangBaMode(false);
  };

  const toggleCard = (card: GameCard) => {
    if (selectedSkill) {
      setSelectedCardIds((current) => {
        if (current.includes(card.id)) return current.filter((id) => id !== card.id);
        if (selectedSkill.maxCards === 1) return [card.id];
        return current.length < selectedSkill.maxCards ? [...current, card.id] : current;
      });
      setSelectedTargetIds([]);
      return;
    }
    if (isDiscardPrompt || isWeaponPrompt || isStandardPrompt || zhangBaMode || game.prompt?.zhangBaAllowedCardIds) {
      setSelectedCardIds((current) => {
        if (current.includes(card.id)) return current.filter((id) => id !== card.id);
        const max = zhangBaMode || game.prompt?.zhangBaAllowedCardIds ? 2 : game.prompt?.max ?? Number.POSITIVE_INFINITY;
        return current.length < max ? [...current, card.id] : current;
      });
      return;
    }
    setSelectedCardIds((current) => current[0] === card.id ? [] : [card.id]);
    setSelectedTargetIds([]);
  };

  const cardDisabled = (card: GameCard) => {
    if (!canUseCards) return true;
    if (selectedSkill) return !selectedSkill.cardIds.includes(card.id);
    if (zhangBaMode) return !game.zhangBaSlash?.allowedCardIds.includes(card.id);
    if (!isCardAllowedByPrompt(card, game.prompt)) return true;
    return false;
  };

  const send = async (action: GameAction) => {
    setSending(true);
    try {
      await onAction(action);
      setSelectedCardIds([]);
      setSelectedTargetIds([]);
      setSelectedSkillId(undefined);
    } finally {
      setSending(false);
    }
  };

  const exitGame = async () => {
    setExiting(true);
    try {
      await onExit();
    } catch {
      // App owns the user-facing error toast; keep the player in the game on failure.
    } finally {
      setExiting(false);
    }
  };

  const playCard = async () => {
    if (!selectedCard) return;
    if (selectedCard.targetMode === 'up-to-two' || selectedCard.targetMode === 'up-to-three' || selectedCard.targetMode === 'ordered-two') {
      await send({ type: 'play_card', playerId: game.selfPlayerId, cardId: selectedCard.id, targetIds: selectedTargetIds });
      return;
    }
    const targetId = cardRequiresTarget(selectedCard) ? selectedTargetIds[0] : undefined;
    await send({ type: 'play_card', playerId: game.selfPlayerId, cardId: selectedCard.id, targetId });
  };

  const respond = async () => {
    if (!selectedCard) return;
    await send({ type: 'respond', playerId: game.selfPlayerId, cardId: selectedCard.id });
  };

  const respondWithZhangBa = async () => {
    await send({ type: 'respond', playerId: game.selfPlayerId, cardIds: selectedCardIds });
  };

  const playZhangBaSlash = async () => {
    const targetId = selectedTargetIds[0];
    if (!targetId) return;
    await send({ type: 'use_zhang_ba_slash', playerId: game.selfPlayerId, cardIds: selectedCardIds, targetId });
  };

  const useSelectedSkill = async () => {
    if (!selectedSkill) return;
    if (!canSubmitSkillUse(selectedSkill, selectedCardIds, selectedTargetIds)) return;
    await send(createUseSkillAction(game.selfPlayerId, selectedSkill, selectedCardIds, selectedTargetIds));
  };

  const confirmDiscard = async () => {
    await send({ type: 'discard', playerId: game.selfPlayerId, cardIds: selectedCardIds });
  };

  const toggleTarget = (player: GamePlayerView) => {
    if (!selectableTargetIds.has(player.id)) return;
    setSelectedTargetIds((current) => {
      const targetMode = selectedSkill?.targetMode ?? selectedCard?.targetMode;
      if (isStandardPrompt && (game.prompt?.maxTargets ?? 1) > 1) {
        if (current.includes(player.id)) return current.filter((id) => id !== player.id);
        return current.length < (game.prompt?.maxTargets ?? 1) ? [...current, player.id] : current;
      }
      if (targetMode === 'up-to-two') {
        if (current.includes(player.id)) return current.filter((id) => id !== player.id);
        return current.length < 2 ? [...current, player.id] : current;
      }
      if (targetMode === 'up-to-three') {
        if (current.includes(player.id)) return current.filter((id) => id !== player.id);
        return current.length < 3 ? [...current, player.id] : current;
      }
      if (targetMode === 'ordered-two') {
        if (current.length === 0) return [player.id];
        if (current.length === 1) return current[0] === player.id ? [] : [...current, player.id];
        return [player.id];
      }
      return current.includes(player.id) ? [] : [player.id];
    });
  };

  const discardMin = game.prompt?.min ?? 0;
  const discardMax = game.prompt?.max ?? discardMin;
  const discardValid = selectedCardIds.length >= discardMin && selectedCardIds.length <= discardMax;
  const weaponSelectionValid = isWeaponPrompt && selectedCardIds.length >= discardMin && selectedCardIds.length <= discardMax;
  const physicalResponseSelected = selectedCardIds.length === 1 && Boolean(selectedCard) && (
    game.prompt?.responseKind !== 'slash' || ['slash', 'fire_slash', 'thunder_slash'].includes(selectedCard?.kind ?? '')
  );
  const zhangBaResponseValid = selectedCardIds.length === 2 && selectedCardIds.every((id) => game.prompt?.zhangBaAllowedCardIds?.includes(id));
  const zhangBaPlayValid = zhangBaMode && selectedCardIds.length === 2 && selectedTargetIds.length === 1;
  const playValid = canSubmitCardPlay(selectedCard, selectedTargetIds);
  const skillUseValid = canSubmitSkillUse(selectedSkill, selectedCardIds, selectedTargetIds);
  const lordDispatchCardValid = isLordDispatchPrompt && selectedCardIds.length === 1 &&
    Boolean(game.prompt?.allowedCardIds?.includes(selectedCardIds[0]!));
  const standardPrompt = isStandardPrompt ? game.prompt! : null;
  const standardViewedIds = standardPrompt?.cardChoices?.map((card) => card.id) ?? [];
  const standardReorderComplete = standardViewedIds.length > 0 &&
    standardTopIds.length + standardBottomIds.length === standardViewedIds.length &&
    new Set([...standardTopIds, ...standardBottomIds]).size === standardViewedIds.length;
  const standardAllocationComplete = standardViewedIds.length > 0 &&
    standardViewedIds.every((cardId) => Boolean(standardAllocations[cardId]));
  const waitingForOtherPlayer = game.status === 'playing' && !game.prompt && !game.canAct;

  const assignStandardReorder = (cardId: string, destination: 'top' | 'bottom') => {
    setStandardTopIds((current) => destination === 'top'
      ? [...current.filter((id) => id !== cardId), cardId]
      : current.filter((id) => id !== cardId));
    setStandardBottomIds((current) => destination === 'bottom'
      ? [...current.filter((id) => id !== cardId), cardId]
      : current.filter((id) => id !== cardId));
  };

  const sendStandard = (activate: boolean, extra: Partial<Extract<GameAction, { type: 'resolve_standard_skill' }>> = {}) => {
    if (!standardPrompt) return;
    void send({
      type: 'resolve_standard_skill',
      playerId: game.selfPlayerId,
      promptId: standardPrompt.id,
      activate,
      ...extra,
    });
  };

  return (
    <main className="game-page">
      <section className="game-statusbar">
        <div>
          <span className="game-statusbar__round">第 {game.round} 轮</span>
          <strong>{phaseNames[game.phase] ?? game.phase}</strong>
          <span>{currentPlayer ? `${currentPlayer.displayName} 的回合` : '等待服务器推进'}</span>
        </div>
        <div>
          <Tag color={connected ? 'green' : 'orange'}>{connected ? '实时同步' : '重连中'}</Tag>
          {self?.identity && <Tag color="gold">你的身份：{self.identity}</Tag>}
          {game.status === 'playing' && (
            <Popconfirm
              title={surrenderCopy.title}
              description={surrenderCopy.description}
              okText="确认投降"
              cancelText="继续对局"
              okButtonProps={{ danger: true }}
              onConfirm={() => void exitGame()}
            >
              <Button className="game-surrender-button" danger size="small" loading={exiting}>
                {surrenderCopy.label}
              </Button>
            </Popconfirm>
          )}
        </div>
      </section>

      {!connected && <Alert banner type="warning" message="连接中断：当前操作已锁定，状态会在重连后自动同步。" />}
      {connected && waitingForOtherPlayer && (
        <Alert className="other-player-notice" banner showIcon type="info" message="其他玩家正在操作，请稍候……" />
      )}

      <div className="game-layout">
        <section className="battlefield">
          {game.prompt && (
            <div className="action-prompt" role="status">
              <span className="action-prompt__mark">令</span>
              <div><strong>{isFanjianSuitPrompt ? '请声明反间花色' : isSkillChoicePrompt || isStandardPrompt ? '请处理武将技能' : isLordDispatchPrompt ? '主公技请求' : isDiscardPrompt ? '请完成弃牌' : isWeaponPrompt ? '是否发动武器' : isArmorPrompt ? '是否发动防具' : isZonePrompt ? '请选择目标区域牌' : isAmazingGracePrompt ? '请选择五谷丰登牌' : isFireAttackPrompt ? '请完成火攻结算' : '需要你的响应'}</strong><p>{game.prompt.message}</p></div>
              {(isDiscardPrompt || isWeaponPrompt && discardMax > 0) && <Tag color="volcano">已选 {selectedCardIds.length} / {discardMin === discardMax ? discardMin : `${discardMin}-${discardMax}`}</Tag>}
            </div>
          )}

          <div
            className="players-grid"
            role="group"
            aria-label={selectableTargetIds.size > 0 ? '请选择目标角色' : '场上角色'}
          >
            {game.players.map((player) => (
              <PlayerPanel
                key={player.id}
                player={player}
                selectable={connected && selectableTargetIds.has(player.id)}
                selected={selectedTargetIds.includes(player.id)}
                onSelect={() => toggleTarget(player)}
              />
            ))}
          </div>

          <section className="hand-zone paper-card" aria-label="你的手牌">
            <div className="hand-zone__heading">
              <div>
                <span className="section-kicker">你的手牌</span>
                <h2>{game.hand.length} 张</h2>
              </div>
              <p>{selectedSkill ? skillDescription(selectedSkill.skillId) : selectedCard?.targetMode === 'ordered-two' ? '先选择持有武器者，再选择其攻击范围内的目标。' : selectedCard?.targetMode === 'up-to-two' ? '可选择一至两名角色；不选目标即重铸摸一张牌。' : selectedCard?.targetMode === 'up-to-three' ? '方天画戟：这张杀可指定一至三名角色。' : requiresTarget ? '请选择一名高亮目标，再确认出牌。' : isDiscardPrompt ? `请选择 ${discardMin === discardMax ? discardMin : `${discardMin}–${discardMax}`} 张牌弃置。` : '点击卡牌查看牌面说明和可用操作。'}</p>
            </div>
            {availableSkills.length > 0 && (
              <section className="general-skill-zone" aria-label="武将技能">
                <div className="general-skill-zone__heading">
                  <div>
                    <span className="section-kicker">武将技能</span>
                    <strong>{isResponsePrompt ? '可用于本次响应' : '可在出牌阶段发动'}</strong>
                  </div>
                  <div className="general-skill-zone__buttons">
                    {availableSkills.map((skill) => (
                      <Button
                        key={skill.skillId}
                        type={selectedSkillId === skill.skillId ? 'primary' : 'default'}
                        onClick={() => selectSkill(skill.skillId)}
                      >
                        {skillName(skill.skillId)}
                      </Button>
                    ))}
                  </div>
                </div>
                {selectedSkill && (
                  <div className="general-skill-zone__selection" role="status">
                    <p>
                      {skillDescription(selectedSkill.skillId)}
                      {selectedSkill.minCards > 0 && ` 请从下方手牌或自己的可用装备中选择${selectedSkill.minCards === selectedSkill.maxCards
                        ? ` ${selectedSkill.minCards} 张`
                        : ` ${selectedSkill.minCards} 至 ${selectedSkill.maxCards} 张`}技能成本。`}
                      {selectedSkill.targetMode === 'ordered-two'
                        ? ' 然后依次选择两名高亮目标；顺序决定谁向谁发起决斗。'
                        : requiresTarget && ' 然后选择一名高亮目标。'}
                    </p>
                    {selectedSkill.maxCards > 0 && (
                      <Tag color={selectedCardIds.length >= selectedSkill.minCards ? 'green' : 'volcano'}>
                        已选 {selectedCardIds.length} / {selectedSkill.minCards === selectedSkill.maxCards
                          ? selectedSkill.minCards
                          : `${selectedSkill.minCards}-${selectedSkill.maxCards}`} 张
                      </Tag>
                    )}
                    {selectedSkill.minCards > 0 && self?.equipment?.some((card) => selectedSkill.cardIds.includes(card.id)) && (
                      <div className="skill-equipment-costs" aria-label="可作为技能成本的装备">
                        <span>可用装备</span>
                        <div className="hand-cards">
                          {self.equipment.filter((card) => selectedSkill.cardIds.includes(card.id)).map((card) => (
                            <Tooltip key={`skill-cost-${card.id}`} title={`${card.slot} · ${skillDescription(selectedSkill.skillId)}`}>
                              <span>
                                <GameCardTile
                                  card={card}
                                  selected={selectedCardIds.includes(card.id)}
                                  disabled={!connected}
                                  onClick={() => toggleCard(card)}
                                />
                              </span>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {isStandardPrompt && game.prompt?.standardStage === 'guanxing_reorder' && game.prompt.cardChoices && (
              <section className="general-skill-zone" aria-label="观星重排">
                <div className="general-skill-zone__heading">
                  <div><span className="section-kicker">观星牌序</span><strong>点击顺序即未来牌序</strong></div>
                  <Tag color={standardReorderComplete ? 'green' : 'volcano'}>
                    已安排 {standardTopIds.length + standardBottomIds.length} / {standardViewedIds.length}
                  </Tag>
                </div>
                <div className="zone-choice-actions">
                  {game.prompt.cardChoices.map((card) => (
                    <div key={`guanxing-${card.id}`} className="paper-card">
                      <strong>{card.name}（{card.rank}{suitSymbols[card.suit]}）</strong>
                      <Button size="small" type={standardTopIds.includes(card.id) ? 'primary' : 'default'} onClick={() => assignStandardReorder(card.id, 'top')}>置于牌堆顶</Button>
                      <Button size="small" type={standardBottomIds.includes(card.id) ? 'primary' : 'default'} onClick={() => assignStandardReorder(card.id, 'bottom')}>置于牌堆底</Button>
                    </div>
                  ))}
                </div>
                <p>牌堆顶顺序：{standardTopIds.map((id) => game.prompt?.cardChoices?.find((card) => card.id === id)?.name ?? id).join(' → ') || '无'}；牌堆底顺序：{standardBottomIds.map((id) => game.prompt?.cardChoices?.find((card) => card.id === id)?.name ?? id).join(' → ') || '无'}。</p>
              </section>
            )}
            {isStandardPrompt && game.prompt?.standardStage === 'yiji_distribute' && game.prompt.cardChoices && (
              <section className="general-skill-zone" aria-label="遗计分配">
                <div className="general-skill-zone__heading">
                  <div><span className="section-kicker">遗计分配</span><strong>每张牌可交给任意存活角色</strong></div>
                </div>
                <div className="zone-choice-actions">
                  {game.prompt.cardChoices.map((card) => (
                    <label key={`yiji-${card.id}`} className="paper-card">
                      <strong>{card.name}（{card.rank}{suitSymbols[card.suit]}）</strong>
                      <select
                        value={standardAllocations[card.id] ?? ''}
                        onChange={(event) => setStandardAllocations((current) => ({ ...current, [card.id]: event.target.value }))}
                      >
                        <option value="">选择获得者</option>
                        {game.players.filter((player) => player.alive).map((player) => (
                          <option key={`${card.id}-${player.id}`} value={player.id}>{player.displayName}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
            )}
            {isStandardPrompt && game.prompt?.allowedCardIds && self?.equipment?.some((card) => game.prompt?.allowedCardIds?.includes(card.id)) && (
              <section className="general-skill-zone" aria-label="技能可用装备">
                <span className="section-kicker">可作为技能选择的装备</span>
                <div className="hand-cards">
                  {self.equipment.filter((card) => game.prompt?.allowedCardIds?.includes(card.id)).map((card) => (
                    <GameCardTile key={`standard-cost-${card.id}`} card={card} selected={selectedCardIds.includes(card.id)} disabled={!connected} onClick={() => toggleCard(card)} />
                  ))}
                </div>
              </section>
            )}
            {game.publicCards && game.publicCards.length > 0 && (
              <div className="public-card-pool" aria-label="当前亮出的牌">
                <span className="section-kicker">当前亮出的牌</span>
                <div className="hand-cards">
                  {game.publicCards.map((card) => (
                    <GameCardTile key={`public-${card.id}`} card={card} selected={false} disabled onClick={() => undefined} />
                  ))}
                </div>
              </div>
            )}
            <div className="hand-cards">
              {game.hand.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有手牌" />
              ) : game.hand.map((card) => (
                <Tooltip key={card.id} title={card.description} placement="top">
                  <span>
                    <GameCardTile
                      card={card}
                      selected={selectedCardIds.includes(card.id)}
                      disabled={cardDisabled(card)}
                      onClick={() => toggleCard(card)}
                    />
                  </span>
                </Tooltip>
              ))}
            </div>
            {selectedCard && !isDiscardPrompt && (
              <div className="card-inspector" role="status" aria-label={`${selectedCard.name}卡牌说明`}>
                <span className={isRedSuit(selectedCard.suit) ? 'card-inspector__face card-inspector__face--red' : 'card-inspector__face'}>
                  {selectedCard.rank}{suitSymbols[selectedCard.suit]}
                </span>
                <div>
                  <div className="card-inspector__title">
                    <strong>{selectedCard.name}</strong>
                    <Tag color={selectedCard.category === 'trick' ? 'purple' : 'default'}>{categoryName(selectedCard)}</Tag>
                  </div>
                  <p>{selectedCard.description ?? '暂无卡牌说明。'}</p>
                </div>
              </div>
            )}
            <Divider />
            <div className="game-actions">
              {isFanjianSuitPrompt ? (
                <div className="zone-choice-actions">
                  {game.prompt?.suitChoices?.map((choice) => (
                    <Button
                      key={choice.value}
                      type="primary"
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({
                        type: 'choose_fanjian_suit',
                        playerId: game.selfPlayerId,
                        suit: choice.value,
                        promptId: game.prompt!.id,
                      })}
                    >
                      声明 {choice.label}
                    </Button>
                  ))}
                </div>
              ) : isStandardPrompt && standardPrompt?.skillId ? (
                standardPrompt.standardStage === 'buqu_recovery' ? (
                  <div className="zone-choice-actions">
                    {standardPrompt.cardChoices?.map((card) => (
                      <Button key={card.id} type="primary" size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(true, { cardId: card.id })}>
                        移除 {card.rank}{suitSymbols[card.suit]}
                      </Button>
                    ))}
                  </div>
                ) : standardPrompt.standardStage === 'guanxing_reorder' ? (
                  <Button
                    type="primary"
                    size="large"
                    disabled={!connected || !standardReorderComplete}
                    loading={sending}
                    onClick={() => sendStandard(true, { topCardIds: standardTopIds, bottomCardIds: standardBottomIds })}
                  >
                    确认观星牌序
                  </Button>
                ) : standardPrompt.standardStage === 'yiji_distribute' ? (
                  <Button
                    type="primary"
                    size="large"
                    disabled={!connected || !standardAllocationComplete}
                    loading={sending}
                    onClick={() => sendStandard(true, {
                      allocations: standardViewedIds.map((cardId) => ({ cardId, targetId: standardAllocations[cardId]! })),
                    })}
                  >
                    确认遗计分配
                  </Button>
                ) : standardPrompt.standardStage === 'fankui_select' ? (
                  <div className="zone-choice-actions">
                    {standardPrompt.zoneChoices?.map((choice) => (
                      <Button key={`${choice.ownerId}-${choice.token}`} type="primary" size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(true, { tokens: [choice.token] })}>
                        获得 {choice.label}
                      </Button>
                    ))}
                  </div>
                ) : standardPrompt.standardStage === 'tuxi_select' ? (
                  <>
                    <Button
                      type="primary"
                      size="large"
                      disabled={!connected || selectedTargetIds.length < (standardPrompt.minTargets ?? 1) || selectedTargetIds.length > (standardPrompt.maxTargets ?? 2)}
                      loading={sending}
                      onClick={() => sendStandard(true, {
                        targetIds: selectedTargetIds,
                        tokens: selectedTargetIds.map((targetId) => standardPrompt.zoneChoices?.find((choice) => choice.ownerId === targetId)?.token ?? ''),
                      })}
                    >
                      发动突袭（已选 {selectedTargetIds.length} 名）
                    </Button>
                    <Button size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>正常摸牌</Button>
                  </>
                ) : standardPrompt.standardStage === 'ganglie_punish' ? (
                  <>
                    <Button type="primary" size="large" disabled={!connected || selectedCardIds.length !== 2} loading={sending} onClick={() => sendStandard(true, { cardIds: selectedCardIds })}>
                      弃置两张手牌
                    </Button>
                    <Button danger size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>不弃牌，受到 1 点伤害</Button>
                  </>
                ) : standardPrompt.standardStage === 'liuli_redirect' ? (
                  <>
                    <Button type="primary" size="large" disabled={!connected || selectedCardIds.length !== 1 || selectedTargetIds.length !== 1} loading={sending} onClick={() => sendStandard(true, { cardId: selectedCardIds[0], targetId: selectedTargetIds[0] })}>
                      弃牌并转移此杀
                    </Button>
                    <Button size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>不发动流离</Button>
                  </>
                ) : standardPrompt.standardStage === 'tianxiang_redirect' ? (
                  <>
                    <Button type="primary" size="large" disabled={!connected || selectedCardIds.length !== 1 || selectedTargetIds.length !== 1} loading={sending} onClick={() => sendStandard(true, { cardId: selectedCardIds[0], targetId: selectedTargetIds[0] })}>
                      弃牌并转移此伤害
                    </Button>
                    <Button size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>不发动天香</Button>
                  </>
                ) : standardPrompt.standardStage === 'judgment_retrial' ? (
                  <>
                    <Button type="primary" size="large" disabled={!connected || selectedCardIds.length !== 1} loading={sending} onClick={() => sendStandard(true, { cardId: selectedCardIds[0] })}>以所选手牌发动鬼才</Button>
                    <Button size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>不发动鬼才</Button>
                  </>
                ) : (
                  <>
                    <Button type="primary" size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(true)}>
                      {standardPrompt.standardStage === 'judgment_post' ? '发动天妒' : `发动「${skillName(standardPrompt.skillId)}」`}
                    </Button>
                    {standardPrompt.optional !== false && (
                      <Button size="large" disabled={!connected} loading={sending} onClick={() => sendStandard(false)}>不发动</Button>
                    )}
                  </>
                )
              ) : isSkillChoicePrompt && game.prompt?.skillId ? (
                <>
                  <Button
                    type="primary"
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({
                      type: 'resolve_skill',
                      playerId: game.selfPlayerId,
                      skillId: game.prompt!.skillId! as SkillChoiceId,
                      activate: true,
                      promptId: game.prompt!.id,
                    })}
                  >
                    发动「{skillName(game.prompt.skillId)}」
                  </Button>
                  <Button
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({
                      type: 'resolve_skill',
                      playerId: game.selfPlayerId,
                      skillId: game.prompt!.skillId! as SkillChoiceId,
                      activate: false,
                      promptId: game.prompt!.id,
                    })}
                  >
                    不发动
                  </Button>
                </>
              ) : isAmazingGracePrompt ? (
                <div className="zone-choice-actions">
                  {game.prompt?.cardChoices?.map((card) => (
                    <Button
                      key={card.id}
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({ type: 'choose_amazing_grace_card', playerId: game.selfPlayerId, cardId: card.id })}
                    >
                      获得 {card.name}（{card.rank}{suitSymbols[card.suit]}）
                    </Button>
                  ))}
                </div>
              ) : isFireAttackPrompt ? (
                <>
                  <Button
                    type="primary"
                    size="large"
                    disabled={!selectedCard || !connected}
                    loading={sending}
                    onClick={() => selectedCard && void send({ type: 'choose_hand_card', playerId: game.selfPlayerId, cardId: selectedCard.id })}
                  >
                    {isFireAttackRevealPrompt ? '展示所选手牌' : '弃置所选同花色手牌'}
                  </Button>
                  {isFireAttackDiscardPrompt && (
                    <Button
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({ type: 'choose_hand_card', playerId: game.selfPlayerId, cardId: null })}
                    >
                      放弃造成伤害
                    </Button>
                  )}
                </>
              ) : isZonePrompt ? (
                <div className="zone-choice-actions">
                  {game.prompt?.zoneChoices?.map((choice) => (
                    <Button
                      key={choice.token}
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({ type: 'choose_zone_card', playerId: game.selfPlayerId, token: choice.token })}
                    >
                      {choice.label}
                    </Button>
                  ))}
                </div>
              ) : isWeaponPrompt ? (
                game.prompt?.zoneChoices?.length ? (
                  <div className="zone-choice-actions">
                    {game.prompt.zoneChoices.map((choice) => (
                      <Button
                        key={choice.token}
                        type="primary"
                        size="large"
                        disabled={!connected}
                        loading={sending}
                        onClick={() => void send({ type: 'resolve_weapon', playerId: game.selfPlayerId, promptId: game.prompt?.promptId, activate: true, tokens: [choice.token] })}
                      >
                        选择 {choice.label}
                      </Button>
                    ))}
                    {game.prompt.optional !== false && (
                      <Button
                        size="large"
                        disabled={!connected}
                        loading={sending}
                        onClick={() => void send({ type: 'resolve_weapon', playerId: game.selfPlayerId, promptId: game.prompt?.promptId, activate: false })}
                      >
                        不发动／结束选择
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <Button
                      type="primary"
                      size="large"
                      disabled={!weaponSelectionValid || !connected}
                      loading={sending}
                      onClick={() => void send({ type: 'resolve_weapon', playerId: game.selfPlayerId, promptId: game.prompt?.promptId, activate: true, cardIds: selectedCardIds })}
                    >
                      发动武器效果
                    </Button>
                    <Button
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({ type: 'resolve_weapon', playerId: game.selfPlayerId, promptId: game.prompt?.promptId, activate: false })}
                    >
                      不发动
                    </Button>
                  </>
                )
              ) : isArmorPrompt ? (
                <>
                  <Button
                    type="primary"
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({ type: 'activate_armor', playerId: game.selfPlayerId, activate: true })}
                  >
                    发动「八卦阵」
                  </Button>
                  <Button
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({ type: 'activate_armor', playerId: game.selfPlayerId, activate: false })}
                  >
                    不发动，改为出「闪」
                  </Button>
                </>
              ) : isLordDispatchPrompt ? (
                <>
                  <Button
                    type="primary"
                    size="large"
                    disabled={!lordDispatchCardValid || !connected}
                    loading={sending}
                    onClick={() => void send({
                      type: 'resolve_lord_dispatch',
                      playerId: game.selfPlayerId,
                      promptId: game.prompt!.id,
                      cardId: selectedCardIds[0]!,
                    })}
                  >
                    为「{game.prompt?.lordSkillId === 'hujia' ? '护驾' : '激将'}」打出所选牌
                  </Button>
                  <Button
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({
                      type: 'resolve_lord_dispatch',
                      playerId: game.selfPlayerId,
                      promptId: game.prompt!.id,
                      cardId: null,
                    })}
                  >
                    不响应
                  </Button>
                </>
              ) : isResponsePrompt ? (
                <>
                  <Button
                    type="primary"
                    size="large"
                    disabled={Boolean(selectedSkill) || !physicalResponseSelected || !connected}
                    loading={sending}
                    onClick={() => void respond()}
                  >
                    打出「{responseCardName(game.prompt)}」
                  </Button>
                  {selectedSkill && (
                    <Button
                      className="primary-ink-button"
                      type="primary"
                      size="large"
                      disabled={!skillUseValid || !connected}
                      loading={sending}
                      onClick={() => void useSelectedSkill()}
                    >
                      发动「{skillName(selectedSkill.skillId)}」响应
                    </Button>
                  )}
                  {game.prompt?.zhangBaAllowedCardIds && game.prompt.zhangBaAllowedCardIds.length >= 2 && (
                    <Button
                      type="primary"
                      size="large"
                      disabled={Boolean(selectedSkill) || !zhangBaResponseValid || !connected}
                      loading={sending}
                      onClick={() => void respondWithZhangBa()}
                    >
                      丈八蛇矛：两牌当杀
                    </Button>
                  )}
                  {game.prompt?.lordSkills?.map((skillId) => (
                    <Button
                      key={skillId}
                      className="primary-ink-button"
                      type="primary"
                      size="large"
                      disabled={!connected}
                      loading={sending}
                      onClick={() => void send({
                        type: 'invoke_lord_skill',
                        playerId: game.selfPlayerId,
                        skillId,
                      })}
                    >
                      发动「{skillId === 'hujia' ? '护驾' : '激将'}」请求协助
                    </Button>
                  ))}
                  <Button
                    size="large"
                    disabled={!connected}
                    loading={sending}
                    onClick={() => void send({ type: 'respond', playerId: game.selfPlayerId, cardId: null })}
                  >
                    跳过响应
                  </Button>
                </>
              ) : isDiscardPrompt ? (
                <Button
                  type="primary"
                  size="large"
                  disabled={!discardValid || !connected}
                  loading={sending}
                  onClick={() => void confirmDiscard()}
                >
                  确认弃牌（{selectedCardIds.length}）
                </Button>
              ) : (
                selectedSkill ? (
                  <>
                    {selectedSkill.skillId === 'kurou' ? (
                      <Popconfirm
                        title="确认发动「苦肉」？"
                        description="你将先失去 1 点体力，然后摸两张牌；体力降至 0 时会进入濒死结算。"
                        okText="确认发动"
                        cancelText="取消"
                        onConfirm={() => void useSelectedSkill()}
                      >
                        <Button
                          className="primary-ink-button"
                          type="primary"
                          size="large"
                          disabled={!skillUseValid || !game.canAct || !connected}
                          loading={sending}
                        >
                          确认发动「苦肉」
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Button
                        className="primary-ink-button"
                        type="primary"
                        size="large"
                        disabled={!skillUseValid || !game.canAct || !connected}
                        loading={sending}
                        onClick={() => void useSelectedSkill()}
                      >
                        发动「{skillName(selectedSkill.skillId)}」
                      </Button>
                    )}
                    <Button size="large" onClick={() => selectSkill(selectedSkill.skillId)}>取消技能</Button>
                  </>
                ) : zhangBaMode ? (
                  <>
                    <Button
                      className="primary-ink-button"
                      type="primary"
                      size="large"
                      disabled={!zhangBaPlayValid || !connected}
                      loading={sending}
                      onClick={() => void playZhangBaSlash()}
                    >
                      将所选两牌当杀使用
                    </Button>
                    <Button size="large" onClick={() => { setZhangBaMode(false); setSelectedCardIds([]); setSelectedTargetIds([]); }}>
                      取消丈八蛇矛
                    </Button>
                  </>
                ) : <>
                  <Button
                    className="primary-ink-button"
                    type="primary"
                    size="large"
                    disabled={!playValid || !game.canAct || !connected}
                    loading={sending}
                    onClick={() => void playCard()}
                  >
                    {cardPlayButtonLabel(selectedCard)}
                  </Button>
                  {game.zhangBaSlash && game.zhangBaSlash.targetIds.length > 0 && (
                    <Button
                      size="large"
                      disabled={!game.canAct || !connected}
                      onClick={() => { setZhangBaMode(true); setSelectedCardIds([]); setSelectedTargetIds([]); }}
                    >
                      丈八蛇矛：两牌当杀
                    </Button>
                  )}
                  <Button
                    size="large"
                    disabled={!game.canAct || !connected}
                    loading={sending}
                    onClick={() => void send({ type: 'end_play', playerId: game.selfPlayerId })}
                  >
                    结束出牌
                  </Button>
                </>
              )}
              {!selectedCard && !selectedSkill && !isFanjianSuitPrompt && !isSkillChoicePrompt && !isDiscardPrompt && !isArmorPrompt && !isZonePrompt && !isAmazingGracePrompt && <span className="action-hint">先选择一张可用手牌</span>}
            </div>
          </section>
        </section>

        <BattleLog logs={game.logs ?? []} />
      </div>

      <Modal
        className="game-result-modal"
        open={game.status === 'finished'}
        centered
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={null}
        width={440}
        title={null}
      >
          <div className="game-result__card">
            <span className="game-result__seal">终</span>
            <span className="section-kicker">对局结束</span>
            <h2>{game.winner ? `${game.winner} 获胜` : '胜负已定'}</h2>
            <p>完整过程已保留在右侧战报中。</p>
            <Button className="primary-ink-button" type="primary" size="large" loading={exiting} onClick={() => void exitGame()}>
              返回房间大厅
            </Button>
          </div>
      </Modal>
    </main>
  );
}
