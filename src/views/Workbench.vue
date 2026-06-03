<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Boxes, CircleDot, ExternalLink, Maximize2, MousePointer2, RadioTower, RotateCcw } from 'lucide-vue-next';
import type { DragPayload, DragPoint, FrameBridgeMessage, FrameRole, HostBridgeMessage } from '../types';

const resourceFrame = ref<HTMLIFrameElement | null>(null);
const canvasFrame = ref<HTMLIFrameElement | null>(null);

const drag = reactive<{
  active: boolean;
  payload: DragPayload | null;
  point: DragPoint;
  source: FrameRole | null;
  hover: FrameRole | null;
}>({
  active: false,
  payload: null,
  point: { clientX: 0, clientY: 0 },
  source: null,
  hover: null,
});

const frameMap: Record<FrameRole, typeof resourceFrame> = {
  resource: resourceFrame,
  canvas: canvasFrame,
};

const previewTitle = computed(() => drag.payload?.material.title || '');
const previewType = computed(() => drag.payload?.type || '');

function getFrameRect(frame: FrameRole) {
  return frameMap[frame].value?.getBoundingClientRect() || null;
}

function toHostPoint(message: FrameBridgeMessage): DragPoint {
  const rect = getFrameRect(message.frame);
  const point = message.point || { clientX: 0, clientY: 0 };
  if (!rect) return point;
  return {
    clientX: rect.left + point.clientX,
    clientY: rect.top + point.clientY,
  };
}

function targetAt(point: DragPoint): FrameRole | null {
  const roles: FrameRole[] = ['resource', 'canvas'];
  return roles.find((role) => {
    const rect = getFrameRect(role);
    return !!rect
      && point.clientX >= rect.left
      && point.clientX <= rect.right
      && point.clientY >= rect.top
      && point.clientY <= rect.bottom;
  }) || null;
}

function postToFrame(frame: FrameRole, message: HostBridgeMessage) {
  const safeMessage = JSON.parse(JSON.stringify(message)) as HostBridgeMessage;
  frameMap[frame].value?.contentWindow?.postMessage(safeMessage, window.location.origin);
}

function postHover() {
  const message: HostBridgeMessage = { type: 'drag:hover', target: drag.hover };
  postToFrame('resource', message);
  postToFrame('canvas', message);
}

function updateHover(point: DragPoint) {
  const nextHover = targetAt(point);
  if (nextHover !== drag.hover) {
    drag.hover = nextHover;
    postHover();
  }
}

function finishDrag(point: DragPoint) {
  if (!drag.payload) return;
  const payload = JSON.parse(JSON.stringify(drag.payload)) as DragPayload;
  const source = drag.source;
  const target = targetAt(point);

  drag.active = false;
  drag.payload = null;
  drag.source = null;
  drag.hover = null;
  postHover();

  if (target) {
    const rect = getFrameRect(target);
    postToFrame(target, {
      type: 'drag:drop',
      target,
      payload,
      point: rect
        ? { clientX: point.clientX - rect.left, clientY: point.clientY - rect.top }
        : point,
    });
  } else if (source) {
    postToFrame(source, { type: 'drag:cancel', payload });
  }
}

function onHostPointerMove(event: PointerEvent) {
  if (!drag.active) return;
  event.preventDefault();
  const point = { clientX: event.clientX, clientY: event.clientY };
  drag.point = point;
  updateHover(point);
}

function onHostPointerEnd(event: PointerEvent) {
  if (!drag.active) return;
  event.preventDefault();
  finishDrag({ clientX: event.clientX, clientY: event.clientY });
}

function onHostMouseMove(event: MouseEvent) {
  if (!drag.active) return;
  event.preventDefault();
  const point = { clientX: event.clientX, clientY: event.clientY };
  drag.point = point;
  updateHover(point);
}

function onHostMouseEnd(event: MouseEvent) {
  if (!drag.active) return;
  event.preventDefault();
  finishDrag({ clientX: event.clientX, clientY: event.clientY });
}

function onMessage(event: MessageEvent<FrameBridgeMessage>) {
  if (event.origin !== window.location.origin || !event.data?.type) return;
  const message = event.data;
  if (message.type === 'frame:ready') {
    postHover();
    return;
  }
  if (!message.point) return;
  const point = toHostPoint(message);
  if (message.type === 'drag:start') {
    if (!message.payload) return;
    drag.active = true;
    drag.payload = message.payload;
    drag.source = message.frame;
    drag.point = point;
    updateHover(point);
    return;
  }
  if (message.type === 'drag:move' && drag.active) {
    drag.point = point;
    updateHover(point);
    return;
  }
  if (message.type === 'drag:end' && drag.active) {
    drag.point = point;
    finishDrag(point);
  }
}

function openPopout(path: '/resource' | '/canvas') {
  window.open(path, path.slice(1), 'width=720,height=760');
}

async function resetScene() {
  await fetch('/api/scene/reset', { method: 'POST' });
}

onMounted(() => {
  window.addEventListener('message', onMessage as EventListener);
  window.addEventListener('pointermove', onHostPointerMove, true);
  window.addEventListener('pointerup', onHostPointerEnd, true);
  window.addEventListener('pointercancel', onHostPointerEnd, true);
  window.addEventListener('mousemove', onHostMouseMove, true);
  window.addEventListener('mouseup', onHostMouseEnd, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage as EventListener);
  window.removeEventListener('pointermove', onHostPointerMove, true);
  window.removeEventListener('pointerup', onHostPointerEnd, true);
  window.removeEventListener('pointercancel', onHostPointerEnd, true);
  window.removeEventListener('mousemove', onHostMouseMove, true);
  window.removeEventListener('mouseup', onHostMouseEnd, true);
});
</script>

<template>
  <main class="workbench-shell" :class="{ 'is-dragging': drag.active }">
    <header class="topbar">
      <section class="brand-lockup" aria-label="应用标题">
        <span class="brand-mark">
          <RadioTower :size="22" />
        </span>
        <div>
          <p>Vue3 + Node</p>
          <h1>跨页面拖拽工作台</h1>
        </div>
      </section>

      <section class="status-strip" aria-label="运行状态">
        <span><CircleDot :size="15" /> postMessage 桥接</span>
        <span><Boxes :size="15" /> iframe 双页面</span>
        <span><MousePointer2 :size="15" /> 长按 / 阈值拖拽</span>
      </section>

      <nav class="toolbar" aria-label="页面操作">
        <button type="button" title="重置画布" @click="resetScene">
          <RotateCcw :size="18" />
        </button>
        <button type="button" title="弹出素材页" @click="openPopout('/resource')">
          <ExternalLink :size="18" />
        </button>
        <button type="button" title="弹出场景页" @click="openPopout('/canvas')">
          <Maximize2 :size="18" />
        </button>
      </nav>
    </header>

    <section class="split-workspace" aria-label="跨页面拖拽演示区">
      <div class="frame-wrap" :class="{ 'is-hover': drag.hover === 'resource' }">
        <div class="frame-title">
          <span>资源列表页</span>
          <small>/resource</small>
        </div>
        <iframe ref="resourceFrame" title="资源列表页" src="/resource" />
      </div>

      <div class="transfer-rail" aria-hidden="true">
        <span />
      </div>

      <div class="frame-wrap canvas-frame" :class="{ 'is-hover': drag.hover === 'canvas' }">
        <div class="frame-title">
          <span>场景编辑页</span>
          <small>/canvas</small>
        </div>
        <iframe ref="canvasFrame" title="场景编辑页" src="/canvas" />
      </div>
    </section>

    <div
      v-if="drag.active && drag.payload"
      class="host-drag-layer"
      @pointermove="onHostPointerMove"
      @pointerup="onHostPointerEnd"
      @pointercancel="onHostPointerEnd"
      @mousemove="onHostMouseMove"
      @mouseup="onHostMouseEnd"
      @click="onHostMouseEnd"
    />

    <div
      v-if="drag.active && drag.payload"
      class="host-drag-preview"
      :style="{ transform: `translate3d(${drag.point.clientX + 16}px, ${drag.point.clientY + 16}px, 0)` }"
    >
      <img
        v-if="drag.payload.material.thumbnail"
        :src="drag.payload.material.thumbnail"
        :alt="drag.payload.material.title"
      />
      <div>
        <small>{{ previewType }}</small>
        <strong>{{ previewTitle }}</strong>
      </div>
    </div>
  </main>
</template>
