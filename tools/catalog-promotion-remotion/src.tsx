import React from "react";
import { AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame } from "remotion";
// Original print accents rendered offline. Text/products stay live HTML above it.
const StreetEnergy = () => {
  const f = useCurrentFrame(),
    progress = interpolate(f, [0, 40, 170, 239], [0, 0.7, 1, 1]),
    opacity = interpolate(f, [0, 20, 200, 239], [0, 0.65, 0.65, 0]);
  return (
    <AbsoluteFill style={{ background: "#111114" }}>
      <svg width="720" height="360" viewBox="0 0 720 360" style={{ width: "100%", height: "100%" }}>
        <defs>
          <pattern id="dots" width="13" height="13" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.2" fill="#fff" opacity=".3" />
          </pattern>
        </defs>
        <rect width="720" height="360" fill="url(#dots)" />
        <g
          opacity={opacity}
          transform={`translate(${(1 - progress) * 26},${(1 - progress) * -18})`}
        >
          <path d="M595 60L660 44L684 137L620 151Z" fill="#ff2927" />
          <path d="M575 72L628 62L635 88L583 99Z" fill="#f0ff28" />
          <path d="M32 290L118 264L128 294L40 324Z" fill="#07c7e7" />
          <path d="M73 250L124 240L140 310L92 325Z" fill="#ff2927" />
          <path
            d="M620 185Q665 200 639 235L665 225L651 263L610 240L634 241Q648 216 616 213Z"
            fill="#2538ff"
            stroke="#fffaf0"
            strokeWidth="3"
          />
        </g>
        <path
          d={`M-70 ${360 - progress * 500}L810 ${420 - progress * 500}`}
          stroke="#fff"
          strokeWidth="24"
          opacity={Math.sin(progress * Math.PI) * 0.14}
        />
      </svg>
    </AbsoluteFill>
  );
};
registerRoot(() => (
  <Composition
    id="StreetEnergy"
    component={StreetEnergy}
    durationInFrames={240}
    fps={60}
    width={720}
    height={360}
  />
));
