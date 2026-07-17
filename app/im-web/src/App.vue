<template>
  <div class="app-container">
    <router-view />
    <UpdateCenter />
  </div>
</template>

<script setup lang="ts">
// Intent: App hosts the root router outlet and global application frame.
import UpdateCenter from './components/UpdateCenter.vue'
</script>

<style scoped>
.app-container {
  height: 100%;
  width: 100%;
  display: flex;
}
</style>
