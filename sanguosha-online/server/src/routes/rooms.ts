import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { createRoomSchema, gameActionSchema, readySchema, roomIdSchema } from "../room-schemas.js";
import type { RoomService } from "../rooms.js";
import type { UserStore } from "../users.js";

export function createRoomsRouter(users: UserStore, rooms: RoomService): Router {
  const router = Router();
  router.use(requireAuth(users));

  router.get("/", (_request, response) => {
    response.json({ rooms: rooms.list(), currentRoom: rooms.getForUser(currentUser(response).id) ?? null });
  });

  router.post("/", (request, response) => {
    const room = rooms.create(currentUser(response), createRoomSchema.parse(request.body));
    response.status(201).json({ room });
  });

  router.post("/:id/join", (request, response) => {
    const room = rooms.join(roomIdSchema.parse(request.params.id), currentUser(response));
    response.json({ room });
  });

  router.post("/:id/leave", (request, response) => {
    rooms.leave(roomIdSchema.parse(request.params.id), currentUser(response).id);
    response.status(204).end();
  });

  router.post("/:id/ready", (request, response) => {
    const user = currentUser(response);
    const { ready } = readySchema.parse(request.body);
    const room = rooms.setReady(roomIdSchema.parse(request.params.id), user.id, ready);
    response.json({ room });
  });

  router.post("/:id/start", (request, response) => {
    const room = rooms.start(roomIdSchema.parse(request.params.id), currentUser(response).id);
    response.json({ room });
  });

  router.post("/:id/bots", (request, response) => {
    const room = rooms.addBot(roomIdSchema.parse(request.params.id), currentUser(response).id);
    response.status(201).json({ room });
  });

  router.delete("/:id/bots/:botId", (request, response) => {
    const room = rooms.removeBot(
      roomIdSchema.parse(request.params.id),
      currentUser(response).id,
      roomIdSchema.parse(request.params.botId),
    );
    response.json({ room });
  });

  router.post("/:id/actions", asyncHandler(async (request, response) => {
    const action = gameActionSchema.parse(request.body);
    const game = rooms.applyAction(roomIdSchema.parse(request.params.id), currentUser(response).id, action);
    response.json({ game });
  }));

  return router;
}
