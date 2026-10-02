import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { palette } from '@pandam/ui';

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1),
  dist: 70 + (i % 4) * 22,
  size: 5 + (i % 3) * 3,
  tint: i % 3 === 0 ? palette.orange200 : i % 3 === 1 ? palette.orange400 : palette.concrete,
}));

function Particle({ p, burst }: { p: (typeof PARTICLES)[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const b = burst.value;
    return {
      opacity: b <= 0 ? 0 : interpolate(b, [0, 0.15, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.cos(p.angle) * p.dist * b },
        { translateY: Math.sin(p.angle) * p.dist * b - b * 10 },
        { scale: 1 - b * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: p.size,
          height: p.size,
          borderRadius: p.size,
          backgroundColor: p.tint,
        },
        style,
      ]}
    />
  );
}

/**
 * One soft terracotta burst — not a confetti cannon. Drive `burst` from 0 to 1
 * once; the particles fly out from the parent's centre and fade. Render it
 * inside a centred, pointer-transparent container.
 */
export function ParticleBurst({ burst }: { burst: SharedValue<number> }) {
  return (
    <>
      {PARTICLES.map((p, i) => (
        <Particle key={i} p={p} burst={burst} />
      ))}
    </>
  );
}
