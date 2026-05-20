<template>
  <el-container class="layout-container">
    <el-aside width="220px">
      <div class="sidebar">
        <div class="logo">
          <h2>企业管理后台</h2>
        </div>
        <el-menu
          :default-active="activeMenu"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409eff"
        >
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/depts">
            <el-icon><OfficeBuilding /></el-icon>
            <span>部门管理</span>
          </el-menu-item>
        </el-menu>
        <div class="user-info">
          <el-icon><UserFilled /></el-icon>
          <span class="nickname">{{ authStore.nickname }}</span>
          <el-button text size="small" @click="handleLogout">退出</el-button>
        </div>
      </div>
    </el-aside>
    <el-container>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { User, OfficeBuilding, UserFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const activeMenu = computed(() => route.path)

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    authStore.logout()
  } catch {
    // cancelled
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.el-aside {
  background-color: #304156;
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo h2 {
  color: #fff;
  font-size: 18px;
  margin: 0;
  white-space: nowrap;
}

.el-menu {
  border-right: none;
  flex: 1;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #bfcbd9;
  font-size: 14px;
}

.nickname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.el-main {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
