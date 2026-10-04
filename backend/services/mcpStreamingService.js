const WebSocket = require('ws')

class MCPStreamingService {
  constructor() {
    this.wss = null
    this.sessions = new Map()      // sessionId → Set<WebSocket>
    this.buffers  = new Map()      // sessionId → Array of serialised messages (pre-WS)
    this.inputHandlers  = new Map() // sessionId → (data) => void  (one-shot user-input handler)
    this.pendingInputs  = new Map() // sessionId → data  (input arrived before awaitInput was called)
    this.MAX_BUFFER = 300
  }

  initialize() {
    this.wss = new WebSocket.Server({ noServer: true })

    this.wss.on('connection', (ws, req) => {
      let sessionId
      try {
        const url = new URL(req.url, 'http://localhost')
        sessionId = url.searchParams.get('sessionId')
      } catch {
        ws.close(4000, 'Bad request')
        return
      }

      if (!sessionId) { ws.close(4001, 'Missing sessionId'); return }

      // Register error + close handlers FIRST
      ws.on('error', err => console.error(`[MCP WS] ${sessionId}:`, err.message))
      ws.on('close', () => {
        const conns = this.sessions.get(sessionId)
        if (conns) { conns.delete(ws); if (!conns.size) this.sessions.delete(sessionId) }
      })

      // Handle messages sent FROM the client (user-input during element picking)
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'user-input') {
            this.triggerInput(sessionId, msg.data || {})
          }
        } catch {}
      })

      if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, new Set())
      this.sessions.get(sessionId).add(ws)

      // Replay any events that fired before this WS connected
      const buffered = this.buffers.get(sessionId)
      if (buffered?.length) {
        try {
          for (const msg of buffered) {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg)
          }
        } catch (err) {
          console.error('[MCP WS] Error during buffer replay:', err.message)
        }
        this.buffers.delete(sessionId)
      }

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'connected', data: { sessionId }, ts: Date.now() }))
        } catch {}
      }
    })

    this.wss.on('error', err => console.error('[MCP WS Server]', err.message))
    console.log('MCP WebSocket service initialised at /ws/mcp')
  }

  send(sessionId, type, data) {
    const payload = JSON.stringify({ type, data, ts: Date.now() })
    const conns = this.sessions.get(sessionId)

    if (!conns?.size) {
      if (!this.buffers.has(sessionId)) this.buffers.set(sessionId, [])
      const buf = this.buffers.get(sessionId)
      buf.push(payload)
      if (buf.length > this.MAX_BUFFER) buf.shift()
      return
    }

    for (const ws of conns) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload) } catch {}
      }
    }
  }

  // Deliver user input to the pending awaitInput (called from WS message OR HTTP POST)
  triggerInput(sessionId, data) {
    const handler = this.inputHandlers.get(sessionId)
    if (handler) {
      this.inputHandlers.delete(sessionId)
      handler(data)
      return true
    }
    // Store as pending in case awaitInput hasn't been called yet
    this.pendingInputs.set(sessionId, data)
    return false
  }

  // Wait for user input — checks pendingInputs first, then registers a handler
  awaitInput(sessionId, timeoutMs = 300000) {
    const pending = this.pendingInputs.get(sessionId)
    if (pending) {
      this.pendingInputs.delete(sessionId)
      return Promise.resolve(pending)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inputHandlers.delete(sessionId)
        reject(new Error('User input timeout'))
      }, timeoutMs)

      this.inputHandlers.set(sessionId, (data) => {
        clearTimeout(timer)
        this.inputHandlers.delete(sessionId)
        resolve(data)
      })
    })
  }

  // Cancel a pending awaitInput (resolves it with { action: 'cancel' })
  cancelInput(sessionId) {
    this.pendingInputs.delete(sessionId)
    const handler = this.inputHandlers.get(sessionId)
    if (handler) {
      this.inputHandlers.delete(sessionId)
      handler({ action: 'cancel' })
    }
  }

  clearBuffer(sessionId) {
    this.buffers.delete(sessionId)
  }
}

module.exports = new MCPStreamingService()
