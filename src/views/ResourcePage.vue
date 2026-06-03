<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Database, FileText, Film, Globe2, Image, LibraryBig, RotateCcw, Type } from 'lucide-vue-next';
import { createFrameDragController } from '../composables/useFrameDrag';
import { WorkspaceSocket } from '../services/socket';
import type { DragPayload, HostBridgeMessage, Material, MaterialType, SocketMessage } from '../types';

type FrameDragController = ReturnType<typeof createFrameDragController>;

const materials = ref<Material[]>([]);
const activeType = ref<MaterialType | 'all'>('all');
const hoverTarget = ref(false);
const returned = reactive<{ title: string; at: number }[]>([]);
const socket = new WorkspaceSocket();
let activeDrag: FrameDragController | null = null;

const filteredMaterials = computed(() => (
  activeType.value === 'all'
    ? materials.value
    : materials.value.filter((material) => material.type === activeType.value)
));

const typeOptions: Array<{ value: MaterialType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'pdf', label: '文档' },
  { value: 'datasource', label: '数据' },
  { value: 'text', label: '文本' },
  { value: 'website', label: '网页' },
];

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

function createPayload(material: Material): DragPayload {
  return {
    id: `${material.id}-${Date.now()}`,
    type: material.type,
    source: 'resource',
    material,
  };
}

function onMaterialPointerDown(event: PointerEvent, material: Material) {
  activeDrag = createFrameDragController({
    role: 'resource',
    getPayload: () => createPayload(material),
  });
  activeDrag.begin(event);
}

function onMaterialPointerMove(event: PointerEvent) {
  activeDrag?.move(event);
}

function onMaterialPointerEnd(event: PointerEvent) {
  activeDrag?.end(event);
  activeDrag = null;
}

async function loadMaterials() {
  const response = await fetch('/api/materials');
  const data = await response.json() as { materials: Material[] };
  materials.value = data.materials;
}

function onHostMessage(event: MessageEvent<HostBridgeMessage>) {
  if (event.origin !== window.location.origin || !event.data?.type) return;
  const message = event.data;
  if (message.type === 'drag:hover') {
    hoverTarget.value = message.target === 'resource';
    return;
  }
  if (message.type === 'drag:drop' && message.payload?.source === 'canvas') {
    returned.unshift({ title: message.payload.material.title, at: Date.now() });
    returned.splice(4);
    if (message.payload.originInstanceId) {
      socket.send({ type: 'scene:remove', instanceId: message.payload.originInstanceId });
    }
    socket.send({
      type: 'library:return',
      materialId: message.payload.material.id,
      title: message.payload.material.title,
    });
  }
}

function relayHoverMove(event: PointerEvent | MouseEvent) {
  if (!hoverTarget.value) return;
  window.parent.postMessage({
    type: 'drag:move',
    frame: 'resource',
    point: { clientX: event.clientX, clientY: event.clientY },
  }, window.location.origin);
}

function relayHoverEnd(event: PointerEvent | MouseEvent) {
  if (!hoverTarget.value) return;
  window.parent.postMessage({
    type: 'drag:end',
    frame: 'resource',
    point: { clientX: event.clientX, clientY: event.clientY },
  }, window.location.origin);
}

function onSocketMessage(message: SocketMessage) {
  if (message.type === 'library:return' && message.title) {
    returned.unshift({ title: message.title, at: Date.now() });
    returned.splice(4);
  }
}

onMounted(async () => {
  await loadMaterials();
  socket.connect();
  socket.onMessage(onSocketMessage);
  window.addEventListener('message', onHostMessage as EventListener);
  window.addEventListener('pointermove', relayHoverMove, true);
  window.addEventListener('pointerup', relayHoverEnd, true);
  window.addEventListener('pointercancel', relayHoverEnd, true);
  window.addEventListener('mousemove', relayHoverMove, true);
  window.addEventListener('mouseup', relayHoverEnd, true);
  window.parent.postMessage({ type: 'frame:ready', frame: 'resource' }, window.location.origin);
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
  <main class="page-shell resource-page" :class="{ 'drop-hot': hoverTarget }">
    <header class="page-header">
      <div class="title-stack">
        <span><LibraryBig :size="18" /> Source Page</span>
        <h2>素材库</h2>
      </div>
      <div class="pill-status">
        <RotateCcw :size="15" />
        可反向接收
      </div>
    </header>

    <section class="filter-tabs" aria-label="素材类型过滤">
      <button
        v-for="option in typeOptions"
        :key="option.value"
        type="button"
        :class="{ active: activeType === option.value }"
        @click="activeType = option.value"
      >
        {{ option.label }}
      </button>
    </section>

    <section v-if="returned.length" class="returned-shelf" aria-label="回流素材">
      <strong>从场景回流</strong>
      <span v-for="item in returned" :key="`${item.title}-${item.at}`">{{ item.title }}</span>
    </section>

    <section class="material-grid" aria-label="可拖拽素材">
      <article
        v-for="material in filteredMaterials"
        :key="material.id"
        class="material-card"
        tabindex="0"
        @pointerdown="onMaterialPointerDown($event, material)"
        @pointermove="onMaterialPointerMove"
        @pointerup="onMaterialPointerEnd"
        @pointercancel="onMaterialPointerEnd"
      >
        <div class="thumb">
          <video
            v-if="material.type === 'video'"
            :src="material.url"
            muted
            playsinline
            preload="metadata"
          />
          <img
            v-else-if="material.thumbnail"
            :src="material.thumbnail"
            :alt="material.title"
            draggable="false"
          />
          <component :is="iconForType(material.type)" v-else :size="42" />
        </div>
        <div class="material-info">
          <span class="type-chip">
            <component :is="iconForType(material.type)" :size="14" />
            {{ material.type }}
          </span>
          <h3>{{ material.title }}</h3>
          <p>{{ material.description }}</p>
          <small>{{ material.sourceFile }}</small>
        </div>
      </article>
    </section>
  </main>
</template>
