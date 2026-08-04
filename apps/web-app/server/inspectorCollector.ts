import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import {
  INSPECTOR_CLEAR_PATH,
  INSPECTOR_EVENTS_PATH,
  INSPECTOR_STREAM_PATH,
  parseInspectorEventInput,
} from "../src/devtools/inspectorEvents";
import type {
  InspectorEvent,
  InspectorEventInput,
} from "../src/devtools/inspectorEvents";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_EVENTS = 5_000;
const DEFAULT_LIMIT = 500;
const HEARTBEAT_INTERVAL_MS = 25_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isInspectorChannel = (
  value: string | null,
): value is InspectorEvent["channel"] => {
  return value === "nostr" || value === "cashu" || value === "evolu";
};

const parseNumber = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseLimit = (value: string | null): number => {
  const parsed = parseNumber(value, DEFAULT_LIMIT);
  return Math.min(MAX_EVENTS, Math.max(0, Math.floor(parsed)));
};

const setCorsHeaders = (res: ServerResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
};

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  value: unknown,
): void => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
};

const readRequestBody = (
  req: Connect.IncomingMessage,
): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let settled = false;

    req.on("data", (chunk: unknown) => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk)) {
        settled = true;
        reject(new Error("Unexpected request body chunk"));
        return;
      }

      byteLength += chunk.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        settled = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
};

const formatSseEvent = (event: InspectorEvent): string => {
  return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
};

export const inspectorCollector = (): Plugin => ({
  name: "inspector-collector",
  apply: "serve",
  async configureServer(server) {
    const inspectorDirectory = path.join(server.config.root, ".inspector");
    // Per-port filename so parallel dev servers (dev :5173, dev:prod :5175,
    // Playwright :5174) don't truncate and interleave each other's file.
    const port = server.config.server.port ?? 5173;
    const eventsFile = path.join(inspectorDirectory, `events-${port}.ndjson`);
    const events: InspectorEvent[] = [];
    const clients = new Set<ServerResponse>();
    let nextSeq = 1;
    let fileQueue = Promise.resolve();

    await fs.mkdir(inspectorDirectory, { recursive: true });
    await fs.writeFile(eventsFile, "", "utf8");

    const queueFileOperation = (
      operation: () => Promise<void>,
    ): Promise<void> => {
      const result = fileQueue.then(operation);
      fileQueue = result.catch(() => undefined);
      return result;
    };

    const writeToClient = (client: ServerResponse, value: string): void => {
      if (client.destroyed || client.writableEnded) {
        clients.delete(client);
        return;
      }
      try {
        client.write(value);
      } catch {
        clients.delete(client);
        client.end();
      }
    };

    const broadcast = (event: InspectorEvent): void => {
      const frame = formatSseEvent(event);
      for (const client of clients) writeToClient(client, frame);
    };

    const heartbeat = setInterval(() => {
      for (const client of clients) writeToClient(client, ":hb\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    server.httpServer?.once("close", () => {
      clearInterval(heartbeat);
      for (const client of clients) client.end();
      clients.clear();
    });

    const middleware = async (
      req: Connect.IncomingMessage,
      res: ServerResponse,
      next: Connect.NextFunction,
    ): Promise<void> => {
      const requestUrl = req.url ?? "";
      if (!requestUrl.startsWith("/__inspector")) return next();

      setCorsHeaders(res);
      const parsedUrl = new URL(requestUrl, "http://localhost");
      const requestPath = parsedUrl.pathname;
      const isInspectorEndpoint =
        requestPath === INSPECTOR_EVENTS_PATH ||
        requestPath === INSPECTOR_STREAM_PATH ||
        requestPath === INSPECTOR_CLEAR_PATH;

      if (req.method === "OPTIONS" && isInspectorEndpoint) {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === "POST" && requestPath === INSPECTOR_EVENTS_PATH) {
        try {
          const body = await readRequestBody(req);
          if (body === null) {
            sendJson(res, 413, { error: "Request body is too large" });
            return;
          }

          let value: unknown;
          try {
            value = JSON.parse(body);
          } catch {
            sendJson(res, 400, { error: "Invalid JSON" });
            return;
          }

          if (!isRecord(value) || !Array.isArray(value.events)) {
            sendJson(res, 400, { error: "Expected an events array" });
            return;
          }

          const acceptedEvents: InspectorEvent[] = [];
          for (const eventValue of value.events) {
            const input: InspectorEventInput | null =
              parseInspectorEventInput(eventValue);
            if (!input) continue;
            const event: InspectorEvent = { ...input, seq: nextSeq };
            nextSeq += 1;
            events.push(event);
            acceptedEvents.push(event);
          }

          if (events.length > MAX_EVENTS) {
            events.splice(0, events.length - MAX_EVENTS);
          }

          if (acceptedEvents.length > 0) {
            const ndjson = acceptedEvents
              .map((event) => `${JSON.stringify(event)}\n`)
              .join("");
            await queueFileOperation(() =>
              fs.appendFile(eventsFile, ndjson, "utf8"),
            );
            for (const event of acceptedEvents) broadcast(event);
          }

          res.statusCode = 204;
          res.end();
        } catch (error) {
          server.config.logger.error(
            `Inspector event collection failed: ${String(error)}`,
          );
          if (!res.headersSent) {
            sendJson(res, 500, { error: "Could not collect events" });
          } else {
            res.end();
          }
        }
        return;
      }

      if (req.method === "GET" && requestPath === INSPECTOR_EVENTS_PATH) {
        const since = parseNumber(parsedUrl.searchParams.get("since"), 0);
        const limit = parseLimit(parsedUrl.searchParams.get("limit"));
        const requestedChannel = parsedUrl.searchParams.get("channel");
        const channel = isInspectorChannel(requestedChannel)
          ? requestedChannel
          : null;
        const client = parsedUrl.searchParams.get("client");
        const matchingEvents = events
          .filter(
            (event) =>
              event.seq > since &&
              (channel === null || event.channel === channel) &&
              (client === null || event.client === client),
          )
          .slice(0, limit);
        const lastSeq = nextSeq - 1;
        sendJson(res, 200, { events: matchingEvents, lastSeq });
        return;
      }

      if (req.method === "GET" && requestPath === INSPECTOR_STREAM_PATH) {
        const lastEventIdHeader = req.headers["last-event-id"];
        const lastEventId = Array.isArray(lastEventIdHeader)
          ? lastEventIdHeader[0]
          : lastEventIdHeader;
        const cursor =
          lastEventId === undefined
            ? parseNumber(parsedUrl.searchParams.get("since"), 0)
            : parseNumber(lastEventId, 0);

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.flushHeaders();
        for (const event of events) {
          if (event.seq > cursor) writeToClient(res, formatSseEvent(event));
        }
        clients.add(res);
        req.once("close", () => clients.delete(res));
        return;
      }

      if (req.method === "POST" && requestPath === INSPECTOR_CLEAR_PATH) {
        try {
          events.length = 0;
          await queueFileOperation(() => fs.writeFile(eventsFile, "", "utf8"));
          res.statusCode = 204;
          res.end();
        } catch (error) {
          server.config.logger.error(
            `Inspector clear failed: ${String(error)}`,
          );
          sendJson(res, 500, { error: "Could not clear events" });
        }
        return;
      }

      res.statusCode = 404;
      res.end("Not found");
    };

    server.middlewares.use(middleware);
  },
});
