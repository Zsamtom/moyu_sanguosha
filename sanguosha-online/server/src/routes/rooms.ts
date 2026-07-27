import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import {
  chooseGeneralSchema,
  chooseGodFactionSchema,
  createRoomSchema,
  gameActionEnvelopeSchema,
  readySchema,
  roomIdSchema,
} from "../room-schemas.js";
import type { RoomService } from "../rooms.js";
import type { UserStore } from "../users.js";

export function createRoomsRouter(users: UserStore, rooms: RoomService): Router {
  const router = Router();
  router.use(requireAuth(users));

  router.get("/", (_request, response) => {
    response.json({ rooms: rooms.list(), currentRoom: rooms.getForUser(currentUser(response).id) ?? null });
  });

  router.post("/", asyncHandler(async (request, response) => {
    const room = rooms.create(currentUser(response), createRoomSchema.parse(request.body));
    await rooms.waitForPersistence();
    response.status(201).json({ room });
  }));

  router.post("/:id/join", asyncHandler(async (request, response) => {
    const room = rooms.join(roomIdSchema.parse(request.params.id), currentUser(response));
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/leave", asyncHandler(async (request, response) => {
    rooms.leave(roomIdSchema.parse(request.params.id), currentUser(response).id);
    await rooms.waitForPersistence();
    response.status(204).end();
  }));

  router.post("/:id/ready", asyncHandler(async (request, response) => {
    const user = currentUser(response);
    const { ready } = readySchema.parse(request.body);
    const room = rooms.setReady(roomIdSchema.parse(request.params.id), user.id, ready);
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/start", asyncHandler(async (request, response) => {
    const room = rooms.start(roomIdSchema.parse(request.params.id), currentUser(response).id);
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/rematch", asyncHandler(async (request, response) => {
    const room = rooms.requestRematch(
      roomIdSchema.parse(request.params.id),
      currentUser(response).id,
    );
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/draft/general", asyncHandler(async (request, response) => {
    const { generalId } = chooseGeneralSchema.parse(request.body);
    const room = rooms.chooseGeneral(roomIdSchema.parse(request.params.id), currentUser(response).id, generalId);
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/draft/god-faction", asyncHandler(async (request, response) => {
    const { faction } = chooseGodFactionSchema.parse(request.body);
    const room = rooms.chooseGodFaction(roomIdSchema.parse(request.params.id), currentUser(response).id, faction);
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/bots", asyncHandler(async (request, response) => {
    const room = rooms.addBot(roomIdSchema.parse(request.params.id), currentUser(response).id);
    await rooms.waitForPersistence();
    response.status(201).json({ room });
  }));

  router.delete("/:id/bots/:botId", asyncHandler(async (request, response) => {
    const room = rooms.removeBot(
      roomIdSchema.parse(request.params.id),
      currentUser(response).id,
      roomIdSchema.parse(request.params.botId),
    );
    await rooms.waitForPersistence();
    response.json({ room });
  }));

  router.post("/:id/actions", asyncHandler(async (request, response) => {
    const input = gameActionEnvelopeSchema.parse(request.body);
    const game = rooms.applyAction(roomIdSchema.parse(request.params.id), currentUser(response).id, input);
    await rooms.waitForPersistence();
    response.json({ game });
  }));

  router.post("/:id/llm-recommendation", asyncHandler(async (request, response) => {
    const recommendation = await rooms.recommendDoudizhuAction(
      roomIdSchema.parse(request.params.id),
      currentUser(response).id,
    );
    await rooms.waitForPersistence();
    response.set("Cache-Control", "no-store").json({ recommendation });
  }));

  return router;
}
