import { createContext, useContext, useEffect, useRef, useState } from "react";

/** Scroll root for the methodology overlay. Stories listen here instead of window. */
export const MethodScroll = createContext({ rootRef: { current: null }, active: false });

export function useActiveSection(ids, rootRef, enabled = true) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (!enabled) return undefined;
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;
    const root = rootRef?.current ?? null;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      {
        root,
        rootMargin: "-28% 0px -48% 0px",
        threshold: [0, 0.15, 0.4, 0.75],
      },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids, rootRef, enabled]);

  return active;
}

export function useScrollSteps(count) {
  const { rootRef, active } = useContext(MethodScroll);
  const ref = useRef(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(count);
      return undefined;
    }
    const el = ref.current;
    const scroller = rootRef?.current;
    if (!el || count < 1 || !active || !scroller) return undefined;

    const update = () => {
      const viewH = scroller.clientHeight;
      const travel = el.offsetHeight - viewH;
      if (travel <= 0) {
        setShown(count);
        return;
      }
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const t = Math.min(1, Math.max(0, -top / travel));
      setShown(Math.min(count, 1 + Math.floor(t * (count - 0.001))));
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const io = new IntersectionObserver(update, {
      root: scroller,
      threshold: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1],
    });
    io.observe(el);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      io.disconnect();
    };
  }, [count, rootRef, active]);

  return [ref, shown];
}

export function useNearScrollEnd(rootRef, enabled) {
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setAtEnd(false);
      return undefined;
    }
    const el = rootRef?.current;
    if (!el) return undefined;

    const update = () => {
      const slack = Math.max(80, el.clientHeight * 0.1);
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - slack);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [rootRef, enabled]);

  return atEnd;
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
