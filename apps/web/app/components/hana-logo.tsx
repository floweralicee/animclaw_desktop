'use client';

import React, { useState, useId } from 'react';

interface HanaLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export function HanaLogo({ size = 20, className = '', animated = true }: HanaLogoProps) {
  const [hovered, setHovered] = useState(false);
  const uid = useId();
  const glowId = `hana-glow-${uid}`;
  const shineId = `hana-shine-${uid}`;

  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      onMouseEnter={() => animated && setHovered(true)}
      onMouseLeave={() => animated && setHovered(false)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        {/* Glow filter (visible on hover) */}
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id={shineId} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Container group — spins on hover */}
        <g filter={hovered ? `url(#${glowId})` : undefined}>
          <g
            style={{
              transformOrigin: '12px 12px',
              transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: hovered ? 'rotate(36deg) scale(1.1)' : 'rotate(0deg) scale(1)',
            }}
          >
            {/* 5 petals */}
            {[0, 72, 144, 216, 288].map((deg, i) => {
              const opacities = [0.75, 0.6, 0.45, 0.6, 0.75];
              return (
                <ellipse
                  key={deg}
                  cx="12"
                  cy="6"
                  rx="2.5"
                  ry={hovered ? 4.6 : 4}
                  fill="#F78CA0"
                  opacity={hovered ? 0.85 : opacities[i]}
                  transform={`rotate(${deg} 12 12)`}
                  style={{
                    transition: `opacity 0.4s ease ${i * 0.04}s`,
                  }}
                />
              );
            })}

            {/* Center circle */}
            <circle
              cx="12"
              cy="12"
              r={hovered ? 3.3 : 3}
              fill="#F78CA0"
              style={{
                transition: 'r 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />

            {/* Shine overlay on hover */}
            <circle
              cx="12"
              cy="12"
              r="10"
              fill={`url(#${shineId})`}
              opacity={hovered ? 1 : 0}
              style={{ transition: 'opacity 0.4s ease', pointerEvents: 'none' }}
            />
          </g>
        </g>

        {/* Sparkle particles on hover */}
        {animated && (
          <>
            {[
              { cx: 3, cy: 3, delay: '0s' },
              { cx: 21, cy: 5, delay: '0.15s' },
              { cx: 20, cy: 20, delay: '0.08s' },
              { cx: 4, cy: 19, delay: '0.2s' },
            ].map(({ cx, cy, delay }, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="0.8"
                fill="#F78CA0"
                opacity={hovered ? 0.7 : 0}
                style={{
                  transition: `opacity 0.3s ease ${delay}, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}`,
                  transform: hovered ? 'scale(1)' : 'scale(0)',
                  transformOrigin: `${cx}px ${cy}px`,
                }}
              />
            ))}
          </>
        )}
      </svg>
    </span>
  );
}
