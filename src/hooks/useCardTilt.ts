import { useCallback, useRef, type MouseEvent } from "react";

/**
 * 3D tilt effect that follows the cursor.
 *
 * The card rotates around its centre so the side nearest the pointer lifts
 * toward the viewer. `maxTilt` caps the rotation in degrees; `scale` is the
 * hover zoom factor. Returns handlers and a style object to spread onto the
 * card element.
 */
export function useCardTilt(maxTilt = 8, scale = 1.02) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  const updateTilt = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -maxTilt;
      const rotateY = ((x - centerX) / centerX) * maxTilt;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!card) return;
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
      });
    },
    [maxTilt, scale],
  );

  const resetTilt = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    cancelAnimationFrame(rafRef.current);
    card.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
  }, []);

  return { cardRef, updateTilt, resetTilt };
}
