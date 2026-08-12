/**
 * Prueba E2E: canción real + multijugador host/2 jugadores.
 * Usa solo pedro-fernandez-yo-el-aventurero (canción ya del proyecto).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.SLAY_BASE_URL ?? "http://localhost:5173/";
const OUT = path.resolve("scripts/e2e-artifacts");
fs.mkdirSync(OUT, { recursive: true });

function log(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, ok, detail };
}

async function dump(page, label) {
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500);
  const status = await page.locator(".connection").innerText().catch(() => "?");
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true }).catch(() => {});
  return { body, status };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const results = [];
  const hostCtx = await browser.newContext();
  const p1Ctx = await browser.newContext();
  const p2Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const p1 = await p1Ctx.newPage();
  const p2 = await p2Ctx.newPage();
  const hostLogs = [];
  const p1Logs = [];
  host.on("console", (msg) => hostLogs.push(`[${msg.type()}] ${msg.text()}`));
  host.on("pageerror", (err) => hostLogs.push(`[pageerror] ${err.message}`));
  p1.on("console", (msg) => p1Logs.push(`[${msg.type()}] ${msg.text()}`));
  p1.on("pageerror", (err) => p1Logs.push(`[pageerror] ${err.message}`));

  try {
    const audioRes = await hostCtx.request.head(`${BASE}audio/pedro-fernandez-yo-el-aventurero.mp3`);
    results.push(log("MP3 público 200", audioRes.ok(), `status=${audioRes.status()}`));

    await host.goto(BASE, { waitUntil: "networkidle" });
    results.push(log("Supabase .env presente", (await host.getByText("Configura Supabase").count()) === 0));

    await host.getByRole("button", { name: /Crear sala/i }).click();
    await host.getByText("Voces listas").waitFor({ timeout: 15_000 });
    // Esperar canal Realtime en vivo antes de unir jugadores
    await host.locator(".connection.is-online, .connection").filter({ hasText: /En vivo/i }).waitFor({ timeout: 20_000 }).catch(() => {});
    const hostLobby = await dump(host, "01-host-lobby");
    const roomCode = await host.evaluate(() => {
      const h1 = document.querySelector("h1");
      const t = (h1?.textContent || "").trim().toUpperCase();
      return /^[A-Z]{4}$/.test(t) ? t : null;
    });
    results.push(log("Host crea sala + código", Boolean(roomCode), `code=${roomCode} status=${hostLobby.status}`));
    results.push(log("Host canal En vivo", /En vivo/i.test(hostLobby.status), hostLobby.status));
    if (!roomCode) throw new Error("Sin código de sala");

    for (const [page, name, tag] of [
      [p1, "Ana", "02-p1"],
      [p2, "Bruno", "03-p2"],
    ]) {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#player-name").fill(name);
      await page.locator("#room-code").fill(roomCode);
      await page.getByRole("button", { name: /Entrar al escenario/i }).click();
      // Éxito = lobby jugador; fallo = notice de error en Home
      await Promise.race([
        page.getByText("Prueba de sonido").waitFor({ timeout: 20_000 }),
        page.locator(".notice").waitFor({ timeout: 20_000 }),
      ]);
      const snap = await dump(page, tag);
      const joined = /Prueba de sonido/i.test(snap.body);
      const err = /notice|no respondió|no se pudo|código/i.test(snap.body) && !joined;
      results.push(log(`Join ${name}`, joined, `status=${snap.status} joined=${joined} body=${snap.body.slice(0, 220)}`));
      if (err) results.push(log(`Join ${name} sin error de ack`, false, snap.body.slice(0, 220)));
    }

    await host.waitForTimeout(1500);
    const hostAfter = await dump(host, "04-host-after-joins");
    const hasAna = /Ana/i.test(hostAfter.body);
    const hasBruno = /Bruno/i.test(hostAfter.body);
    results.push(log("Host ve a Ana", hasAna, hostAfter.body.slice(0, 260)));
    results.push(log("Host ve a Bruno", hasBruno, hostAfter.body.slice(0, 260)));
    results.push(log("Host sigue En vivo tras joins", /En vivo/i.test(hostAfter.status), hostAfter.status));

    if (hasAna && hasBruno) {
      const selectEl = host.locator("select").first();
      await selectEl.selectOption("pedro-fernandez-yo-el-aventurero");
      results.push(log("Selecciona Yo el aventurero", true));
      await host.getByRole("button", { name: /Empezar show/i }).click();
      await host.getByText("Yo el aventurero").waitFor({ timeout: 15_000 });
      await host.waitForTimeout(3000);
      const ready = await dump(host, "05-host-ready");
      const audioReady = /Audio listo en la app/i.test(ready.body);
      results.push(log("Ready: canción real visible", /Pedro Fern/i.test(ready.body)));
      results.push(log("Ready: Audio listo en la app", audioReady, ready.body.slice(0, 280)));

      const probe = await host.evaluate(async () => {
        const url = new URL("/audio/pedro-fernandez-yo-el-aventurero.mp3", location.href).href;
        const a = new Audio(url);
        a.preload = "auto";
        await new Promise((resolve, reject) => {
          a.addEventListener("loadedmetadata", resolve, { once: true });
          a.addEventListener("error", () => reject(new Error("error")), { once: true });
          setTimeout(() => reject(new Error("timeout")), 10_000);
        });
        return { duration: a.duration, readyState: a.readyState };
      });
      results.push(log("Browser carga metadata MP3", probe.readyState >= 1, JSON.stringify(probe)));
      results.push(
        log(
          "Duración MP3 ≈ catálogo (181.44s)",
          Math.abs(probe.duration - 181.44) < 1,
          `mp3=${probe.duration.toFixed(2)} expected≈181.44`,
        ),
      );

      if (audioReady) {
        await host.getByRole("button", { name: /iniciar 3-2-1/i }).click();
        await host.waitForTimeout(4500);
        const playing = await dump(host, "06-host-playing");
        const phaseOk = /[123]|canta|turno|estrofa|apag|letra|calibr/i.test(playing.body);
        results.push(log("Countdown/playing sin crash", phaseOk, playing.body.slice(0, 240)));

        // Intentar detectar reproducción vía currentTime del Audio interno es limitado;
        // verificamos que no haya botón de autoplay nudge o error.
        results.push(log("Sin error visible en playing", !/ocurrió un error|no se pudo/i.test(playing.body)));
      }
    }

    fs.writeFileSync(
      path.join(OUT, "console.json"),
      JSON.stringify({ hostLogs: hostLogs.slice(-40), p1Logs: p1Logs.slice(-40) }, null, 2),
    );
  } catch (error) {
    results.push(log("E2E sin excepción", false, String(error)));
    await dump(host, "xx-host-error").catch(() => {});
    await dump(p1, "xx-p1-error").catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\nSUMMARY", { total: results.length, passed: results.length - failed.length, failed: failed.length });
  for (const f of failed) console.log("- FAIL:", f.name, "→", f.detail);
  process.exitCode = failed.length ? 1 : 0;
}

main();
