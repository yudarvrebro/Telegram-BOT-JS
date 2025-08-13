// worker.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (path === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        console.log("TG update:", JSON.stringify(update));

        if (!update.message) return new Response("ok");
        const msg = update.message;
        const chatId = String(msg.chat.id);
        const userId = String(msg.from.id);
        const username = msg.from.username || msg.from.first_name || "unknown";
        const textOrCaption = msg.text || msg.caption || null;

        if (typeof textOrCaption === "string" && textOrCaption.trim().startsWith("/start")) {
          await sendTelegram(env.BOT_TOKEN, chatId, "Ку)) Ты можешь отправить только одно сообщение, пиши кратко и информативно. После этого сообщения бот заблокирует тебя. Удачи!");
          return new Response("ok");
        }

        if (await env.MESSAGES.get(`sent:${userId}`)) {
          await sendTelegram(env.BOT_TOKEN, chatId, "Ты уже отправил сообщение. Новые не принимаются.");
          return new Response("ok");
        }

        const record = {
          message_id: msg.message_id || null,
          text: textOrCaption,
          date: new Date((msg.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          files: collectFiles(msg)
        };

        await env.MESSAGES.put(`msg:${userId}`, JSON.stringify(record));
        await env.MESSAGES.put(`sent:${userId}`, "1");

        const users = await getUsers(env);
        if (!users.some(u => String(u.id) === userId)) {
          users.push({ id: userId, username });
          await env.MESSAGES.put("users", JSON.stringify(users));
        }

        await sendTelegram(env.BOT_TOKEN, chatId, "Сообщение доставлено.");
        return new Response("ok");
      } catch (e) {
        console.error("webhook error:", e);
        return new Response("ok");
      }
    }

    if (path === "/" && request.method === "GET") {
      return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    if (path === "/api/users" && request.method === "GET") {
      const users = await getUsers(env);
      const enriched = [];
      for (const u of users) {
        const rec = await env.MESSAGES.get(`msg:${u.id}`);
        let hasText = false, hasFiles = false;
        if (rec) {
          try {
            const p = JSON.parse(rec);
            hasText = !!p.text;
            hasFiles = Array.isArray(p.files) && p.files.length > 0;
          } catch {}
        }
        enriched.push({ ...u, hasText, hasFiles });
      }
      return json(enriched);
    }

    if (path.startsWith("/api/read/") && request.method === "POST") {
      const userId = path.split("/").pop();
      await sendTelegram(env.BOT_TOKEN, userId, "Ваше сообщение прочитано ✅");
      return json({ success: true });
    }

    if (path.startsWith("/api/delete/") && request.method === "DELETE") {
      const userId = path.split("/").pop();
      const users = (await getUsers(env)).filter(u => String(u.id) !== String(userId));
      await env.MESSAGES.put("users", JSON.stringify(users));
      await env.MESSAGES.delete(`msg:${userId}`);
      await env.MESSAGES.delete(`sent:${userId}`);
      return json({ success: true });
    }

    if (path.startsWith("/api/message/") && request.method === "GET") {
      const userId = path.split("/").pop();
      const rec = await env.MESSAGES.get(`msg:${userId}`);
      if (!rec) return json(null);

      let parsed;
      try { parsed = JSON.parse(rec); } catch { return json(null); }

      if (Array.isArray(parsed.files) && parsed.files.length > 0) {
        for (let f of parsed.files) {
          try {
            const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${f.file_id}`);
            const tgJson = await tgRes.json();
            if (tgJson.ok && tgJson.result.file_path) {
              f.url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgJson.result.file_path}`;
            }
          } catch (err) {
            console.error("Ошибка получения ссылки файла:", err);
          }
        }
      }
      return json(parsed);
    }

    return new Response("Not Found", { status: 404 });
  }
};

function cors(contentType = "application/json") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": contentType
  };
}
function json(obj) {
  return new Response(JSON.stringify(obj), { headers: cors() });
}
async function getUsers(env) {
  const raw = await env.MESSAGES.get("users");
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function sendTelegram(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(chatId), text })
  });
}
function collectFiles(msg) {
  const files = [];
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const largest = msg.photo[msg.photo.length - 1];
    files.push({ type: "photo", file_id: largest.file_id });
  }
  if (msg.document) files.push({ type: "document", file_id: msg.document.file_id, file_name: msg.document.file_name || null });
  if (msg.video) files.push({ type: "video", file_id: msg.video.file_id });
  if (msg.audio) files.push({ type: "audio", file_id: msg.audio.file_id });
  if (msg.voice) files.push({ type: "voice", file_id: msg.voice.file_id });
  if (msg.sticker) files.push({ type: "sticker", file_id: msg.sticker.file_id });
  return files;
}

const ADMIN_HTML = `
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Админка — Telegram Bot</title>
<style>
  body { font-family: system-ui, -apple-system, Arial, sans-serif; padding: 20px; max-width: 860px; margin: 0 auto; }
  h1 { margin: 0 0 16px; }
  .toolbar { margin-bottom: 12px; }
  .user { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
  .user strong { min-width: 220px; display: inline-block; }
  .pill { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; color: #334155; }
  button { cursor: pointer; }
  .muted { color: #94a3b8; }
</style>
</head>
<body>
  <h1>История сообщений</h1>
  <div class="toolbar">
    <button id="reload">Загрузить пользователей</button>
  </div>
  <div id="list">Нажмите «Загрузить пользователей»</div>

  <script>
    async function api(path, opts) {
      const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    function row(u) {
      const div = document.createElement('div');
      div.className = 'user';
      const name = document.createElement('strong');
      name.textContent = u.username + ' (' + u.id + ')';
      const info = document.createElement('span');
      info.className = 'pill';
      info.textContent = (u.hasText ? 'текст' : 'без текста') + (u.hasFiles ? ' + файлы' : '');
      const view = document.createElement('button');
      view.textContent = 'Показать сообщение';
      view.onclick = async () => {
        const m = await api('/api/message/' + u.id);
        if (!m) return alert('Нет данных');
        let html = '<h2>Сообщение от ' + u.username + '</h2>';
        if (m.text) html += '<p>' + m.text + '</p>';
        if (Array.isArray(m.files)) {
          m.files.forEach(f => {
            if (f.url) {
              if (f.type === 'photo') html += '<img src="' + f.url + '" style="max-width:300px; display:block; margin-bottom:10px;">';
              else html += '<p><a href="' + f.url + '" target="_blank">' + (f.file_name || f.type) + '</a></p>';
            }
          });
        }
        const w = window.open('', 'msg', 'width=600,height=400');
        w.document.write(html);
      };
      const read = document.createElement('button');
      read.textContent = '✅';
      read.onclick = async () => { await fetch('/api/read/' + u.id, { method: 'POST' }); reload(); };
      const del = document.createElement('button');
      del.textContent = '❌';
      del.onclick = async () => {
        if (!confirm('Удалить пользователя и его сообщение?')) return;
        await fetch('/api/delete/' + u.id, { method: 'DELETE' });
        reload();
      };
      const spacer = document.createElement('span');
      spacer.className = 'muted';
      spacer.textContent = '—';
      div.append(name, spacer, info, view, read, del);
      return div;
    }

    async function reload() {
      const list = document.getElementById('list');
      list.textContent = 'Загрузка...';
      try {
        const users = await api('/api/users');
        if (!users.length) { list.textContent = 'Пока никто не писал'; return; }
        list.innerHTML = '';
        users.forEach(u => list.appendChild(row(u)));
      } catch (e) {
        list.textContent = 'Ошибка: ' + e.message;
      }
    }

    document.getElementById('reload').addEventListener('click', reload);
  </script>
</body>
</html>
`;
