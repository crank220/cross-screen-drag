import type { SocketMessage } from '../types';

type MessageHandler = (message: SocketMessage) => void;

export class WorkspaceSocket {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private retryTimer = 0;
  private queue: unknown[] = [];

  connect() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    this.socket.addEventListener('open', () => {
      const queued = [...this.queue];
      this.queue = [];
      queued.forEach((message) => this.send(message));
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as SocketMessage;
        this.handlers.forEach((handler) => handler(message));
      } catch {
        // Ignore malformed frames from development tools or closed connections.
      }
    });

    this.socket.addEventListener('close', () => {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => this.connect(), 800);
    });
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.queue.push(message);
    this.connect();
  }

  close() {
    window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.handlers.clear();
  }
}
