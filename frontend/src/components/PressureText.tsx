import React, { memo, ElementType, HTMLAttributes } from 'react';
import { motion } from 'motion/react';

interface PressureTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  basePressure?: number;
  maxPressure?: number;
  isInteractive?: boolean;
  variant?: 'strong' | 'medium' | 'lite';
  [key: string]: unknown;
}

const MOTION_PROP_KEYS = new Set([
  'initial',
  'animate',
  'exit',
  'whileInView',
  'whileHover',
  'whileTap',
  'whileDrag',
  'transition',
  'variants',
  'viewport',
  'layout',
  'layoutId',
  'drag',
  'dragConstraints',
]);

export const PressureText = memo(({ 
  children, 
  className = "", 
  as: Component = "span", 
  basePressure = 0.6,
  maxPressure = 3.2,
  isInteractive = true,
  variant = 'medium',
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props 
}: PressureTextProps) => {
  // Effective pressure is now static as per user request
  const effectivePressure = basePressure * basePressure * 0.8; 
  const hasMotionProps = Object.keys(props).some((key) => MOTION_PROP_KEYS.has(key));
  const RenderComponent =
    typeof Component === 'string' && hasMotionProps
      ? ((motion as Record<string, ElementType>)[Component] ?? Component)
      : Component;

  return (
    <RenderComponent
      className={`pressure-text ${className}`}
      style={{
        '--pressure-depth': effectivePressure,
        filter: `url(#paper-indentation-${variant}) contrast(0.95) brightness(0.98)`,
        ...style
      } as React.CSSProperties}
      {...props}
    >
      {children}
    </RenderComponent>
  );
});

PressureText.displayName = 'PressureText';
