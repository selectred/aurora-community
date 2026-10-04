import axios from 'axios'

/**
 * Detect if running inside Tauri
 */
export const isTauri = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined
}

/**
 * Get the API base URL
 * - In Tauri: backend runs on localhost:3000
 * - In browser dev: Vite proxy handles /api routes
 */
export const getApiBaseUrl = () => {
  if (isTauri()) {
    return 'http://localhost:3000'
  }
  // In browser dev mode, Vite proxy handles it
  return ''
}

/**
 * Get the WebSocket URL for terminal streaming
 */
export const getWebSocketUrl = (sessionId) => {
  if (isTauri()) {
    return `ws://localhost:3000/ws/terminal?sessionId=${sessionId}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/terminal?sessionId=${sessionId}`
}

/**
 * Get the WebSocket URL for MCP browser validation streaming
 */
export const getMcpWebSocketUrl = (sessionId) => {
  if (isTauri()) {
    return `ws://localhost:3000/ws/mcp?sessionId=${sessionId}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/mcp?sessionId=${sessionId}`
}

/**
 * Configured axios instance for API calls
 */
const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message)
    return Promise.reject(error)
  }
)

export default api
