import type { DragPayload, FrameRole } from '../types';

interface DragControllerOptions {
  role: FrameRole;
  getPayload: () => DragPayload;
}

const LONG_PRESS_MS = 180;
const MOVE_THRESHOLD = 5;

export function createFrameDragController(options: DragControllerOptions) {
  let startX = 0;
  let startY = 0;
  let pointerId = 0;
  let started = false;
  let timer = 0;
  let target: HTMLElement | null = null;

  const payload = () => JSON.parse(JSON.stringify(options.getPayload())) as DragPayload;

  const post = (type: 'drag:start' | 'drag:move' | 'drag:end', event: PointerEvent) => {
    window.parent.postMessage({
      type,
      frame: options.role,
      payload: payload(),
      point: { clientX: event.clientX, clientY: event.clientY },
    }, window.location.origin);
  };

  const begin = (event: PointerEvent) => {
    if (event.button !== 0) return;
    target = event.currentTarget as HTMLElement;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    started = false;
    timer = window.setTimeout(() => {
      started = true;
      post('drag:start', event);
    }, LONG_PRESS_MS);
  };

  const move = (event: PointerEvent) => {
    if (!target || event.pointerId !== pointerId) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (!started && distance >= MOVE_THRESHOLD) {
      window.clearTimeout(timer);
      started = true;
      post('drag:start', event);
    }
    if (started) {
      event.preventDefault();
      post('drag:move', event);
    }
  };

  const end = (event: PointerEvent) => {
    if (!target || event.pointerId !== pointerId) return;
    window.clearTimeout(timer);
    if (started) {
      event.preventDefault();
      post('drag:end', event);
    }
    if (target.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    target = null;
    started = false;
  };

  return { begin, move, end };
}
