import React from 'react';

export const PressureFilter = React.memo(() => {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        {/* STRONG FILTER: For Headings, important UI */}
        <filter id="paper-indentation-strong" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.0" result="blur1" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.3 0" in="noise" result="coloredNoise" />
          <feDisplacementMap in="blur1" in2="coloredNoise" scale="3" xChannelSelector="R" yChannelSelector="G" result="roughBlur" />
          
          <feDiffuseLighting in="roughBlur" surfaceScale="2.5" diffuseConstant="1.5" lightingColor="#ffffff" result="diffOut">
             <feDistantLight azimuth="225" elevation="40" />
          </feDiffuseLighting>
          
          <feComposite in="diffOut" in2="SourceAlpha" operator="in" result="diffOutMasked" />
          <feMerge>
            <feMergeNode in="diffOutMasked" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* LITE FILTER: For Paragraphs, smaller text */}
        <filter id="paper-indentation-lite" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" result="blur1" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0" in="noise" result="coloredNoise" />
          <feDisplacementMap in="blur1" in2="coloredNoise" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="roughBlur" />
          
          <feDiffuseLighting in="roughBlur" surfaceScale="1.5" diffuseConstant="1.2" lightingColor="#ffffff" result="diffOut">
             <feDistantLight azimuth="225" elevation="40" />
          </feDiffuseLighting>
          
          <feComposite in="diffOut" in2="SourceAlpha" operator="in" result="diffOutMasked" />
          <feMerge>
            <feMergeNode in="diffOutMasked" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* MEDIUM FILTER: For Buttons */}
        <filter id="paper-indentation-medium" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="blur1" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.2 0" in="noise" result="coloredNoise" />
          <feDisplacementMap in="blur1" in2="coloredNoise" scale="2" xChannelSelector="R" yChannelSelector="G" result="roughBlur" />
          
          <feDiffuseLighting in="roughBlur" surfaceScale="2" diffuseConstant="1.3" lightingColor="#ffffff" result="diffOut">
             <feDistantLight azimuth="225" elevation="40" />
          </feDiffuseLighting>
          
          <feComposite in="diffOut" in2="SourceAlpha" operator="in" result="diffOutMasked" />
          <feMerge>
            <feMergeNode in="diffOutMasked" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
});

PressureFilter.displayName = 'PressureFilter';
