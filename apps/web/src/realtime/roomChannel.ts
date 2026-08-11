import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RoomPublicState } from "@slay-it/shared";
import { getSupabaseClient } from "./client";
import { createPresenceLeaveGuard } from "./presenceGrace";
import {
  ACK_EVENT,
  COMMAND_EVENT,
  HOST_PRESENCE_KEY,
  STATE_EVENT,
  channelTopic,
  type RoomAck,
  type RoomCommand,
} from "./protocol";

export type ChannelStatus = "connecting" | "online" | "offline";

const READY_TIMEOUT_MS = 12_000;

function toStatus(raw: string): ChannelStatus {
  if (raw === "SUBSCRIBED") return "online";
  if (raw === "CLOSED" || raw === "CHANNEL_ERROR" || raw === "TIMED_OUT") return "offline";
  return "connecting";
}

function presenceKeys(channel: RealtimeChannel): Set<string> {
  return new Set(Object.keys(channel.presenceState()));
}

export interface HostChannelHandlers {
  onCommand: (command: RoomCommand, meta: { presenceKeys: Set<string> }) => void;
  onPlayerLeft: (playerId: string) => void;
  onStatusChange: (status: ChannelStatus, detail?: string) => void;
}

export interface HostChannel {
  broadcastState: (state: RoomPublicState) => void;
  broadcastAck: (ack: RoomAck) => void;
  close: () => void;
}

/**
 * Canal del anfitrión: recibe comandos y transmite estado.
 * Los leave de Presence pasan por una ventana de gracia para no expulsar
 * por un bloqueo breve de pantalla en el móvil.
 */
export function openHostChannel(code: string, handlers: HostChannelHandlers): HostChannel {
  const supabase = getSupabaseClient();
  // Asegura el websocket aunque ningún canal previo lo haya abierto.
  supabase.realtime.connect();

  const channel: RealtimeChannel = supabase.channel(channelTopic(code), {
    config: {
      broadcast: { self: false },
      presence: { key: HOST_PRESENCE_KEY, enabled: true },
    },
  });

  const leaveGuard = createPresenceLeaveGuard((playerId) => {
    handlers.onPlayerLeft(playerId);
  });

  channel
    .on("broadcast", { event: COMMAND_EVENT }, ({ payload }) => {
      handlers.onCommand(payload as RoomCommand, { presenceKeys: presenceKeys(channel) });
    })
    .on("presence", { event: "join" }, ({ key }: { key: string }) => {
      if (key !== HOST_PRESENCE_KEY) leaveGuard.notifyJoin(key);
    })
    .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
      if (key !== HOST_PRESENCE_KEY) leaveGuard.notifyLeave(key);
    })
    .subscribe((status, err) => {
      const next = toStatus(status);
      handlers.onStatusChange(next, err?.message);
      if (next === "online") void channel.track({ role: "host" });
    });

  return {
    broadcastState: (state) => {
      void channel.send({ type: "broadcast", event: STATE_EVENT, payload: state });
    },
    broadcastAck: (ack) => {
      void channel.send({ type: "broadcast", event: ACK_EVENT, payload: ack });
    },
    close: () => {
      leaveGuard.dispose();
      void supabase.removeChannel(channel);
    },
  };
}

export interface PlayerChannelHandlers {
  onState: (state: RoomPublicState) => void;
  onAck: (ack: RoomAck) => void;
  onHostLeft: () => void;
  onStatusChange: (status: ChannelStatus, detail?: string) => void;
}

export interface PlayerChannel {
  sendCommand: (command: RoomCommand) => void;
  /** Resuelve cuando el canal está SUBSCRIBED y el track de presencia terminó. */
  whenReady: () => Promise<void>;
  close: () => void;
}

/**
 * Canal de un jugador. El leave del host también usa gracia breve para
 * no cerrar la sala por un parpadeo de red del anfitrión.
 */
export function openPlayerChannel(
  code: string,
  playerId: string,
  handlers: PlayerChannelHandlers,
): PlayerChannel {
  const supabase = getSupabaseClient();
  supabase.realtime.connect();

  const channel: RealtimeChannel = supabase.channel(channelTopic(code), {
    config: {
      broadcast: { self: false },
      presence: { key: playerId, enabled: true },
    },
  });

  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  let readySettled = false;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (readySettled) return;
      readySettled = true;
      resolve();
    };
    rejectReady = (error) => {
      if (readySettled) return;
      readySettled = true;
      reject(error);
    };
  });

  const readyTimer = setTimeout(() => {
    rejectReady?.(
      new Error(
        "No se pudo conectar a tiempo. Pide al anfitrión que recargue la sala hasta ver «En vivo» e inténtalo de nuevo.",
      ),
    );
  }, READY_TIMEOUT_MS);

  const settleOk = () => {
    clearTimeout(readyTimer);
    resolveReady?.();
  };
  const settleErr = (message: string) => {
    clearTimeout(readyTimer);
    rejectReady?.(new Error(message));
  };

  const hostLeaveGuard = createPresenceLeaveGuard(() => {
    handlers.onHostLeft();
  });

  channel
    .on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
      handlers.onState(payload as RoomPublicState);
    })
    .on("broadcast", { event: ACK_EVENT }, ({ payload }) => {
      handlers.onAck(payload as RoomAck);
    })
    .on("presence", { event: "join" }, ({ key }: { key: string }) => {
      if (key === HOST_PRESENCE_KEY) hostLeaveGuard.notifyJoin(key);
    })
    .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
      if (key === HOST_PRESENCE_KEY) hostLeaveGuard.notifyLeave(key);
    })
    .subscribe((status, err) => {
      const next = toStatus(status);
      handlers.onStatusChange(next, err?.message);
      if (next === "online") {
        void channel.track({ role: "player" }).then(settleOk, settleOk);
      } else if (next === "offline") {
        settleErr(
          err?.message ??
            "No se pudo unir a la sala. Pide al anfitrión que recargue y muestre «En vivo».",
        );
      }
    });

  return {
    sendCommand: (command) => {
      void channel.send({ type: "broadcast", event: COMMAND_EVENT, payload: command });
    },
    whenReady: () => readyPromise,
    close: () => {
      clearTimeout(readyTimer);
      hostLeaveGuard.dispose();
      void supabase.removeChannel(channel);
    },
  };
}
