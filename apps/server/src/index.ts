import { fileURLToPath } from "node:url";
import path from "node:path";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  RoomManager,
  demoSongs,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@slay-it/shared";

const app = express();
const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: true, credentials: true },
});
const rooms = new RoomManager((code, state) => io.to(code).emit("state", state));

app.use(cors());
app.use(express.json());
app.get("/health", (_request, response) => {
  response.json({ ok: true });
});
app.get("/api/songs", (_request, response) => {
  response.json(demoSongs);
});

if (process.env.NODE_ENV === "production") {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(directory));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
    response.sendFile(path.join(directory, "index.html"));
  });
}

io.on("connection", (socket) => {
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Ocurrió un error inesperado";
  const roomCode = () => {
    if (!socket.data.roomCode) throw new Error("No estás en una sala");
    return socket.data.roomCode;
  };
  const leaveCurrentRoom = () => {
    const current = socket.data.roomCode;
    if (!current) return;
    rooms.disconnect(current, socket.id);
    socket.leave(current);
    socket.data.roomCode = undefined;
  };

  socket.on("room:create", (name, acknowledge) => {
    try {
      leaveCurrentRoom();
      const state = rooms.create(socket.id, name);
      socket.data.roomCode = state.code;
      socket.join(state.code);
      io.to(state.code).emit("state", state);
      acknowledge({ ok: true, data: { code: state.code } });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("room:join", ({ code, name }, acknowledge) => {
    try {
      leaveCurrentRoom();
      const state = rooms.join(code, socket.id, name);
      socket.data.roomCode = state.code;
      socket.join(state.code);
      io.to(state.code).emit("state", state);
      acknowledge({ ok: true, data: { code: state.code } });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("config:set", (config, acknowledge) => {
    try {
      rooms.configure(roomCode(), socket.id, config);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("game:start", (acknowledge) => {
    try {
      rooms.start(roomCode(), socket.id);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("host:countdown", (acknowledge) => {
    try {
      rooms.startCountdown(roomCode(), socket.id);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("host:continue", (acknowledge) => {
    try {
      rooms.continue(roomCode(), socket.id);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("vote:cast", (yes, acknowledge) => {
    try {
      rooms.vote(roomCode(), socket.id, yes);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("host:resolve", (correct, acknowledge) => {
    try {
      rooms.resolveManually(roomCode(), socket.id, correct);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("playback:recalibrate", (deltaMs, acknowledge) => {
    try {
      rooms.recalibrate(roomCode(), socket.id, deltaMs);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: errorMessage(error) });
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const deleted = rooms.disconnect(code, socket.id);
    if (deleted) {
      io.to(code).emit("error", "La sala se cerró porque el host se desconectó");
      io.in(code).socketsLeave(code);
    }
  });
});

httpServer.listen(3001, "0.0.0.0", () => {
  console.log("Slay It server escuchando en http://0.0.0.0:3001");
});
