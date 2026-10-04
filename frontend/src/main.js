import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

// Use Pinia for state management
app.use(createPinia())

// Use Vue Router
app.use(router)

// Global error handler — prevents a single component error (e.g. chart.js canvas
// cleanup race) from blanking the entire router-view on all subsequent navigations.
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Aurora] Component error in', info, err)
}

// Mount the app
app.mount('#app')
