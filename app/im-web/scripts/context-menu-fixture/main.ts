import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Fixture from './Fixture.vue'
import '../../src/style.css'
createApp(Fixture).use(createPinia()).mount('#app')
