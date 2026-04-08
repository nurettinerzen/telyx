/**
 * Telyx Logo Components
 * Using official 2026 logo PNG images
 */

import React from 'react';
import Image from 'next/image';

const HORIZONTAL_LIGHT = '/telyx-logo-horizontal-light.png';
const HORIZONTAL_DARK = '/telyx-logo-horizontal-dark.png';
const VERTICAL_LIGHT = '/telyx-logo-vertical-light.png';
const VERTICAL_DARK = '/telyx-logo-vertical-dark.png';
const SYMBOL_LIGHT = '/telyx-symbol-light.png';
const SYMBOL_DARK = '/telyx-symbol-dark.png';

// Full logo with icon and text
export function TelyxLogoFull({ className = '', width = 220, height = 62, darkMode = false }) {
  return (
    <div className={`relative ${className}`}>
      <Image
        src={HORIZONTAL_LIGHT}
        alt="Telyx"
        width={width}
        height={height}
        className={`object-contain ${darkMode ? 'hidden' : 'block'} dark:hidden`}
        priority
      />
      <Image
        src={HORIZONTAL_DARK}
        alt="Telyx"
        width={width}
        height={height}
        className={`object-contain ${darkMode ? 'block' : 'hidden'} dark:block`}
        priority
      />
    </div>
  );
}

// Icon only
export function TelyxIcon({ className = 'w-8 h-8', darkMode = false }) {
  return (
    <div className={`relative ${className}`}>
      <Image
        src={darkMode ? SYMBOL_DARK : SYMBOL_LIGHT}
        alt="Telyx"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}

// Compact version for sidebar
export function TelyxLogoCompact({ darkMode = false, width = 84, height = 24 }) {
  return (
    <div className="relative">
      <Image
        src={darkMode ? HORIZONTAL_DARK : HORIZONTAL_LIGHT}
        alt="Telyx"
        width={width}
        height={height}
        className="object-contain"
        priority
      />
    </div>
  );
}

// Stacked version with symbol above wordmark
export function TelyxLogoStacked({ className = '', width = 180, height = 180, darkMode = false }) {
  return (
    <div className={`relative ${className}`}>
      <Image
        src={darkMode ? VERTICAL_DARK : VERTICAL_LIGHT}
        alt="Telyx"
        width={width}
        height={height}
        className="object-contain"
        priority
      />
    </div>
  );
}

// Text only - deprecated, use TelyxLogoFull instead
export function TelyxLogoText({ className = '', darkMode = false }) {
  return <TelyxLogoFull className={className} darkMode={darkMode} />;
}

// White version for dark backgrounds
export function TelyxLogoWhite({ width = 160, height = 44 }) {
  return (
    <div className="relative">
      <Image
        src={HORIZONTAL_DARK}
        alt="Telyx"
        width={width}
        height={height}
        className="object-contain"
        priority
      />
    </div>
  );
}

export default TelyxLogoFull;
