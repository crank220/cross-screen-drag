<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Database, FileText, Film, Globe2, Image, Layers3, MousePointer2, Type } from 'lucide-vue-next';
import { createFrameDragController } from '../composables/useFrameDrag';
import { WorkspaceSocket } from '../services/socket';
import type { DragPayload, HostBridgeMessage, MaterialType, SceneItem, SocketMessage } from '../types';

type FrameDragController = ReturnType<typeof createFrameDragController>;

const socket = new WorkspaceSocket();
const items = ref<SceneItem[]>([]);
const stage = ref<HTMLElement | null>(null);
const hoverTarget = ref(false);
let activeDrag: FrameDragController | null = null;

const layerCount = computed(() => items.value.length);

function iconForType(type: MaterialType) {
  return {
    image: Image,
    video: Film,
    pdf: FileText,
    datasource: Database,
    text: Type,
    website: Globe2,
  }[type];
}

function stagePoint(
  point: { clientX: number; clientY: number },
  size: { width: number; height: number },
) {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return { x: 60, y: 60 };
  return {
    x: Math.max(0, Math.min(rect.width - size.width, point.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height - size.height, point.clientY - rect.top)),
  };
}

function defaultSize(type: MaterialType) {
  if (type === 'video') return { width: 320, height: 190 };
  if (type === 'image' || type === 'website') return { width: 280, height: 210 };
  if (type === 'datasource') return { width: 300, height: 180 };
  return { width: 280, height: 150 };
}

function addItem(payload: DragPayload, point: { clientX: number; clientY: number }) {
  const size = defaultSize(payload.type);
  const position = stagePoint(point, size);
  socket.send({
    type: 'scene:add',
    item: {
      materialId: payload.material.id,
      instanceId: crypto.randomUUID(),
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      rotation: 0,
      zIndex: items.value.length + 1,
      createdAt: Date.now(),
    },
  });
}

function moveItem(instanceId: string, point: { clientX: number; clientY: number }) {
  const current = items.value.find((item) => item.instanceId === instanceId);
  const size = current
    ? { width: current.width, height: current.height }
    : { width: 120, height: 90 };
  const position = stagePoint(point, size);
  socket.send({ type: 'scene:move', item: { instanceId, ...position } });
}

function createPayload(item: SceneItem): DragPayload {
  return {
    id: `${item.instanceId}-${Date.now()}`,
    type: item.type,
    source: 'canvas',
    material: item,
    originInstanceId: item.instanceId,
  };
}

function onItemPointerDown(event: PointerEvent, item: SceneItem) {
  activeDrag = createFrameDragController({
    role: 'canvas',
    getPayload: () => createPayload(item),
  });
  activeDrag.begin(event);
}

function onItemPointerMove(event: PointerEvent) {
  activeDrag?.move(event);
}

function onItemPointerEnd(event: PointerEvent) {
  activeDrag?.end(event);
  activeDrag = null;
}

function onHostMessage(event: MessageEvent<HostBridgeMessage>) {
  if (event.origin !== window.location.origin || !event.data?.type) return;
  const message = event.data;
  if (message.type === 'drag:hover') {
    hoverTarget.value = message.target === 'canvas';
    return;
  }
  if (message.type === 'drag:drop' && message.payload && message.point) {
    if (message.payload.source === 'canvas' && message.payload.originInstanceId) {
      moveItem(message.payload.originInstanceId, message.point);
    } else {
      addItem(message.payload, message.point);
    }
  }
}

function relayHoverMove(event: PointerEvent | MouseEvent) {
  if (!hoverTarget.value) return;
  window.parent.postMessage({
    type: 'drag:move',
    frame: 'canvas',
    point: { clientX: event.clientX, clientY: event.clientY },
  }, window.location.origin);
}

function relayHoverEnd(event: PointerEvent | MouseEvent) {
  if (!hoverTarget.value) return;
  window.parent.postMessage({
    type: 'drag:end',
    frame: 'canvas',
    point: { clientX: event.clientX, clientY: event.clientY },
  }, window.location.origin);
}

function onSocketMessage(message: SocketMessage) {
  if (message.type === 'scene:snapshot') {
    items.value = message.items;
  }
  if (message.type === 'scene:add') {
    items.value = [...items.value, message.item];
  }
  if (message.type === 'scene:move') {
    items.value = items.value.map((item) => (
      item.instanceId === message.item.instanceId
        ? { ...item, x: message.item.x, y: message.item.y }
        : item
    ));
  }
  if (message.type === 'scene:remove') {
    items.value = items.value.filter((item) => item.instanceId !== message.instanceId);
  }
}

onMounted(() => {
  socket.connect();
  socket.onMessage(onSocketMessage);
  window.addEventListener('message', onHostMessage as EventListener);
  window.addEventListener('pointermove', relayHoverMove, true);
  window.addEventListener('pointerup', relayHoverEnd, true);
  window.addEventListener('pointercancel', relayHoverEnd, true);
  window.addEventListener('mousemove', relayHoverMove, true);
  window.addEventListener('mouseup', relayHoverEnd, true);
  window.parent.postMessage({ type: 'frame:ready', frame: 'canvas' }, window.location.origin);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onHostMessage as EventListener);
  window.removeEventListener('pointermove', relayHoverMove, true);
  window.removeEventListener('pointerup', relayHoverEnd, true);
  window.removeEventListener('pointercancel', relayHoverEnd, true);
  window.removeEventListener('mousemove', relayHoverMove, true);
  window.removeEventListener('mouseup', relayHoverEnd, true);
  socket.close();
});
</script>

<template>
  <main class="page-shell canvas-page" :class="{ 'drop-hot': hoverTarget }">
    <header class="page-header canvas-header">
      <div class="title-stack">
        <span><Layers3 :size="18" /> Canvas Page</span>
        <h2>场景编辑器</h2>
      </div>
      <div class="pill-status">
        <MousePointer2 :size="15" />
        {{ layerCount }} 个图层
      </div>
    </header>

    <section ref="stage" class="stage-surface" aria-label="场景画布">
      <div v-if="!items.length" class="empty-stage">
        <Layers3 :size="42" />
        <strong>把左侧素材拖到这里</strong>
        <span>释放后通过 Node WebSocket 写入场景状态</span>
      </div>

      <article
        v-for="item in items"
        :key="item.instanceId"
        class="stage-item"
        :class="`type-${item.type}`"
        :style="{
          left: `${item.x}px`,
          top: `${item.y}px`,
          width: `${item.width}px`,
          height: `${item.height}px`,
          zIndex: item.zIndex,
        }"
        tabindex="0"
        @pointerdown.stop="onItemPointerDown($event, item)"
        @pointermove.stop="onItemPointerMove"
        @pointerup.stop="onItemPointerEnd"
        @pointercancel.stop="onItemPointerEnd"
      >
        <div class="stage-item-toolbar">
          <span>
            <component :is="iconForType(item.type)" :size="14" />
            {{ item.type }}
          </span>
          <small>{{ item.title }}</small>
        </div>

        <img
          v-if="item.type === 'image'"
          :src="item.url"
          :alt="item.title"
          draggable="false"
        />
        <video
          v-else-if="item.type === 'video'"
          :src="item.url"
          muted
          playsinline
          controls
          preload="metadata"
        />
        <iframe
          v-else-if="item.type === 'website'"
          :src="item.url"
          title="本地网页素材"
        />
        <div v-else-if="item.type === 'datasource'" class="data-card">
          <strong>Sheet1</strong>
          <table>
            <thead>
              <tr><th>一列</th><th>两列</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>2</td></tr>
              <tr><td>1</td><td>2</td></tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="item.type === 'text'" class="text-card">
          {{ item.meta.text }}
        </div>
        <div v-else class="document-card">
          <FileText :size="36" />
          <strong>{{ item.title }}</strong>
          <span>{{ item.meta.excerpt || item.description }}</span>
        </div>
      </article>
    </section>
  </main>
</template>
