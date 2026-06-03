import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const isProd = process.argv.includes('--prod');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);

const materialFiles = {
  poster: 'poster.png',
  video: '0d44e1e4-289e-4934-a8e5-bacd9399f197-T720P.mp4',
  pdf: '党史_部分1(1).pdf',
  sheet: '1.xls',
};

const assetUrl = (fileName) => `/assets/${encodeURIComponent(fileName)}`;

const materials = [
  {
    id: 'poster-image',
    type: 'image',
    title: '小灰云海报',
    description: 'PNG 图片素材，适合作为场景背景或图层。',
    url: assetUrl(materialFiles.poster),
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.poster,
    meta: { size: '1401 x 1350', color: '#9c55f8' },
  },
  {
    id: 'demo-video',
    type: 'video',
    title: 'T720P 视频片段',
    description: 'MP4 视频素材，可拖入右侧拼接画布。',
    url: assetUrl(materialFiles.video),
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.video,
    meta: { duration: '302s', resolution: '854 x 480' },
  },
  {
    id: 'history-pdf',
    type: 'pdf',
    title: '党史图文 PDF',
    description: '10 页 PDF 文档素材，拖入场景后以文档卡片呈现。',
    url: assetUrl(materialFiles.pdf),
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.pdf,
    meta: { pages: '10', excerpt: '1949 年 11 月 1 日起，人民解放军向西南进军。' },
  },
  {
    id: 'sheet-data',
    type: 'datasource',
    title: '表格数据源',
    description: 'Excel 数据源，Sheet1 包含一列、两列两组样例数据。',
    url: assetUrl(materialFiles.sheet),
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.sheet,
    meta: { sheets: 'Sheet1 / Sheet2 / Sheet3', rows: '2' },
  },
  {
    id: 'history-text',
    type: 'text',
    title: 'PDF 摘录文本',
    description: '从 PDF 素材抽取的文字，可作为字幕或说明图层。',
    url: assetUrl(materialFiles.pdf),
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.pdf,
    meta: { text: '1948 年 11 月 2 日，沈阳解放。人民解放军攻占相关建筑。' },
  },
  {
    id: 'poster-website',
    type: 'website',
    title: '本地海报网页',
    description: '以素材图片构成的本地网页资源，用于验证 website 类型协议。',
    url: '/asset-site/poster',
    thumbnail: assetUrl(materialFiles.poster),
    sourceFile: materialFiles.poster,
    meta: { origin: 'local-node-route' },
  },
];

let sceneItems = [];

const app = express();
app.use(express.json({ limit: '128kb' }));
app.use('/assets', express.static(resolve(root, 'assets'), {
  fallthrough: false,
  immutable: false,
  maxAge: '1h',
}));

app.get('/api/materials', (_req, res) => {
  res.json({ materials });
});

app.get('/api/scene', (_req, res) => {
  res.json({ items: sceneItems });
});

app.post('/api/scene/reset', (_req, res) => {
  sceneItems = [];
  broadcast({ type: 'scene:snapshot', items: sceneItems });
  res.json({ ok: true });
});

app.get('/asset-site/poster', (_req, res) => {
  const poster = assetUrl(materialFiles.poster);
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>本地海报网页</title>
    <style>
      html, body { margin: 0; height: 100%; background: #111827; color: white; font-family: system-ui, sans-serif; }
      body { display: grid; place-items: center; }
      main { width: min(100vw, 980px); padding: 24px; }
      img { width: 100%; border-radius: 18px; box-shadow: 0 30px 90px rgb(0 0 0 / .45); }
      p { margin: 16px 0 0; color: #d1d5db; }
    </style>
  </head>
  <body>
    <main>
      <img src="${poster}" alt="小灰云海报" />
      <p>这是由 Node 服务提供的本地网页资源，内容来自 assets/poster.png。</p>
    </main>
  </body>
</html>`);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message, except) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function getMaterial(id) {
  return materials.find((material) => material.id === id);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeSceneItem(input) {
  if (!input || typeof input !== 'object') return null;
  const material = getMaterial(input.materialId);
  if (!material) return null;
  const instanceId = typeof input.instanceId === 'string' && input.instanceId.length <= 80
    ? input.instanceId
    : randomUUID();
  return {
    ...material,
    instanceId,
    materialId: material.id,
    x: isFiniteNumber(input.x) ? Math.max(0, Math.min(1280, input.x)) : 80,
    y: isFiniteNumber(input.y) ? Math.max(0, Math.min(720, input.y)) : 80,
    width: isFiniteNumber(input.width) ? Math.max(120, Math.min(640, input.width)) : 260,
    height: isFiniteNumber(input.height) ? Math.max(90, Math.min(420, input.height)) : 170,
    rotation: isFiniteNumber(input.rotation) ? Math.max(-30, Math.min(30, input.rotation)) : 0,
    zIndex: isFiniteNumber(input.zIndex) ? Math.max(1, Math.min(999, input.zIndex)) : sceneItems.length + 1,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
  };
}

function sanitizeMove(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.instanceId !== 'string') return null;
  if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) return null;
  return {
    instanceId: input.instanceId,
    x: Math.max(0, Math.min(1280, input.x)),
    y: Math.max(0, Math.min(720, input.y)),
  };
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'scene:snapshot', items: sceneItems }));

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      socket.send(JSON.stringify({ type: 'error', reason: 'invalid-json' }));
      return;
    }

    if (message.type === 'scene:add') {
      const item = sanitizeSceneItem(message.item);
      if (!item) {
        socket.send(JSON.stringify({ type: 'error', reason: 'invalid-scene-item' }));
        return;
      }
      sceneItems = [...sceneItems, item];
      broadcast({ type: 'scene:add', item });
      return;
    }

    if (message.type === 'scene:move') {
      const move = sanitizeMove(message.item);
      if (!move) return;
      sceneItems = sceneItems.map((item) => (
        item.instanceId === move.instanceId ? { ...item, x: move.x, y: move.y } : item
      ));
      broadcast({ type: 'scene:move', item: move });
      return;
    }

    if (message.type === 'scene:remove') {
      if (typeof message.instanceId !== 'string') return;
      const removed = sceneItems.find((item) => item.instanceId === message.instanceId);
      sceneItems = sceneItems.filter((item) => item.instanceId !== message.instanceId);
      broadcast({ type: 'scene:remove', instanceId: message.instanceId, item: removed || null });
      return;
    }

    if (message.type === 'library:return') {
      broadcast({
        type: 'library:return',
        materialId: typeof message.materialId === 'string' ? message.materialId : '',
        title: typeof message.title === 'string' ? message.title.slice(0, 80) : '',
      }, socket);
    }
  });
});

if (!isProd) {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(root, 'dist')));
  app.get(/.*/, (_req, res) => {
    res.sendFile(resolve(root, 'dist/index.html'));
  });
}

server.listen(port, host, () => {
  console.log(`Cross-screen drag app running at http://${host}:${port}`);
});
