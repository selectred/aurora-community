const WebSocket = require('ws');

class StreamingService {
  constructor() {
    this.wss = null;
    this.sessions = new Map(); // sessionId -> Set of WebSocket connections
  }

  initialize() {
    this.wss = new WebSocket.Server({ noServer: true });

    this.wss.on('connection', (ws, req) => {
      // Extract sessionId from URL: /ws/terminal?sessionId=xxx
      const url = new URL(req.url, 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        ws.close(4001, 'Missing sessionId');
        return;
      }

      this.addConnection(sessionId, ws);
      console.log(`Terminal WebSocket connected: ${sessionId}`);

      ws.on('close', () => {
        this.removeConnection(sessionId, ws);
        console.log(`Terminal WebSocket disconnected: ${sessionId}`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error.message);
      });

      // Send connection confirmation
      this.send(sessionId, 'connected', { sessionId });
    });

    console.log('WebSocket streaming service initialized');
  }

  addConnection(sessionId, ws) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId).add(ws);
  }

  removeConnection(sessionId, ws) {
    const connections = this.sessions.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Send message to all connections for a session
  send(sessionId, type, data) {
    const connections = this.sessions.get(sessionId);
    if (!connections || connections.size === 0) return;

    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Convenience methods for different message types
  log(sessionId, content, logType = 'info') {
    this.send(sessionId, 'log', { content, logType });
  }

  success(sessionId, content) {
    this.send(sessionId, 'log', { content, logType: 'success' });
  }

  error(sessionId, content) {
    this.send(sessionId, 'log', { content, logType: 'error' });
  }

  status(sessionId, status) {
    this.send(sessionId, 'status', { status });
  }

  complete(sessionId, result) {
    this.send(sessionId, 'complete', result);
  }

  // Check if session has active connections
  hasConnections(sessionId) {
    const connections = this.sessions.get(sessionId);
    return connections && connections.size > 0;
  }
}

module.exports = new StreamingService();
