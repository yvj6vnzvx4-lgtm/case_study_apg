import { useEffect, useRef, useState } from "react";

export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-28% 0px -48% 0px", threshold: [0, 0.15, 0.4, 0.75] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return active;
}

export function useScrollSteps(count) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(count);
      return undefined;
    }
    const el = ref.current;
    if (!el || count < 1) return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const travel = el.offsetHeight - window.innerHeight;
      if (travel <= 0) {
        setShown(count);
        return;
      }
      const t = Math.min(1, Math.max(0, -rect.top / travel));
      setShown(Math.min(count, 1 + Math.floor(t * (count - 0.001))));
    };

    update();
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    const io = new IntersectionObserver(update, {
      threshold: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1],
    });
    io.observe(el);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
      io.disconnect();
    };
  }, [count]);

  return [ref, shown];
}

export function useOnScreen(id, rootMargin = "0px 0px -12% 0px") {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.01, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, rootMargin]);

  return on;
}
