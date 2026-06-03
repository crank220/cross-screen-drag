<script setup lang="ts">
import Workbench from './views/Workbench.vue';
import ResourcePage from './views/ResourcePage.vue';
import CanvasPage from './views/CanvasPage.vue';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
</script>

<template>
  <ResourcePage v-if="pathname === '/resource'" />
  <CanvasPage v-else-if="pathname === '/canvas'" />
  <Workbench v-else />
</template>
