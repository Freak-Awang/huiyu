<!-- 应用根组件：承载路由视图 -->
<template>
  <div class="app-container">
    <router-view />
  </div>
</template>

<style scoped>
.app-container {
  height: 100%;
  width: 100%;
  display: flex;
}
</style>
