"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function HeroParticles() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const particles = Array.from({ length: 20 });

  return (
    <div dir="ltr" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {particles.map((_, i) => {
        const size = Math.random() * 6 + 2;
        const startX = Math.random() * 100;
        const startY = Math.random() * 100;
        const duration = Math.random() * 20 + 10;
        const delay = Math.random() * -20;

        return (
          <motion.div
            key={i}
            initial={{
              x: startX + "vw",
              y: startY + "vh",
              opacity: 0,
              scale: 0,
            }}
            animate={{
              x: [startX + "vw", ((startX + 20) % 100) + "vw", ((startX - 20 + 100) % 100) + "vw", startX + "vw"],
              y: [startY + "vh", ((startY - 30 + 100) % 100) + "vh", ((startY + 30) % 100) + "vh", startY + "vh"],
              opacity: [0, 0.4, 0.8, 0.4, 0],
              scale: [0, 1, 1.5, 1, 0],
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              ease: "linear",
              delay: delay,
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: i % 2 === 0 ? "#ffb800" : "#38bdf8",
              boxShadow: i % 2 === 0 ? "0 0 15px 2px rgba(255,184,0,0.6)" : "0 0 15px 2px rgba(56,189,248,0.6)",
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </div>
  );
}
