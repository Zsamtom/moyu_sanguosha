import type { Pool } from "pg";
import {
  DEFAULT_COMPLETE_RULE_CONFIG,
  addMark,
  applyAction,
  beginDirectDeath,
  chooseGeneral,
  chooseGodFaction,
  createDeathFrame,
  createDoudizhuGame,
  createDigitBombGame,
  createDyingFrame,
  createGame,
  createGameFromDraft,
  createGeneralDraft,
  createNumberConnectGame,
  createSplendorGame,
  forfeitPlayer,
  getCardDefinition,
  getGeneralDraftView,
  grantSkill,
  pushDeathFrame,
  pushDyingFrame,
  turnOverGamePlayer,
  type Card,
  type CardKind,
} from "@sanguosha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  loadRoomSnapshot,
  loadRoomSnapshotEntries,
  quarantineRoomSnapshotEntry,
  RoomSnapshotWriter,
  selectRestorableRoomSnapshotEntries,
} from "./room-persistence.js";
import {
  DEFAULT_SERVER_ROOM_RULE_CONFIG,
  RoomService,
  type RoomServiceSnapshot,
} from "./rooms.js";

function poolWithQuery(query: Pool["query"]): Pool {
  return { query } as unknown as Pool;
}

function waitingRoom(
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId = "11111111-1111-4111-8111-111111111111",
) {
  return {
    id,
    name: "健康房间",
    gameType: "sanguosha" as const,
    ownerId,
    status: "waiting" as const,
    maxPlayers: 2,
    botIntelligence: 3 as const,
    botMode: "rules" as const,
    createdAt: new Date().toISOString(),
    ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
    players: [{
      id: ownerId,
      username: `owner-${id.slice(0, 4)}`,
      displayName: "健康房主",
      ready: false,
      connected: false,
      seat: 0,
      isBot: false,
      departed: false,
    }],
  };
}

function standardCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

describe("room snapshot persistence", () => {
  it("round-trips private Number Connect boards and rejects tampering", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const game = createNumberConnectGame({
      players: playerIds.map((id, seat) => ({ id, name: `连线玩家${seat + 1}` })),
      seed: "42".repeat(32),
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "持久化数字连连看",
        gameType: "number_connect",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        botIntelligence: 3,
        botMode: "rules",
        ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
        players: playerIds.map((id, seat) => ({
          id,
          username: `connect-${seat}`,
          displayName: `连线玩家${seat + 1}`,
          ready: true,
          connected: false,
          seat,
          isBot: false,
        })),
        game,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    expect(await load(JSON.parse(JSON.stringify(snapshot)))).toMatchObject({
      kind: "valid",
      snapshot: {
        rooms: [{
          gameType: "number_connect",
          game: { kind: "number_connect", version: 1 },
        }],
      },
    });

    const duplicateNumber = structuredClone(snapshot);
    const tamperedGame = duplicateNumber.rooms[0]!.game;
    if (!tamperedGame || !("kind" in tamperedGame) || tamperedGame.kind !== "number_connect") {
      throw new Error("Missing Number Connect game");
    }
    tamperedGame.players[0]!.board[0] = tamperedGame.players[0]!.board[1]!;
    expect(await load(duplicateNumber)).toMatchObject({ kind: "invalid" });

    const wrongType = structuredClone(snapshot);
    wrongType.rooms[0]!.gameType = "digit_bomb";
    wrongType.rooms[0]!.digitBombDigits = 4;
    expect(await load(wrongType)).toMatchObject({ kind: "invalid" });

    const llm = structuredClone(snapshot);
    llm.rooms[0]!.botMode = "llm";
    expect(await load(llm)).toMatchObject({ kind: "invalid" });
  });

  it("round-trips private Digit Bomb state and rejects digits, secrets, and type tampering", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const game = createDigitBombGame({
      players: playerIds.map((id, seat) => ({ id, name: `拆弹员${seat + 1}` })),
      seed: "63".repeat(32),
      digits: 6,
    });
    game.players[0]!.secret = "001234";
    game.currentPlayerId = playerIds[1]!;
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "持久化数字炸弹",
        gameType: "digit_bomb",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 2,
        digitBombDigits: 6,
        createdAt: new Date().toISOString(),
        botIntelligence: 3,
        botMode: "rules",
        ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
        players: playerIds.map((id, seat) => ({
          id,
          username: `digit-${seat}`,
          displayName: `拆弹员${seat + 1}`,
          ready: true,
          connected: false,
          seat,
          isBot: false,
        })),
        game,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    expect(await load(JSON.parse(JSON.stringify(snapshot)))).toMatchObject({
      kind: "valid",
      snapshot: {
        version: 1,
        rooms: [{
          gameType: "digit_bomb",
          digitBombDigits: 6,
          game: {
            kind: "digit_bomb",
            digits: 6,
            players: [{ secret: "001234" }, { secret: null }],
          },
        }],
      },
    });

    const badSecret = structuredClone(snapshot);
    if (!badSecret.rooms[0]?.game || !("kind" in badSecret.rooms[0].game)) {
      throw new Error("Missing Digit Bomb game");
    }
    (badSecret.rooms[0].game as typeof game).players[0]!.secret = "123";
    expect(await load(badSecret)).toMatchObject({ kind: "invalid" });

    const badDigits = structuredClone(snapshot);
    badDigits.rooms[0]!.digitBombDigits = 5;
    expect(await load(badDigits)).toMatchObject({ kind: "invalid" });

    const wrongType = structuredClone(snapshot);
    wrongType.rooms[0]!.gameType = "splendor";
    delete wrongType.rooms[0]!.digitBombDigits;
    expect(await load(wrongType)).toMatchObject({ kind: "invalid" });

    const llm = structuredClone(snapshot);
    llm.rooms[0]!.botMode = "llm";
    expect(await load(llm)).toMatchObject({ kind: "invalid" });
  });

  it("round-trips both Splendor variants and rejects tampered or mismatched state", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    for (const kind of ["splendor", "splendor_pokemon"] as const) {
      const game = createSplendorGame({
        kind,
        players: playerIds.map((id, seat) => ({ id, name: `宝石玩家${seat + 1}` })),
        seed: (kind === "splendor" ? "51" : "52").repeat(32),
      });
      const snapshot: RoomServiceSnapshot = {
        version: 1,
        rooms: [{
          id: kind === "splendor"
            ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
            : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "持久化璀璨宝石",
          gameType: kind,
          ownerId: playerIds[0]!,
          status: "playing",
          maxPlayers: 4,
          createdAt: new Date().toISOString(),
          botIntelligence: 3,
          botMode: "rules",
          ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
          players: playerIds.map((id, seat) => ({
            id,
            username: `splendor-${seat}`,
            displayName: `宝石玩家${seat + 1}`,
            ready: true,
            connected: false,
            seat,
            isBot: false,
          })),
          game,
        }],
      };

      const valid = await load(JSON.parse(JSON.stringify(snapshot)));
      expect(valid).toMatchObject({
        kind: "valid",
        snapshot: {
          version: 1,
          rooms: [{
            gameType: kind,
            status: "playing",
            game: { kind, version: 1, revision: 0 },
          }],
        },
      });

      const tampered = structuredClone(snapshot);
      if (!tampered.rooms[0]?.game || !("kind" in tampered.rooms[0].game)) {
        throw new Error("Missing Splendor game");
      }
      const supply = (tampered.rooms[0].game as typeof game).tokenSupply as Record<string, number>;
      supply[kind === "splendor" ? "white" : "red"] = -1;
      expect(await load(tampered)).toMatchObject({ kind: "invalid" });

      const mismatched = structuredClone(snapshot);
      mismatched.rooms[0]!.gameType = kind === "splendor" ? "splendor_pokemon" : "splendor";
      expect(await load(mismatched)).toMatchObject({ kind: "invalid" });

      const llm = structuredClone(snapshot);
      llm.rooms[0]!.botMode = "llm";
      expect(await load(llm)).toMatchObject({ kind: "invalid" });
    }
  });

  it("loads a complete Doudizhu room without passing it through Sanguosha migration", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const game = createDoudizhuGame({
      players: playerIds.map((id, seat) => ({ id, name: `牌手${seat + 1}` })),
      seed: "dd".repeat(32),
    });
    for (const player of game.players as Array<Record<string, unknown>>) {
      delete player.beans;
      delete player.beanDelta;
    }
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "持久化斗地主",
        gameType: "doudizhu",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 3,
        createdAt: new Date().toISOString(),
        botIntelligence: 3,
        chatMessages: [{
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          senderId: playerIds[0]!,
          senderName: "牌手1",
          text: "准备开始",
          sentAt: new Date().toISOString(),
        }],
        ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
        players: playerIds.map((id, seat) => ({
          id,
          username: `ddz-${seat}`,
          displayName: `牌手${seat + 1}`,
          ready: true,
          connected: false,
          seat,
          isBot: seat > 0,
        })),
        game,
      }],
    };

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    expect(result.snapshot.rooms[0]).toMatchObject({
      gameType: "doudizhu",
      maxPlayers: 3,
      chatMessages: [{ text: "准备开始" }],
      game: { kind: "doudizhu", phase: "bidding" },
    });
    const restoredGame = result.snapshot.rooms[0]?.game;
    if (!restoredGame || !("kind" in restoredGame) || restoredGame.kind !== "doudizhu") {
      throw new Error("Missing migrated Doudizhu game");
    }
    expect(restoredGame.players.map((player) => player.beans)).toEqual([10_000, 10_000, 10_000]);
  });

  it("migrates the legacy server rule config without changing authoritative game progress", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const game = createGame({ playerIds, seed: "a1".repeat(32) });
    const legacy = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Legacy config",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id,
          username: `legacy-${seat}`,
          displayName: `legacy-${seat}`,
          ready: true,
          connected: false,
          seat,
        })),
        game: structuredClone(game),
      }],
    };
    for (const player of legacy.rooms[0]!.game.players as Array<Record<string, unknown>>) {
      delete player.godFaction;
    }
    delete (legacy.rooms[0]!.game as unknown as Record<string, unknown>).revision;
    const before = structuredClone(legacy.rooms[0]!.game);

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: legacy }] }) as Pool["query"],
    ));

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restoredRoom = result.snapshot.rooms[0]!;
    const restored = restoredRoom.game!;
    expect(restored.revision).toBe(0);
    expect(restoredRoom.ruleConfig).toEqual(DEFAULT_SERVER_ROOM_RULE_CONFIG);
    expect(restored.completeRules.ruleConfig).toEqual(DEFAULT_SERVER_ROOM_RULE_CONFIG);
    expect(restored.players.every((player) => player.godFaction === null)).toBe(true);
    expect({
      rng: restored.rng,
      deck: restored.deck,
      discardPile: restored.discardPile,
      nextUseId: restored.nextUseId,
      nextEventId: restored.nextEventId,
      damageFlow: restored.completeRules.damageFlow,
      dying: restored.completeRules.dying,
      death: restored.completeRules.death,
      nextMoveBatchId: restored.completeRules.nextMoveBatchId,
      nextDamageId: restored.completeRules.nextDamageId,
      reshufflesRemaining: restored.completeRules.reshufflesRemaining,
    }).toEqual({
      rng: before.rng,
      deck: before.deck,
      discardPile: before.discardPile,
      nextUseId: before.nextUseId,
      nextEventId: before.nextEventId,
      damageFlow: before.completeRules.damageFlow,
      dying: before.completeRules.dying,
      death: before.completeRules.death,
      nextMoveBatchId: before.completeRules.nextMoveBatchId,
      nextDamageId: before.completeRules.nextDamageId,
      reshufflesRemaining: before.completeRules.reshufflesRemaining,
    });
    expect(legacy.rooms[0]!.game.completeRules.ruleConfig).toEqual(DEFAULT_COMPLETE_RULE_CONFIG);
  });

  it("round-trips a strict private draft and rejects config, pack, roster, and record tampering", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const config = {
      ...DEFAULT_SERVER_ROOM_RULE_CONFIG,
      generalSelection: {
        ...DEFAULT_SERVER_ROOM_RULE_CONFIG.generalSelection,
        mode: "choice" as const,
        candidatesPerPlayer: 3,
      },
    };
    const draft = createGeneralDraft({
      playerIds,
      config,
      rng: { key: "01".repeat(32), counter: 0 },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Strict draft",
        ownerId: playerIds[0]!,
        status: "drafting",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id,
          username: `draft-${seat}`,
          displayName: `draft-${seat}`,
          ready: true,
          connected: false,
          seat,
        })),
        ruleConfig: config,
        draft,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    const valid = await load(JSON.parse(JSON.stringify(snapshot)));
    expect(valid).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ status: "drafting", botIntelligence: 3, ruleConfig: config, draft: { playerIds, roles: draft.roles } }] },
    });

    const wrongLord = structuredClone(snapshot);
    wrongLord.rooms[0]!.draft!.roles![playerIds[0]!] = "lord";
    wrongLord.rooms[0]!.draft!.roles![playerIds[1]!] = "lord";
    expect(await load(wrongLord)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("identity rules") });

    const extraConfig = structuredClone(snapshot) as unknown as { rooms: Array<{ ruleConfig: Record<string, unknown> }> };
    extraConfig.rooms[0]!.ruleConfig.injected = true;
    expect(await load(extraConfig)).toMatchObject({ kind: "invalid" });

    const mismatchedConfig = structuredClone(snapshot);
    mismatchedConfig.rooms[0]!.ruleConfig.generalSelection.candidatesPerPlayer = 2;
    expect(await load(mismatchedConfig)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("candidate count") });

    const disabledPack = structuredClone(snapshot);
    (disabledPack.rooms[0]!.draft!.candidates[playerIds[0]!] as string[])[0] = "shen_cao_cao";
    expect(await load(disabledPack)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("disabled pack") });

    const extraPrivatePlayer = structuredClone(snapshot);
    (extraPrivatePlayer.rooms[0]!.draft!.selections as Record<string, string | null>)[
      "99999999-9999-4999-8999-999999999999"
    ] = null;
    expect(await load(extraPrivatePlayer)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("keys") });

    const wrongRoster = structuredClone(snapshot);
    (wrongRoster.rooms[0]!.draft!.playerIds as string[]).reverse();
    expect(await load(wrongRoster)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("draft players") });

    const wrongStatus = structuredClone(snapshot);
    wrongStatus.rooms[0]!.status = "waiting";
    expect(await load(wrongStatus)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Waiting room") });
  });

  it("round-trips a completed God assignment and rejects missing, illegal, fixed, or config-mismatched factions", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const config = {
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "god"] as const,
      generalSelection: {
        ...DEFAULT_COMPLETE_RULE_CONFIG.generalSelection,
        candidatesPerPlayer: 10,
      },
    };
    const draft = createGeneralDraft({
      playerIds,
      config,
      rng: { key: "01".repeat(32), counter: 0 },
    });
    const godOwnerId = playerIds.find((playerId) => draft.candidates[playerId]?.some((id) => id.startsWith("shen_")))!;
    const fixedOwnerId = playerIds.find((playerId) => playerId !== godOwnerId)!;
    const godGeneralId = draft.candidates[godOwnerId]!.find((id) => id.startsWith("shen_"))!;
    const fixedGeneralId = draft.candidates[fixedOwnerId]!.find((id) => !id.startsWith("shen_"))!;
    while (draft.stage === "selecting_generals") {
      const currentPlayerId = getGeneralDraftView(draft, playerIds[0]!).currentPlayerId!;
      chooseGeneral(draft, currentPlayerId, currentPlayerId === godOwnerId ? godGeneralId : fixedGeneralId);
    }
    chooseGodFaction(draft, godOwnerId, "wu");
    const game = createGameFromDraft({ draft, config });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "God faction",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id,
          username: `god-${seat}`,
          displayName: `god-${seat}`,
          ready: true,
          connected: false,
          seat,
        })),
        ruleConfig: config,
        game,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    expect(await load(snapshot)).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { players: expect.arrayContaining([
        expect.objectContaining({ id: godOwnerId, generalId: godGeneralId, godFaction: "wu" }),
        expect.objectContaining({ id: fixedOwnerId, generalId: fixedGeneralId, godFaction: null }),
      ]) } }] },
    });

    const missingGodFaction = structuredClone(snapshot) as unknown as { rooms: Array<{ game: { players: Array<Record<string, unknown>> } }> };
    delete missingGodFaction.rooms[0]!.game.players.find((player) => player.id === godOwnerId)!.godFaction;
    expect(await load(missingGodFaction)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("God faction") });

    const fixedFaction = structuredClone(snapshot);
    fixedFaction.rooms[0]!.game!.players.find((player) => player.id === fixedOwnerId)!.godFaction = "shu";
    expect(await load(fixedFaction)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("God faction") });

    const illegalFaction = structuredClone(snapshot) as unknown as { rooms: Array<{ game: { players: Array<{ id: string; godFaction: string | null }> } }> };
    illegalFaction.rooms[0]!.game.players.find((player) => player.id === godOwnerId)!.godFaction = "god";
    expect(await load(illegalFaction)).toMatchObject({ kind: "invalid" });

    const mismatchedConfig = structuredClone(snapshot);
    mismatchedConfig.rooms[0]!.ruleConfig.generalSelection.candidatesPerPlayer = 9;
    expect(await load(mismatchedConfig)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("rule configurations") });

    const invalidRevision = structuredClone(snapshot);
    invalidRevision.rooms[0]!.game!.revision = -1;
    expect(await load(invalidRevision)).toMatchObject({ kind: "invalid" });
  });

  it("round-trips Wuhun and nested Xingshang DeathStack cursors while rejecting tampering", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const game = createGame({ playerIds, seed: "d4".repeat(32) });
    const [source, wuhunOwner, markedTarget, xingshangOwner] = game.players;
    if (!source || !wuhunOwner || !markedTarget || !xingshangOwner) throw new Error("Missing death fixtures");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.generalId = "gan_ning";
      player.godFaction = null;
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.hp = player.maxHp = 4;
      player.alive = true;
    }
    source.role = "lord";
    wuhunOwner.role = "rebel";
    markedTarget.role = "loyalist";
    xingshangOwner.role = "renegade";
    wuhunOwner.generalId = "shen_guan_yu";
    wuhunOwner.godFaction = "wei";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: xingshangOwner.id,
      skillId: "xingshang",
      sourcePlayerId: xingshangOwner.id,
      sourceSkillId: "test:xingshang",
      expiry: { type: "permanent" },
    });
    markedTarget.hand = [standardCard("nested-death-card", "dodge", "heart")];
    game.deck = [standardCard("wuhun-judgment", "slash", "spade")];
    for (const target of [markedTarget, source]) {
      addMark(game.completeRules.lifecycle, {
        markId: "nightmare",
        ownerId: target.id,
        sourcePlayerId: wuhunOwner.id,
        sourceSkillId: "wuhun",
        amount: 1,
        visibility: "public",
        expiry: { type: "permanent" },
      });
    }
    const forfeitFixture = structuredClone(game);
    beginDirectDeath(game, wuhunOwner.id, { type: "finish_effect" });
    expect(game.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "wuhun",
      stage: "wuhun_target",
      targetIds: [markedTarget.id, source.id],
    });
    const snapshotFor = (current: typeof game, id: string): RoomServiceSnapshot => ({
      version: 1,
      rooms: [{
        id,
        name: "DeathStack",
        ownerId: source.id,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: current.players.map((player, seat) => ({
          id: player.id,
          username: `death-${seat}`,
          displayName: `death-${seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        ruleConfig: current.completeRules.ruleConfig,
        game: current,
      }],
    });
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    const forfeited = forfeitPlayer(forfeitFixture, wuhunOwner.id);
    expect(forfeited.pendingResponse).toBeNull();
    expect(forfeited.completeRules.death.frames).toEqual([]);
    expect(await load(snapshotFor(
      forfeited,
      "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    ))).toMatchObject({ kind: "valid" });

    const wuhunSnapshot = snapshotFor(game, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const restoredWuhun = await load(wuhunSnapshot);
    if (restoredWuhun.kind !== "valid") throw new Error(restoredWuhun.reason);
    expect(restoredWuhun).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { completeRules: { death: { frames: [{ death: { victimId: wuhunOwner.id } }] } } } }] },
    });

    const forgedWuhunTargets = structuredClone(wuhunSnapshot);
    if (forgedWuhunTargets.rooms[0]!.game!.pendingResponse?.type !== "standard_skill") throw new Error("Missing Wuhun cursor");
    forgedWuhunTargets.rooms[0]!.game!.pendingResponse.targetIds!.push(xingshangOwner.id);
    expect(await load(forgedWuhunTargets)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Wuhun") });

    let nested = restoredWuhun.snapshot.rooms[0]!.game!;
    const wuhunPrompt = nested.pendingResponse;
    if (wuhunPrompt?.type !== "standard_skill") throw new Error("Missing restored Wuhun prompt");
    nested = applyAction(nested, {
      type: "resolve_standard_skill",
      playerId: wuhunOwner.id,
      promptId: wuhunPrompt.promptId,
      activate: true,
      targetId: markedTarget.id,
    });
    expect(nested.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "xingshang",
      stage: "xingshang_claim",
      targetId: xingshangOwner.id,
      sourceId: markedTarget.id,
      deathResolution: { completion: { type: "wuhun" } },
    });
    expect(nested.completeRules.death.frames).toHaveLength(2);

    const nestedSnapshot = snapshotFor(nested, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(await load(nestedSnapshot)).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { completeRules: { death: { frames: [{}, {}] } } } }] },
    });

    const forgedParent = structuredClone(nestedSnapshot);
    const nestedPrompt = forgedParent.rooms[0]!.game!.pendingResponse;
    if (nestedPrompt?.type !== "standard_skill" || nestedPrompt.deathResolution?.completion.type !== "wuhun") {
      throw new Error("Missing nested Xingshang cursor");
    }
    nestedPrompt.deathResolution.completion.parent.frameId += 1;
    expect(await load(forgedParent)).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Wuhun") });

    const skippedParentOwner = structuredClone(nestedSnapshot);
    const skippedPrompt = skippedParentOwner.rooms[0]!.game!.pendingResponse;
    if (skippedPrompt?.type !== "standard_skill" || skippedPrompt.deathResolution?.completion.type !== "wuhun") {
      throw new Error("Missing nested parent Xingshang queue");
    }
    skippedPrompt.deathResolution.completion.parent.remainingOwnerIds = [];
    expect(await load(skippedParentOwner)).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Xingshang queue"),
    });
  });

  it("restores a departed seat tombstone while allowing that account in a new room", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const game = createGame({ playerIds, seed: "6".padStart(64, "0") });
    const loyalist = game.players.find((player) => player.role === "loyalist");
    const lord = game.players.find((player) => player.role === "lord");
    if (!loyalist || !lord) throw new Error("Missing required roles");
    game.discardPile.push(...loyalist.hand, ...Object.values(loyalist.equipment), ...loyalist.judgment);
    loyalist.hand = [];
    loyalist.equipment = {};
    loyalist.judgment = [];
    loyalist.alive = false;
    loyalist.hp = 0;
    const startedRoomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const newRoomId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [
        {
          id: startedRoomId,
          name: "离席后仍在运行",
          ownerId: lord.id,
          status: "playing",
          maxPlayers: 5,
          createdAt: new Date().toISOString(),
          players: playerIds.map((id, seat) => ({
            id,
            username: `player-${seat}`,
            displayName: `player-${seat}`,
            ready: id !== loyalist.id,
            connected: false,
            seat,
            departed: id === loyalist.id,
          })),
          game,
        },
        {
          id: newRoomId,
          name: "离席者的新房间",
          ownerId: loyalist.id,
          status: "waiting",
          maxPlayers: 2,
          createdAt: new Date().toISOString(),
          players: [{
            id: loyalist.id,
            username: "leaver",
            displayName: "leaver",
            ready: false,
            connected: false,
            seat: 0,
          }],
        },
      ],
    };
    const pool = poolWithQuery(vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = new RoomService();
    restored.restoreSnapshot(result.snapshot);
    expect(restored.get(startedRoomId)).toMatchObject({ status: "playing", playerCount: 4 });
    expect(restored.members(startedRoomId)).not.toContain(loyalist.id);
    expect(restored.getForUser(loyalist.id)?.id).toBe(newRoomId);
  });

  it("round-trips completed live damage history while keeping the active stack empty", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "f".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.generalId = "gan_ning";
      player.equipment = {};
    }
    actor.hand = [standardCard("persisted-live-slash", "slash")];
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false };
    game.pendingResponse = null;

    const pending = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-live-slash",
      targetId: target.id,
    });
    const completed = applyAction(pending, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(completed.completeRules.damageFlow).toMatchObject({
      frames: [],
      completedDamageIds: [1],
      completedFrameIds: [1],
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        name: "Completed live damage",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: completed.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "live-owner" : "live-guest",
          displayName: player.id === actor.id ? "live-owner" : "live-guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: completed,
      }],
    };
    const restored = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));

    expect(restored).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { completeRules: {
        nextDamageId: 2,
        damageFlow: { frames: [], completedDamageIds: [1], completedFrameIds: [1] },
      } } }] },
    });
  });

  it("upgrades an old snapshot and preserves a turn-start rescue continuation", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "7".padStart(64, "0") });
    const victim = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!victim) throw new Error("Missing victim");
    victim.hp = 0;
    game.turn.phase = "respond";
    game.pendingResponse = {
      type: "dying",
      victimId: victim.id,
      damageSourceId: null,
      targetId: victim.id,
      remainingResponderIds: [game.currentPlayerId],
      resume: { type: "turn_start" },
    };
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "濒死恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game,
      }],
    };
    const legacySnapshot = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: {
        players: Array<Record<string, unknown>>;
        turn: Record<string, unknown>;
        virtualCardOrigins?: Record<string, unknown>;
        nextUseId?: number;
        nextEventId?: number;
        afterMove?: Record<string, unknown>;
        completeRules: Record<string, unknown>;
      } }>;
    };
    for (const player of legacySnapshot.rooms[0]!.game.players) {
      delete player.judgment;
      delete player.chained;
      delete player.faceUp;
      delete player.generalId;
    }
    delete legacySnapshot.rooms[0]!.game.turn.skipDraw;
    delete legacySnapshot.rooms[0]!.game.turn.skipPlay;
    delete legacySnapshot.rooms[0]!.game.turn.luoyiActive;
    delete legacySnapshot.rooms[0]!.game.turn.slashRespondedInPlayPhase;
    delete legacySnapshot.rooms[0]!.game.turn.skillUseCounts;
    delete legacySnapshot.rooms[0]!.game.turn.rendeGivenCount;
    delete legacySnapshot.rooms[0]!.game.turn.rendeRecovered;
    delete legacySnapshot.rooms[0]!.game.virtualCardOrigins;
    delete legacySnapshot.rooms[0]!.game.nextUseId;
    delete legacySnapshot.rooms[0]!.game.nextEventId;
    delete legacySnapshot.rooms[0]!.game.afterMove;
    delete legacySnapshot.rooms[0]!.game.completeRules.damageFlow;
    delete legacySnapshot.rooms[0]!.game.completeRules.dying;
    delete legacySnapshot.rooms[0]!.game.completeRules.death;
    const pool = poolWithQuery(vi.fn().mockResolvedValue({ rows: [{ snapshot: legacySnapshot }] }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    if (result.kind !== "valid") throw new Error(result.reason);
    expect(result).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        players: [
          { judgment: [], chained: false, faceUp: true, generalId: null },
          { judgment: [], chained: false, faceUp: true, generalId: null },
        ],
        turn: {
          skipDraw: false,
          skipPlay: false,
          luoyiActive: false,
          slashRespondedInPlayPhase: false,
          skillUseCounts: {},
          rendeGivenCount: 0,
          rendeRecovered: false,
        },
        virtualCardOrigins: {},
        nextUseId: 1,
        nextEventId: 2,
        afterMove: { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null },
        completeRules: {
          damageFlow: { type: "damage_flow", version: 1, revision: 0, frames: [] },
          dying: { version: 1, frames: [{
            version: 2,
            type: "dying",
            frameId: 1,
            victimId: victim.id,
            stage: "rescue",
            migratedFromVersion: 1,
          }] },
          death: { version: 1, frames: [] },
        },
        pendingResponse: { type: "dying", frameId: 1, victimId: victim.id, resume: { type: "turn_start" } },
      } }] },
    });

    const forgedDying = structuredClone(snapshot);
    const forgedDyingGame = forgedDying.rooms[0]!.game!;
    const forgedDamageSourceId = forgedDyingGame.currentPlayerId;
    pushDyingFrame(forgedDyingGame.completeRules.dying, createDyingFrame(
      forgedDyingGame.players,
      {
        frameId: 1,
        victimId: victim.id,
        reason: { type: "damage", eventId: 1, sourceId: forgedDamageSourceId },
        responderOrder: [
          victim.id,
          ...forgedDyingGame.players.filter((player) => player.id !== victim.id).map((player) => player.id),
        ],
      },
    ));
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedDying }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid" });

    const forgedDeath = structuredClone(snapshot);
    const forgedDeathGame = forgedDeath.rooms[0]!.game!;
    pushDeathFrame(forgedDeathGame.completeRules.death, createDeathFrame({
      frameId: 1,
      death: {
        type: "death",
        eventId: 1,
        victimId: victim.id,
        killerId: forgedDeathGame.currentPlayerId,
        reason: { type: "damage", eventId: 1, sourceId: forgedDeathGame.currentPlayerId },
      },
    }));
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedDeath }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid" });

  });

  it("round-trips an identified Jizhi card-use continuation and rejects corrupted frames", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "a".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    if (!actor) throw new Error("Missing Jizhi persistence actor");
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    actor.generalId = "huang_yue_ying";
    actor.hand = [{
      id: "persisted-jizhi-ex",
      kind: "ex_nihilo",
      name: "无中生有",
      category: "trick",
      suit: "heart",
      rank: 7,
    }];
    game.turn.phase = "play";
    game.pendingResponse = null;

    const offered = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-jizhi-ex",
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "jizhi",
      targetId: actor.id,
      promptId: expect.stringContaining("jizhi"),
      resume: {
        type: "card_use",
        stage: "card_use_declared",
        intent: { physicalCardId: "persisted-jizhi-ex", effectiveKind: "ex_nihilo" },
      },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "集智恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game: offered,
      }],
    };

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: JSON.parse(JSON.stringify(snapshot)) }] }) as Pool["query"],
    ));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = result.snapshot.rooms[0]?.game;
    if (!restored || restored.pendingResponse?.type !== "skill_choice") {
      throw new Error("Missing restored Jizhi continuation");
    }
    const promptId = restored.pendingResponse.promptId;
    if (!promptId) throw new Error("Missing restored Jizhi prompt identifier");
    const resolved = applyAction(restored, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "jizhi",
      activate: false,
      promptId,
    });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.discardPile.filter((card) => card.id === "persisted-jizhi-ex")).toHaveLength(1);

    const stalePrompt = structuredClone(snapshot);
    const stalePending = stalePrompt.rooms[0]?.game?.pendingResponse;
    if (!stalePending || stalePending.type !== "skill_choice") throw new Error("Missing stale-prompt fixture");
    stalePending.promptId = "skill:stale";
    const staleResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: stalePrompt }] }) as Pool["query"],
    ));
    expect(staleResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("prompt and trigger identifiers disagree"),
    });

    const missingPhysical = structuredClone(snapshot);
    const missingGame = missingPhysical.rooms[0]?.game;
    if (!missingGame) throw new Error("Missing physical-card fixture");
    const source = missingGame.players.find((player) => player.id === actor.id);
    if (!source) throw new Error("Missing physical-card source");
    source.hand = source.hand.filter((card) => card.id !== "persisted-jizhi-ex");
    const missingResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingPhysical }] }) as Pool["query"],
    ));
    expect(missingResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("physical card is no longer owned"),
    });

    const retargeted = structuredClone(snapshot);
    const retargetedPending = retargeted.rooms[0]?.game?.pendingResponse;
    if (retargetedPending?.type !== "skill_choice" || retargetedPending.resume.type !== "card_use") {
      throw new Error("Missing retargeted Jizhi continuation");
    }
    retargetedPending.resume.intent.targetIds = [guestId];
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: retargeted }] }) as Pool["query"],
    ))).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("committed runtime validation"),
    });
  });

  it("round-trips an after-move prompt with its suspended response and rejects corrupt suspension", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "b".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const target = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !target) throw new Error("Missing after-move persistence players");
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    actor.generalId = "lu_xun";
    target.generalId = "liu_bei";
    actor.hand = [{
      id: "persisted-lianying-slash", kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7,
    }];
    target.hand = [{
      id: "persisted-lianying-dodge", kind: "dodge", name: "闪", category: "basic", suit: "heart", rank: 2,
    }];
    game.turn.phase = "play";
    game.pendingResponse = null;
    const offered = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-lianying-slash",
      targetId: target.id,
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice", skillId: "lianying", targetId: actor.id, resume: { type: "after_move" },
    });
    expect(offered.afterMove).toMatchObject({
      suspendedPhase: "respond",
      suspendedResponse: { type: "slash", targetId: target.id },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "牌移动恢复",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game: offered,
      }],
    };

    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: JSON.parse(JSON.stringify(snapshot)) }] }) as Pool["query"],
    ));
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error(result.reason);
    const restored = result.snapshot.rooms[0]?.game;
    const pending = restored?.pendingResponse;
    if (!restored || pending?.type !== "skill_choice" || !pending.promptId) {
      throw new Error("Missing restored after-move prompt");
    }
    const resumed = applyAction(restored, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "lianying",
      activate: false,
      promptId: pending.promptId,
    });
    expect(resumed.pendingResponse).toMatchObject({ type: "slash", targetId: target.id });
    expect(resumed.afterMove).toEqual({ queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });

    const missingSuspension = structuredClone(snapshot);
    const missingGame = missingSuspension.rooms[0]?.game;
    if (!missingGame) throw new Error("Missing corrupt suspension fixture");
    missingGame.afterMove.suspendedResponse = null;
    const missingResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingSuspension }] }) as Pool["query"],
    ));
    expect(missingResult).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("respond phase has no suspended response"),
    });

    const unknownTarget = structuredClone(snapshot);
    const unknownPending = unknownTarget.rooms[0]?.game?.afterMove.suspendedResponse;
    if (!unknownPending || unknownPending.type !== "slash") throw new Error("Missing unknown target fixture");
    unknownPending.targetId = "99999999-9999-4999-8999-999999999999";
    const unknownResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: unknownTarget }] }) as Pool["query"],
    ));
    expect(unknownResult).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Suspended response references an unknown player"),
    });
  });

  it("validates per-turn skill counters and virtual delayed-card origins", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "9".padStart(64, "0") });
    const originIndex = game.deck.findIndex((card) => card.kind !== "le_bu_si_shu");
    const [origin] = game.deck.splice(originIndex, 1);
    if (!origin) throw new Error("Missing virtual delayed-card origin fixture");
    const virtualCard: typeof origin = { ...origin, kind: "le_bu_si_shu" };
    game.players[1]!.judgment.push(virtualCard);
    game.virtualCardOrigins[virtualCard.id] = origin.kind;
    game.turn.skillUseCounts = { zhiheng: 1, qingnang: 0 };
    game.turn.rendeGivenCount = 1;
    game.turn.rendeRecovered = false;
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "技能状态持久化",
        ownerId,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: [
          { id: ownerId, username: "owner", displayName: "owner", ready: true, connected: false, seat: 0 },
          { id: guestId, username: "guest", displayName: "guest", ready: true, connected: false, seat: 1 },
        ],
        game,
      }],
    };

    const validResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(validResult).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        turn: { skillUseCounts: { zhiheng: 1, qingnang: 0 }, rendeGivenCount: 1, rendeRecovered: false },
        virtualCardOrigins: { [virtualCard.id]: origin.kind },
      } }] },
    });

    const missingVirtualCard = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { virtualCardOrigins: Record<string, string> } }>;
    };
    missingVirtualCard.rooms[0]!.game.virtualCardOrigins.missing = "slash";
    const missingVirtualCardResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: missingVirtualCard }] }) as Pool["query"],
    ));
    expect(missingVirtualCardResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("exactly one resolving or judgment card"),
    });

    const wrongVirtualKind = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { players: Array<{ judgment: Array<{ id: string; kind: string }> }> } }>;
    };
    const mappedCard = wrongVirtualKind.rooms[0]!.game.players
      .flatMap((player) => player.judgment)
      .find((card) => card.id === virtualCard.id);
    if (!mappedCard) throw new Error("Missing mapped virtual-card fixture");
    mappedCard.kind = origin.kind;
    const wrongVirtualKindResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: wrongVirtualKind }] }) as Pool["query"],
    ));
    expect(wrongVirtualKindResult).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("supported virtual trick card"),
    });

    const invalidCounters = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { turn: { skillUseCounts: Record<string, number> } } }>;
    };
    invalidCounters.rooms[0]!.game.turn.skillUseCounts = { not_a_skill: 1, zhiheng: -1 };
    const invalidCounterResult = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: invalidCounters }] }) as Pool["query"],
    ));
    expect(invalidCounterResult.kind).toBe("invalid");
  });

  it("restores Fanjian suit prompts and virtual Lijian Duels while rejecting forged Fanjian ids", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const members = playerIds.map((id, seat) => ({
      id,
      username: `player-${seat}`,
      displayName: `player-${seat}`,
      ready: true,
      connected: false,
      seat,
    }));
    const roomFor = (game: ReturnType<typeof createGame>, id: string): RoomServiceSnapshot => ({
      version: 1,
      rooms: [{
        id,
        name: "技能续体恢复",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: members,
        game,
      }],
    });

    const fanjianBase = createGame({ playerIds, seed: "a".padStart(64, "0") });
    const zhouYu = fanjianBase.players.find((player) => player.id === fanjianBase.currentPlayerId)!;
    const target = fanjianBase.players.find((player) => player.id !== zhouYu.id)!;
    zhouYu.generalId = "zhou_yu";
    fanjianBase.turn.phase = "play";
    const fanjian = applyAction(fanjianBase, {
      type: "use_skill", playerId: zhouYu.id, skillId: "fanjian", targetId: target.id,
    });
    const fanjianSnapshot = roomFor(fanjian, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const restoredFanjian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: fanjianSnapshot }] }) as Pool["query"],
    ));
    expect(restoredFanjian).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "fanjian_suit",
        attackerId: zhouYu.id,
        targetId: target.id,
        promptId: expect.stringContaining(":fanjian:"),
      } } }] },
    });

    const forged = structuredClone(fanjianSnapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forged.rooms[0]!.game.pendingResponse.promptId += ":replayed";
    const rejectedFanjian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forged }] }) as Pool["query"],
    ));
    expect(rejectedFanjian).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Fanjian prompt state is inconsistent"),
    });

    const lijianBase = createGame({ playerIds, seed: "b".padStart(64, "0") });
    const diaoChan = lijianBase.players.find((player) => player.id === lijianBase.currentPlayerId)!;
    const [firstMale, secondMale, thirdMale] = lijianBase.players.filter((player) => player.id !== diaoChan.id);
    diaoChan.generalId = "diao_chan";
    firstMale!.generalId = "liu_bei";
    secondMale!.generalId = "zhu_ge_liang";
    thirdMale!.generalId = "guan_yu";
    lijianBase.turn.phase = "play";
    const costId = diaoChan.hand[0]!.id;
    const lijian = applyAction(lijianBase, {
      type: "use_skill",
      playerId: diaoChan.id,
      skillId: "lijian",
      cardIds: [costId],
      targetIds: [firstMale!.id, secondMale!.id],
    });
    const restoredLijian = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{
        snapshot: roomFor(lijian, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      }] }) as Pool["query"],
    ));
    expect(restoredLijian).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "duel",
        attackerId: firstMale!.id,
        targetId: secondMale!.id,
        cardId: expect.stringMatching(/^skill:lijian:/),
      } } }] },
    });
  });

  it("restores the exact Hujia provider cursor and rejects a forged lord-dispatch prompt id", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const game = createGame({ playerIds, seed: "c".padStart(64, "0") });
    for (const player of game.players) {
      game.discardPile.push(...player.hand);
      player.hand = [];
    }
    const attacker = game.players.find((player) => player.id === game.currentPlayerId)!;
    attacker.generalId = "lv_bu";
    const [caoCao, firstWei, secondWei] = game.players.filter((player) => player.id !== attacker.id);
    const oldLord = game.players.find((player) => player.role === "lord")!;
    oldLord.role = caoCao!.role;
    caoCao!.role = "lord";
    caoCao!.generalId = "cao_cao";
    firstWei!.generalId = "guo_jia";
    secondWei!.generalId = "si_ma_yi";
    attacker.hand = [{ id: "persist-hujia-slash", kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 7 }];
    secondWei!.hand = [{ id: "persist-hujia-dodge", kind: "dodge", name: "闪", category: "basic", suit: "heart", rank: 2 }];
    game.turn.phase = "play";
    let pending = applyAction(game, {
      type: "play_card", playerId: attacker.id, cardId: "persist-hujia-slash", targetId: caoCao!.id,
    });
    pending = applyAction(pending, {
      type: "invoke_lord_skill", playerId: caoCao!.id, skillId: "hujia",
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "护驾恢复",
        ownerId: playerIds[0]!,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id, username: `p-${seat}`, displayName: `p-${seat}`, ready: true, connected: false, seat,
        })),
        game: pending,
      }],
    };
    const restored = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    expect(restored).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "lord_dispatch",
        requesterId: caoCao!.id,
        targetId: firstWei!.id,
        remainingProviderIds: [secondWei!.id],
        resume: { type: "respond", pending: { type: "slash", targetId: caoCao!.id } },
      } } }] },
    });

    const forged = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forged.rooms[0]!.game.pendingResponse.promptId += ":stale";
    const rejected = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forged }] }) as Pool["query"],
    ));
    expect(rejected).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Lord dispatch prompt state is inconsistent"),
    });
  });

  it("restores Tiaoxin through Jijiang and rejects a forged failure continuation", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const game = createGame({ playerIds, seed: "c1".repeat(32) });
    const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
    const orderedOpponents = Array.from({ length: game.players.length - 1 }, (_value, index) =>
      game.players[(owner.seat + index + 1) % game.players.length]!);
    const [lord, provider] = orderedOpponents;
    if (!lord || !provider) throw new Error("Missing Tiaoxin Jijiang fixtures");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.generalId = "gan_ning";
      player.godFaction = null;
    }
    const oldLord = game.players.find((player) => player.role === "lord")!;
    oldLord.role = lord.role;
    lord.role = "lord";
    lord.generalId = "liu_bei";
    provider.generalId = "zhao_yun";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "tiaoxin",
      sourcePlayerId: owner.id,
      sourceSkillId: "test:tiaoxin",
      expiry: { type: "permanent" },
    });

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "tiaoxin",
      targetId: lord.id,
    });
    const tiaoxin = current.pendingResponse;
    if (tiaoxin?.type !== "standard_skill") throw new Error("Missing Tiaoxin prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: tiaoxin.promptId,
      activate: true,
      tokens: ["jijiang"],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "lord_dispatch",
      requesterId: lord.id,
      targetId: provider.id,
      resume: {
        type: "use_slash",
        targetIds: [owner.id],
        failureResume: { skillId: "tiaoxin", processedPlayerIds: [lord.id] },
      },
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1",
        name: "挑衅激将恢复",
        ownerId: owner.id,
        status: "playing",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
        players: playerIds.map((id, seat) => ({
          id, username: `tj-${seat}`, displayName: `tj-${seat}`, ready: true, connected: false, seat,
        })),
        ruleConfig: current.completeRules.ruleConfig,
        game: current,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));
    const restored = await load(snapshot);
    if (restored.kind !== "valid") throw new Error(restored.reason);

    const forged = structuredClone(snapshot);
    const dispatch = forged.rooms[0]!.game!.pendingResponse;
    if (dispatch?.type !== "lord_dispatch" || dispatch.resume.type !== "use_slash" || !dispatch.resume.failureResume) {
      throw new Error("Missing persisted Tiaoxin Jijiang continuation");
    }
    dispatch.resume.failureResume.processedPlayerIds = [];
    expect(await load(forged)).toMatchObject({
      kind: "invalid",
      reason: expect.stringContaining("Lord dispatch prompt state is inconsistent"),
    });
  });

  it("round-trips a private Guanxing reorder prompt and rejects forged prompt or top-card cursors", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "c".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const zhuge = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !zhuge) throw new Error("Missing Guanxing persistence fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
    }
    zhuge.generalId = "zhu_ge_liang";
    game.deck = [
      standardCard("persisted-gx-bottom", "slash"),
      standardCard("persisted-gx-low", "peach"),
      standardCard("persisted-gx-high", "dodge"),
    ];
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", requiredDiscardCount: 0 };
    game.pendingResponse = null;

    const offered = applyAction(game, { type: "end_play", playerId: actor.id });
    if (offered.pendingResponse?.type !== "standard_skill") throw new Error("Guanxing invoke prompt was not created");
    const choosing = applyAction(offered, {
      type: "resolve_standard_skill",
      playerId: zhuge.id,
      promptId: offered.pendingResponse.promptId,
      activate: true,
    });
    expect(choosing.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: zhuge.id,
      skillId: "guanxing",
      stage: "guanxing_reorder",
      selectedCardIds: ["persisted-gx-high", "persisted-gx-low"],
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "观星私有游标重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "owner" : "guest",
          displayName: player.id === actor.id ? "owner" : "guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: choosing,
      }],
    };
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ))).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_skill",
        skillId: "guanxing",
        stage: "guanxing_reorder",
        selectedCardIds: ["persisted-gx-high", "persisted-gx-low"],
      } } }] },
    });

    const forgedPrompt = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forgedPrompt.rooms[0]!.game.pendingResponse.promptId = "standard:forged:guanxing";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedPrompt }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("prompt metadata") });

    const forgedStage = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { stage: string } } }>;
    };
    forgedStage.rooms[0]!.game.pendingResponse.stage = "tuxi_select";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedStage }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("id/stage combination") });

    const forgedTopCards = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { selectedCardIds: string[] } } }>;
    };
    forgedTopCards.rooms[0]!.game.pendingResponse.selectedCardIds[0] = "not-a-current-top-card";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedTopCards }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("current top cards") });

    const tooManyTopCards = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { deck: Card[]; pendingResponse: { selectedCardIds: string[] } } }>;
    };
    tooManyTopCards.rooms[0]!.game.deck.unshift(
      standardCard("persisted-gx-extra-1", "slash"),
      standardCard("persisted-gx-extra-2", "slash"),
      standardCard("persisted-gx-extra-3", "slash"),
    );
    tooManyTopCards.rooms[0]!.game.pendingResponse.selectedCardIds = tooManyTopCards.rooms[0]!.game.deck
      .slice(-6)
      .reverse()
      .map((card) => card.id);
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: tooManyTopCards }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("current top cards") });
  });

  it("round-trips an in-flight physical judgment and rejects forged judgment cursors or entities", async () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const guestId = "22222222-2222-4222-8222-222222222222";
    const game = createGame({ playerIds: [ownerId, guestId], seed: "d".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId);
    const target = game.players.find((player) => player.id !== game.currentPlayerId);
    if (!actor || !target) throw new Error("Missing standard judgment persistence fixture players");
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.generalId = "gan_ning";
    }
    target.generalId = "si_ma_yi";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: target.id,
      skillId: "guicai",
      sourcePlayerId: target.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    actor.hand = [standardCard("persisted-bagua-slash", "slash")];
    target.hand = [standardCard("persisted-guicai-cost", "dodge", "club")];
    target.equipment.armor = standardCard("persisted-bagua", "ba_gua_zhen");
    game.deck = [standardCard("persisted-judgment", "peach", "heart")];
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };
    game.pendingResponse = null;

    const attacked = applyAction(game, {
      type: "play_card", playerId: actor.id, cardId: "persisted-bagua-slash", targetId: target.id,
    });
    const judging = applyAction(attacked, { type: "activate_armor", playerId: target.id, activate: true });
    expect(judging.pendingResponse).toMatchObject({
      type: "standard_judgment",
      targetId: target.id,
      frame: { targetId: target.id, cardId: "persisted-judgment", stage: "retrial_window" },
      context: { type: "armor", pending: { type: "slash", targetId: target.id } },
    });

    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "实体判定重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: player.id === actor.id ? "owner" : "guest",
          displayName: player.id === actor.id ? "owner" : "guest",
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: judging,
      }],
    };
    const valid = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    if (valid.kind !== "valid") throw new Error(valid.reason);
    expect(valid).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_judgment",
        promptId: judging.pendingResponse?.type === "standard_judgment" ? judging.pendingResponse.promptId : "",
        frame: { cardId: "persisted-judgment" },
      } } }] },
    });

    const forgedCursor = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forgedCursor.rooms[0]!.game.pendingResponse.promptId = "judgment:forged:retrial";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedCursor }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("prompt cursor") });

    const forgedEntity = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: { cardId: string } } } }>;
    };
    forgedEntity.rooms[0]!.game.pendingResponse.frame.cardId = "missing-judgment-entity";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedEntity }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("physical/derived") });

    const forgedContext = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: { reason: { id: string } } } } }>;
    };
    forgedContext.rooms[0]!.game.pendingResponse.frame.reason.id = "tieqi";
    expect(await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: forgedContext }] }) as Pool["query"],
    ))).toMatchObject({ kind: "invalid", reason: expect.stringContaining("context does not match") });
  });

  it("round-trips Hongyan judgment modifiers and rejects forged skill ownership", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    let game = createGame({ playerIds, seed: "8".repeat(64) });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.generalId = "gan_ning";
      player.alive = true;
      player.hp = 4;
      player.maxHp = 4;
    }
    target.generalId = "xiao_qiao";
    target.hp = 3;
    target.maxHp = 3;
    grantSkill(game.completeRules.lifecycle, {
      ownerId: target.id,
      skillId: "guicai",
      sourcePlayerId: target.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    actor.hand = [standardCard("persisted-hongyan-slash", "slash")];
    target.hand = [standardCard("persisted-hongyan-guicai", "dodge", "club")];
    target.equipment.armor = standardCard("persisted-hongyan-bagua", "ba_gua_zhen");
    game.deck = [standardCard("persisted-hongyan-judgment", "peach", "spade")];
    game.resolvingCards = [];
    game.pendingResponse = null;
    game.currentPlayerId = actor.id;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };

    game = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-hongyan-slash",
      targetId: target.id,
    });
    const judging = applyAction(game, { type: "activate_armor", playerId: target.id, activate: true });
    if (judging.pendingResponse?.type !== "standard_judgment") {
      throw new Error("Missing persisted Hongyan judgment fixture");
    }
    expect(judging.pendingResponse.frame).toMatchObject({
      effectiveCard: { physicalSuit: "spade", effectiveSuit: "heart", color: "red" },
      suitModifiers: [{
        modifierId: `hongyan:${judging.pendingResponse.frame.frameId}:${target.id}`,
        sourcePlayerId: target.id,
        skillId: "hongyan",
        fromSuit: "spade",
        toSuit: "heart",
      }],
    });
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "88888888-8888-4888-8888-888888888888",
        name: "红颜判定重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 2,
        createdAt: new Date().toISOString(),
        players: judging.players.map((player) => ({
          id: player.id,
          username: `player-${player.seat}`,
          displayName: `player-${player.seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game: judging,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    const valid = await load(snapshot);
    if (valid.kind !== "valid") throw new Error(valid.reason);
    const restored = valid.snapshot.rooms[0]!.game!;
    if (restored.pendingResponse?.type !== "standard_judgment") throw new Error("Hongyan judgment was not restored");
    const resolved = applyAction(restored, {
      type: "resolve_standard_skill",
      playerId: restored.pendingResponse.targetId,
      promptId: restored.pendingResponse.promptId,
      activate: false,
    });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.players.find((player) => player.id === target.id)?.hp).toBe(3);

    const missingModifier = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: {
        suitModifiers: unknown[];
        effectiveCard: { effectiveSuit: string; color: string };
      } } } }>;
    };
    const missingFrame = missingModifier.rooms[0]!.game.pendingResponse.frame;
    missingFrame.suitModifiers = [];
    missingFrame.effectiveCard.effectiveSuit = "spade";
    missingFrame.effectiveCard.color = "black";
    expect(await load(missingModifier)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Hongyan judgment modifier"),
    });

    const missingSkill = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { players: Array<{ id: string; generalId: string }> } }>;
    };
    missingSkill.rooms[0]!.game.players.find((player) => player.id === target.id)!.generalId = "gan_ning";
    expect(await load(missingSkill)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Hongyan judgment modifier"),
    });

    const forgedSource = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { frame: {
        suitModifiers: Array<{ sourcePlayerId: string }>;
      } } } }>;
    };
    forgedSource.rooms[0]!.game.pendingResponse.frame.suitModifiers[0]!.sourcePlayerId =
      "77777777-7777-4777-8777-777777777777";
    expect(await load(forgedSource)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Hongyan judgment modifier"),
    });
  });

  it("round-trips face-down state with a live Slash response", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    let game = createGame({ playerIds, seed: "e".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.generalId = "gan_ning";
      player.equipment = {};
    }
    actor.hp = 1;
    actor.hand = [
      standardCard("resume-slash", "slash"),
      standardCard("resume-extra-1", "dodge"),
      standardCard("resume-extra-2", "dodge"),
      standardCard("resume-extra-3", "dodge"),
    ];
    target.hand = [standardCard("resume-dodge", "dodge")];
    game.pendingResponse = null;
    game.turn = { ...game.turn, playerId: actor.id, phase: "play", slashUsed: false, requiredDiscardCount: 0 };
    game = turnOverGamePlayer(game, target.id);
    game = applyAction(game, {
      type: "play_card", playerId: actor.id, cardId: "resume-slash", targetId: target.id,
    });
    if (game.pendingResponse?.type !== "slash") throw new Error("Missing persisted Slash fixture");
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "Slash response",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 3,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: `player-${player.seat}`,
          displayName: `player-${player.seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game,
      }],
    };

    const valid = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot }] }) as Pool["query"],
    ));
    if (valid.kind !== "valid") throw new Error(valid.reason);
    expect(valid).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: {
        players: expect.arrayContaining([expect.objectContaining({ id: target.id, faceUp: false })]),
        pendingResponse: { type: "slash", completion: { type: "default" } },
      } }] },
    });
    const restoredGame = valid.snapshot.rooms[0]!.game!;
    const resolved = applyAction(restoredGame, {
      type: "respond", playerId: target.id, cardId: "resume-dodge",
    });
    expect(resolved.turn.phase).toBe("play");
    expect(resolved.pendingResponse).toBeNull();
  });

  it("round-trips Tianxiang redirect prompts and its last-card Lianying pause", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    let game = createGame({ playerIds, seed: "9".repeat(64) });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const owner = game.players.find((player) => player.id !== actor.id)!;
    const recipient = game.players.find((player) => player.id !== actor.id && player.id !== owner.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.generalId = "gan_ning";
      player.alive = true;
      player.hp = 4;
      player.maxHp = 4;
    }
    owner.generalId = "xiao_qiao";
    owner.hp = 3;
    owner.maxHp = 3;
    actor.hand = [standardCard("persisted-tianxiang-slash", "slash")];
    owner.hand = [standardCard("persisted-tianxiang-cost", "dodge", "spade")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "lianying",
      sourcePlayerId: owner.id,
      sourceSkillId: "persistence-test",
      expiry: { type: "permanent" },
    });
    game.pendingResponse = null;
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = {
      ...game.turn,
      playerId: actor.id,
      phase: "play",
      slashUsed: false,
      requiredDiscardCount: 0,
    };

    game = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-tianxiang-slash",
      targetId: owner.id,
    });
    game = applyAction(game, { type: "respond", playerId: owner.id, cardId: null });
    if (
      game.pendingResponse?.type !== "standard_skill" ||
      game.pendingResponse.skillId !== "tianxiang" ||
      game.pendingResponse.stage !== "tianxiang_redirect"
    ) throw new Error("Missing persisted Tianxiang prompt fixture");
    const tianxiangPrompt = game.pendingResponse;
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "99999999-9999-4999-8999-999999999999",
        name: "天香重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 3,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: `player-${player.seat}`,
          displayName: `player-${player.seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game,
      }],
    };
    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));

    expect(await load(snapshot)).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_skill",
        skillId: "tianxiang",
        stage: "tianxiang_redirect",
        targetId: owner.id,
        sourceId: actor.id,
      } } }] },
    });

    const forgedOpportunity = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: {
        pendingResponse: { damageOpportunity: { opportunityId: string } };
        completeRules: { damageFlow: { frames: Array<{ window: {
          prompt: { opportunityId: string };
          opportunities: Array<{ ref: { opportunityId: string } }>;
        } }> } };
      } }>;
    };
    const forgedId = `${tianxiangPrompt.damageOpportunity!.opportunityId}:forged`;
    forgedOpportunity.rooms[0]!.game.pendingResponse.damageOpportunity.opportunityId = forgedId;
    const forgedWindow = forgedOpportunity.rooms[0]!.game.completeRules.damageFlow.frames.at(-1)!.window;
    forgedWindow.prompt.opportunityId = forgedId;
    forgedWindow.opportunities[0]!.ref.opportunityId = forgedId;
    expect(await load(forgedOpportunity)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Tianxiang prompt"),
    });

    const noCost = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { deck: Card[]; players: Array<{ id: string; hand: Card[] }> } }>;
    };
    const noCostOwner = noCost.rooms[0]!.game.players.find((player) => player.id === owner.id)!;
    noCost.rooms[0]!.game.deck.push(...noCostOwner.hand.splice(0));
    expect(await load(noCost)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Tianxiang prompt"),
    });

    const noTarget = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { players: Array<{ id: string; hp: number; alive: boolean }> } }>;
    };
    for (const player of noTarget.rooms[0]!.game.players) {
      if (player.id === owner.id) continue;
      player.hp = 0;
      player.alive = false;
    }
    expect(await load(noTarget)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Tianxiang prompt"),
    });

    const paused = applyAction(game, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: tianxiangPrompt.promptId,
      activate: true,
      cardId: "persisted-tianxiang-cost",
      targetId: recipient.id,
    });
    expect(paused).toMatchObject({
      pendingResponse: { type: "skill_choice", skillId: "lianying", targetId: owner.id },
      afterMove: { suspendedPhase: "respond", suspendedResponse: null },
      completeRules: { damageFlow: { frames: [{ step: "redirect", window: null }] } },
    });
    const pausedSnapshot: RoomServiceSnapshot = {
      ...snapshot,
      rooms: [{ ...snapshot.rooms[0]!, game: paused }],
    };
    const restoredPause = await load(pausedSnapshot);
    if (restoredPause.kind !== "valid") throw new Error(restoredPause.reason);
    const restoredGame = restoredPause.snapshot.rooms[0]!.game!;
    if (restoredGame.pendingResponse?.type !== "skill_choice") throw new Error("Lianying pause was not restored");
    const resumed = applyAction(restoredGame, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      activate: false,
      promptId: restoredGame.pendingResponse.promptId,
    });
    expect(resumed.completeRules.damageFlow.frames).toEqual([]);
    expect(resumed.players.find((player) => player.id === owner.id)?.hp).toBe(3);
    expect(resumed.players.find((player) => player.id === recipient.id)).toMatchObject({ hp: 3, hand: [{ id: expect.any(String) }] });

    const forgedRedirect = structuredClone(pausedSnapshot) as unknown as {
      rooms: Array<{ game: { completeRules: { damageFlow: { frames: Array<{
        damage: { redirects: Array<{ sourceId: string }> };
      }> } } } }>;
    };
    forgedRedirect.rooms[0]!.game.completeRules.damageFlow.frames.at(-1)!
      .damage.redirects.at(-1)!.sourceId = actor.id;
    expect(await load(forgedRedirect)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Tianxiang redirect history"),
    });

    const forgedResolution = structuredClone(pausedSnapshot) as unknown as {
      rooms: Array<{ game: { completeRules: { damageFlow: {
        consumedActions: Array<{ resolutionRef: string | null }>;
      } } } }>;
    };
    forgedResolution.rooms[0]!.game.completeRules.damageFlow.consumedActions.at(-1)!.resolutionRef = "forged";
    expect(await load(forgedResolution)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Tianxiang redirect history"),
    });

    const forgedSuspension = structuredClone(pausedSnapshot) as unknown as {
      rooms: Array<{ game: { afterMove: { suspendedResponse: unknown } } }>;
    };
    forgedSuspension.rooms[0]!.game.afterMove.suspendedResponse = structuredClone(tianxiangPrompt);
    expect(await load(forgedSuspension)).toMatchObject({ kind: "invalid" });
  });

  it("round-trips a Liegong prompt and rejects forged Slash provenance or eligibility", async () => {
    const playerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    let game = createGame({ playerIds, seed: "f".padStart(64, "0") });
    const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
    const target = game.players.find((player) => player.id !== actor.id)!;
    game.discardPile.push(...game.players.flatMap((player) => player.hand));
    for (const player of game.players) {
      player.hand = [];
      player.equipment = {};
      player.judgment = [];
      player.extraPiles = {};
      player.generalId = "gan_ning";
      player.alive = true;
      player.hp = 4;
      player.maxHp = 4;
    }
    actor.generalId = "huang_zhong";
    actor.hand = [standardCard("persisted-liegong-slash", "slash")];
    target.hand = [standardCard("persisted-liegong-dodge", "dodge")];
    game.pendingResponse = null;
    game.resolvingCards = [];
    game.currentPlayerId = actor.id;
    game.turn = {
      ...game.turn,
      playerId: actor.id,
      phase: "play",
      slashUsed: false,
      requiredDiscardCount: 0,
    };
    game = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "persisted-liegong-slash",
      targetId: target.id,
    });
    if (game.pendingResponse?.type !== "standard_skill" || game.pendingResponse.skillId !== "liegong") {
      throw new Error("Missing persisted Liegong fixture");
    }
    const snapshot: RoomServiceSnapshot = {
      version: 1,
      rooms: [{
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        name: "烈弓重连",
        ownerId: actor.id,
        status: "playing",
        maxPlayers: 3,
        createdAt: new Date().toISOString(),
        players: game.players.map((player) => ({
          id: player.id,
          username: `player-${player.seat}`,
          displayName: `player-${player.seat}`,
          ready: true,
          connected: false,
          seat: player.seat,
        })),
        game,
      }],
    };

    const load = (candidate: unknown) => loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({ rows: [{ snapshot: candidate }] }) as Pool["query"],
    ));
    expect(await load(snapshot)).toMatchObject({
      kind: "valid",
      snapshot: { rooms: [{ game: { pendingResponse: {
        type: "standard_skill",
        skillId: "liegong",
        targetId: actor.id,
        slash: {
          liegongChecked: true,
          useProvenance: { method: "use", turnPlayerId: actor.id, phase: "play" },
        },
      } } }] },
    });

    const forgedPhase = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { slash: { useProvenance: { phase: string } } } } }>;
    };
    forgedPhase.rooms[0]!.game.pendingResponse.slash.useProvenance.phase = "respond";
    expect(await load(forgedPhase)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Liegong prompt"),
    });

    const forgedTurnOwner = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { slash: { useProvenance: { turnPlayerId: string } } } } }>;
    };
    forgedTurnOwner.rooms[0]!.game.pendingResponse.slash.useProvenance.turnPlayerId = target.id;
    expect(await load(forgedTurnOwner)).toMatchObject({ kind: "invalid" });

    const forgedProgress = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { slash: { liegongChecked: boolean } } } }>;
    };
    forgedProgress.rooms[0]!.game.pendingResponse.slash.liegongChecked = false;
    expect(await load(forgedProgress)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Liegong prompt"),
    });

    const forgedPrompt = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { pendingResponse: { promptId: string } } }>;
    };
    forgedPrompt.rooms[0]!.game.pendingResponse.promptId += ":stale";
    expect(await load(forgedPrompt)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("prompt metadata"),
    });

    const ineligible = structuredClone(snapshot) as unknown as {
      rooms: Array<{ game: { deck: Card[]; players: Array<{ id: string; hand: Card[] }> } }>;
    };
    const extraTargetCard = ineligible.rooms[0]!.game.deck.pop();
    if (!extraTargetCard) throw new Error("Missing deck card for Liegong eligibility tamper");
    ineligible.rooms[0]!.game.players.find((player) => player.id === target.id)!.hand.push(extraTargetCard);
    expect(await load(ineligible)).toMatchObject({
      kind: "invalid", reason: expect.stringContaining("Liegong prompt"),
    });
  });

  it("rejects an incomplete game before RoomService restoration", async () => {
    const pool = poolWithQuery(vi.fn().mockResolvedValue({
      rows: [{
        snapshot: {
          version: 1,
          rooms: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "损坏对局",
            ownerId: "11111111-1111-4111-8111-111111111111",
            status: "playing",
            maxPlayers: 2,
            createdAt: new Date().toISOString(),
            players: [{
              id: "11111111-1111-4111-8111-111111111111",
              username: "owner",
              displayName: "owner",
              ready: true,
              connected: false,
              seat: 0,
            }],
            game: { version: 1 },
          }],
        },
      }],
    }) as Pool["query"]);

    const result = await loadRoomSnapshot(pool);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.reason).toContain("Required");
  });

  it("restores healthy rooms when another room in the legacy snapshot is invalid", async () => {
    const healthyRoom = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "健康房间",
      gameType: "sanguosha" as const,
      ownerId: "11111111-1111-4111-8111-111111111111",
      status: "waiting" as const,
      maxPlayers: 2,
      botIntelligence: 3 as const,
      botMode: "rules" as const,
      createdAt: new Date().toISOString(),
      ruleConfig: structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG),
      players: [{
        id: "11111111-1111-4111-8111-111111111111",
        username: "healthy-owner",
        displayName: "健康房主",
        ready: false,
        connected: false,
        seat: 0,
        isBot: false,
        departed: false,
      }],
    };
    const invalidRoom = {
      ...structuredClone(healthyRoom),
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ownerId: "22222222-2222-4222-8222-222222222222",
      name: "",
      players: [{
        ...structuredClone(healthyRoom.players[0]!),
        id: "22222222-2222-4222-8222-222222222222",
      }],
    };
    const result = await loadRoomSnapshot(poolWithQuery(
      vi.fn().mockResolvedValue({
        rows: [{ snapshot: { version: 1, rooms: [healthyRoom, invalidRoom] } }],
      }) as Pool["query"],
    ));

    expect(result).toMatchObject({
      kind: "partial",
      snapshot: { rooms: [{ id: healthyRoom.id }] },
      invalidRooms: [{ snapshot: { id: invalidRoom.id } }],
    });
  });

  it("loads per-room rows independently and quarantines only later user conflicts", async () => {
    const first = waitingRoom();
    const conflicting = waitingRoom(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      first.ownerId,
    );
    const malformed = { ...waitingRoom("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), name: "" };
    const result = await loadRoomSnapshotEntries(poolWithQuery(
      vi.fn().mockResolvedValue({
        rows: [
          { room_id: first.id, snapshot: first },
          { room_id: conflicting.id, snapshot: conflicting },
          { room_id: malformed.id, snapshot: malformed },
        ],
      }) as Pool["query"],
    ));

    expect(result).toMatchObject({
      kind: "entries",
      entries: [{ roomId: first.id, source: "room_state_entry" }],
      invalidEntries: [
        { roomId: conflicting.id, reason: "User appears in multiple rooms" },
        { roomId: malformed.id, source: "room_state_entry" },
      ],
    });
  });

  it("imports legacy room_state one room at a time when no per-room rows exist", async () => {
    const healthy = waitingRoom();
    const malformed = { ...waitingRoom("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), name: "" };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ snapshot: { version: 1, rooms: [healthy, malformed] } }],
      });

    const result = await loadRoomSnapshotEntries(poolWithQuery(query as Pool["query"]));

    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      kind: "entries",
      entries: [{ roomId: healthy.id, source: "legacy_room_state" }],
      invalidEntries: [{ roomId: malformed.id, source: "legacy_room_state" }],
    });
  });

  it("isolates a runtime-only restore failure without discarding an earlier healthy room", async () => {
    const healthy = waitingRoom();
    const unsupportedBotRoom = {
      ...waitingRoom(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "22222222-2222-4222-8222-222222222222",
      ),
      gameType: "number_connect" as const,
      maxPlayers: 2,
      players: [
        ...waitingRoom(
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "22222222-2222-4222-8222-222222222222",
        ).players,
        {
          id: "33333333-3333-4333-8333-333333333333",
          username: "unsupported-bot",
          displayName: "拆弹机器人",
          ready: false,
          connected: false,
          seat: 1,
          isBot: true,
          departed: false,
        },
      ],
    };
    const loaded = await loadRoomSnapshotEntries(poolWithQuery(
      vi.fn().mockResolvedValue({
        rows: [
          { room_id: healthy.id, snapshot: healthy },
          { room_id: unsupportedBotRoom.id, snapshot: unsupportedBotRoom },
        ],
      }) as Pool["query"],
    ));
    if (loaded.kind !== "entries") throw new Error("Expected per-room entries");

    const selected = selectRestorableRoomSnapshotEntries(
      loaded.entries,
      (snapshot) => new RoomService().restoreSnapshot(snapshot),
    );

    expect(selected.entries.map((entry) => entry.roomId)).toEqual([healthy.id]);
    expect(selected.invalidEntries).toMatchObject([
      {
        roomId: unsupportedBotRoom.id,
        reason: expect.stringContaining("bot unsupported"),
      },
    ]);
  });

  it("moves only the invalid per-room row into the per-room quarantine", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await quarantineRoomSnapshotEntry(poolWithQuery(query as Pool["query"]), {
      roomId,
      storageRoomId: roomId,
      rawSnapshot: { id: roomId, broken: true },
      source: "room_state_entry",
      reason: "broken room",
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("room_state_entry_quarantine");
    expect(query.mock.calls[0]?.[0]).toContain("DELETE FROM room_state_entry");
    expect(query.mock.calls[0]?.[1]).toContain(roomId);
  });

  it("coalesces queued mutations to the newest snapshot", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    let releaseSecondWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    const secondWrite = new Promise<void>((resolve) => { releaseSecondWrite = resolve; });
    const query = vi.fn()
      .mockImplementationOnce(async () => {
        await firstWrite;
        return { rows: [] };
      })
      .mockImplementationOnce(async () => {
        await secondWrite;
        return { rows: [] };
      });
    const writer = new RoomSnapshotWriter(poolWithQuery(query as Pool["query"]), vi.fn());
    const first = { version: 1, rooms: [], marker: "first" } as unknown as RoomServiceSnapshot;
    const middle = { version: 1, rooms: [], marker: "middle" } as unknown as RoomServiceSnapshot;
    const newest = { version: 1, rooms: [], marker: "newest" } as unknown as RoomServiceSnapshot;

    let persisted = false;
    const firstBarrier = writer.enqueue(first).then(() => { persisted = true; });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    const middleBarrier = writer.enqueue(middle);
    const newestBarrier = writer.enqueue(newest);
    expect(middleBarrier).toBe(newestBarrier);
    releaseFirstWrite?.();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(persisted).toBe(false);
    releaseSecondWrite?.();
    await Promise.all([firstBarrier, newestBarrier]);
    await writer.flush();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([
      JSON.stringify(newest.rooms),
      JSON.stringify(newest),
    ]);
  });
});
