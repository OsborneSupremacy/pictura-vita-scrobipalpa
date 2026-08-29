import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks an element's content-box width.
 *
 * The layout engine needs a pixel width and nothing else from the DOM, so this is the only
 * place measurement happens. Updates are coalesced to animation frames: the original app
 * relaid out the entire timeline on every resize event with no throttling at all.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const frame = useRef(0);

  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => () => {
    observer.current?.disconnect();
    cancelAnimationFrame(frame.current);
  }, []);

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;

    observer.current = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;

      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setWidth(Math.floor(entry.contentRect.width));
      });
    });

    observer.current.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
  }, []);

  return [ref, width];
}
