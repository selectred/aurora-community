import { defineStore } from 'pinia'
import api, { getWebSocketUrl } from '@/lib/api'

export const useTerminalStore = defineStore('terminal', {
  state: () => ({
    sessionId: null,
    status: 'idle',
    messages: [],
    isConnected: false,
    isProcessing: false,
    processingText: '',

    // Workflow state
    hasPlan: false,
    hasTests: false,
    hasFailures: false,
    probeData: null,
    generatedFiles: null,   // { pom, fixture, spec } from TypeScript generation

    // Spec created during generate (populated from WebSocket complete)
    currentSpecId: null,

    // Engine for the current spec — always Playwright
    currentEngine: 'playwright',

    // Run result (populated from WebSocket complete during run phase)
    lastRunSummary: null,

    // WebSocket
    ws: null
  }),

  actions: {
    async initialize() {
      // Try to restore a previous session first
      const storedId = localStorage.getItem('aurora_terminal_session')
      if (storedId) {
        try {
          const { data } = await api.get(`/api/terminal/sessions/${storedId}`)
          if (data.session) {
            const s = data.session
            this.sessionId = storedId
            this.status = s.status
            this.messages = s.messages || []
            this.hasPlan = ['plan_complete', 'generate_complete', 'run_complete', 'heal_complete', 'running', 'healing'].includes(s.status)
            this.hasTests = ['generate_complete', 'run_complete', 'heal_complete', 'running', 'healing'].includes(s.status)
            this.hasFailures = s.lastRun?.failed > 0
            this.addMessage('system', 'Previous session restored.')
            this.connectWebSocket()
            return
          }
        } catch {
          // Session gone — fall through to create a new one
          localStorage.removeItem('aurora_terminal_session')
        }
      }

      // Create new session
      try {
        const { data } = await api.post('/api/terminal/sessions')
        this.sessionId = data.sessionId
        this.status = data.status
        localStorage.setItem('aurora_terminal_session', data.sessionId)
        this.addMessage('system', 'Session started. Type a command or use the action buttons.')
        this.connectWebSocket()
      } catch (error) {
        console.error('Failed to create session:', error)
        this.addMessage('error', 'Failed to create session')
      }
    },

    connectWebSocket() {
      if (this.ws) {
        this.ws.close()
      }

      const wsUrl = getWebSocketUrl(this.sessionId)
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
      }

      this.ws.onclose = () => {
        this.isConnected = false
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.isConnected = false
      }

      this.ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data)
          this.handleWebSocketMessage(type, data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
    },

    handleWebSocketMessage(type, data) {
      switch (type) {
        case 'connected':
          // Connection confirmed
          break

        case 'log':
          this.addMessage(data.logType || 'info', data.content)
          break

        case 'status':
          this.status = data.status
          this.updateWorkflowState(data.status)
          break

        case 'complete':
          this.isProcessing = false
          this.processingText = ''
          if (data.specId) {
            this.currentSpecId = data.specId
          }
          if (data.files) {
            this.generatedFiles = data.files
          }
          if (data.passed !== undefined || data.failed !== undefined) {
            this.lastRunSummary = {
              passed: data.passed ?? 0,
              failed: data.failed ?? 0,
              failures: data.failures ?? []
            }
          }
          break

        default:
          console.log('Unknown WebSocket message type:', type, data)
      }
    },

    updateWorkflowState(status) {
      if (status === 'plan_complete') {
        this.hasPlan = true
      } else if (status === 'generate_complete') {
        this.hasTests = true
      } else if (status === 'run_complete') {
        // Check if there were failures from messages
        const hasFailure = this.messages.some(m =>
          m.type === 'error' && m.content.includes('failed')
        )
        this.hasFailures = hasFailure
      } else if (status === 'heal_complete') {
        this.hasFailures = false
        this.isProcessing = false
      } else if (status === 'failed') {
        this.isProcessing = false
        this.processingText = ''
      }
    },

    disconnect() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
    },

    addMessage(type, content) {
      this.messages.push({
        type,
        content,
        timestamp: Date.now()
      })
    },

    async probe(url) {
      this.isProcessing = true
      this.processingText = 'Probing page...'
      this.probeData = null

      try {
        const response = await api.post('/api/terminal/probe', { url })
        this.probeData = response.data.probeData
        this.addMessage('success', `Page probed: ${this.probeData.navigation?.length || 0} nav links, ${this.probeData.headings?.length || 0} headings, ${this.probeData.forms?.length || 0} forms found`)
        return this.probeData
      } catch (error) {
        this.addMessage('error', error.response?.data?.error || 'Probe failed')
        return null
      } finally {
        this.isProcessing = false
      }
    },

    async plan(prompt, probeData = null) {
      this.addMessage('user', prompt)
      this.isProcessing = true
      this.processingText = 'Planning...'

      try {
        await api.post('/api/terminal/plan', {
          sessionId: this.sessionId,
          prompt,
          probeData: probeData || this.probeData || null
        })
        // Response comes via WebSocket
      } catch (error) {
        this.isProcessing = false
        this.addMessage('error', error.response?.data?.error || 'Planning failed')
      }
    },

    async generate(targetUrl = '', specName = '', engine = 'playwright') {
      this.isProcessing = true
      this.processingText = 'Generating tests...'
      this.currentEngine = engine

      try {
        await api.post('/api/terminal/generate', {
          sessionId: this.sessionId,
          targetUrl,
          specName,
          engine
        })
        // Response comes via WebSocket
      } catch (error) {
        this.isProcessing = false
        this.addMessage('error', error.response?.data?.error || 'Generation failed')
      }
    },

    async run() {
      this.isProcessing = true
      this.processingText = 'Running tests...'

      try {
        await api.post('/api/terminal/run', {
          sessionId: this.sessionId
        })
        // Response comes via WebSocket
      } catch (error) {
        this.isProcessing = false
        this.addMessage('error', error.response?.data?.error || 'Run failed')
      }
    },

    async heal() {
      this.isProcessing = true
      this.processingText = 'Healing...'

      try {
        await api.post('/api/terminal/heal', {
          sessionId: this.sessionId
        })
        // Response comes via WebSocket
      } catch (error) {
        this.isProcessing = false
        this.addMessage('error', error.response?.data?.error || 'Healing failed')
      }
    },

    clearMessages() {
      this.messages = []
    },

    setHasTests(value) {
      this.hasTests = value
    },

    setHasFailures(value) {
      this.hasFailures = value
    },

    reset() {
      localStorage.removeItem('aurora_terminal_session')
      this.messages = []
      this.hasPlan = false
      this.hasTests = false
      this.hasFailures = false
      this.status = 'idle'
      this.isProcessing = false
      this.processingText = ''
      this.probeData = null
      this.currentSpecId = null
      this.currentEngine = 'playwright'
      this.generatedFiles = null
      this.lastRunSummary = null
    }
  }
})
