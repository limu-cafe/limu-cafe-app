import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type DropPosition = { index: number; itemId: string; edge: 'before' | 'after' };
type DragSession = {
  id: string;
  pointerId: number;
  handle: HTMLButtonElement;
  rows: HTMLTableSectionElement;
  scroller: HTMLElement | null;
  startY: number;
  y: number;
  started: boolean;
  frame: number;
  target: DropPosition | null;
};
type DragIndicator = { id: string; target: DropPosition | null };

function updateTarget(drag: DragSession) {
  const otherRows = Array.from(drag.rows.rows).filter(row => row.dataset.orderId && row.dataset.orderId !== drag.id);
  const next = otherRows.findIndex(row => {
    const rect = row.getBoundingClientRect();
    return drag.y < rect.top + rect.height / 2;
  });
  const itemId = (next >= 0 ? otherRows[next] : otherRows[otherRows.length - 1])?.dataset.orderId;
  drag.target = itemId ? { index: next >= 0 ? next : otherRows.length, itemId, edge: next >= 0 ? 'before' : 'after' } : null;
}

export function useItemOrderDrag(visibleIds: string[], enabled: boolean, move: (id: string, position: number) => void) {
  const session = useRef<DragSession | null>(null);
  const [indicator, setIndicator] = useState<DragIndicator | null>(null);

  function showTarget(drag: DragSession) {
    updateTarget(drag);
    const target = drag.target;
    setIndicator(previous => previous?.id === drag.id
      && previous.target?.itemId === target?.itemId
      && previous.target?.edge === target?.edge ? previous : { id: drag.id, target });
  }

  function scrollNearEdge(drag: DragSession) {
    const scroller = drag.scroller;
    if (!scroller || drag.frame) return;
    const bounds = scroller.getBoundingClientRect();
    const margin = 48;
    const distance = drag.y < bounds.top + margin ? drag.y - bounds.top - margin
      : Math.max(0, drag.y - bounds.bottom + margin);
    if (!distance) return;
    const speed = Math.sign(distance) * Math.min(18, Math.ceil(Math.abs(distance) / 3));
    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      if (session.current !== drag) return;
      const previous = scroller.scrollTop;
      scroller.scrollTop += speed;
      if (scroller.scrollTop === previous) return;
      showTarget(drag);
      scrollNearEdge(drag);
    });
  }

  function finish(drag: DragSession) {
    session.current = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    setIndicator(null);
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  }

  useEffect(() => () => {
    const drag = session.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
  }, []);

  function start(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!enabled || !event.isPrimary || event.button !== 0 || session.current) return;
    const handle = event.currentTarget;
    const rows = handle.closest('tbody');
    if (!rows) return;
    handle.setPointerCapture(event.pointerId);
    session.current = {
      id, rows, handle, scroller: handle.closest('main'), pointerId: event.pointerId,
      startY: event.clientY, y: event.clientY, started: false, target: null, frame: 0,
    };
  }

  function track(event: PointerEvent<HTMLButtonElement>) {
    const drag = session.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.started && Math.abs(event.clientY - drag.startY) < 4) return;
    drag.started = true;
    drag.y = event.clientY;
    showTarget(drag);
    scrollNearEdge(drag);
  }

  function drop(event: PointerEvent<HTMLButtonElement>) {
    const drag = session.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.y = event.clientY;
    updateTarget(drag);
    finish(drag);
    if (enabled && drag.started && drag.target) move(drag.id, drag.target.index);
  }

  function cancel(event: PointerEvent<HTMLButtonElement>) {
    const drag = session.current;
    if (drag?.pointerId === event.pointerId) finish(drag);
  }

  function key(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === 'Escape' && session.current) {
      event.preventDefault();
      finish(session.current);
      return;
    }
    const index = visibleIds.indexOf(id);
    const positions: Record<string, number> = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: visibleIds.length - 1 };
    const position = positions[event.key];
    if (!enabled || session.current || position === undefined) return;
    event.preventDefault();
    move(id, position);
    const handle = event.currentTarget;
    requestAnimationFrame(() => handle.focus({ preventScroll: true }));
  }

  return { indicator, start, track, drop, cancel, key };
}
