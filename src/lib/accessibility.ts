/** Per-browser accessibility adjustments, applied as classes on <html>. */
export const A11Y_STORAGE_KEY = 'fitura-a11y';
export type A11ySettings = {
  /** 0 = normal, 1 = 115 %, 2 = 130 %. */
  zoom: 0 | 1 | 2;
  contrast: boolean;
  links: boolean;
  font: boolean;
  motion: boolean;
  grayscale: boolean;
};
export const defaultA11y: A11ySettings = {
  zoom: 0,
  contrast: false,
  links: false,
  font: false,
  motion: false,
  grayscale: false,
};

export function readA11y(): A11ySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) || '{}');
    return {
      zoom: [0, 1, 2].includes(saved.zoom) ? saved.zoom : 0,
      contrast: saved.contrast === true,
      links: saved.links === true,
      font: saved.font === true,
      motion: saved.motion === true,
      grayscale: saved.grayscale === true,
    };
  } catch {
    return defaultA11y;
  }
}

export function applyA11y(settings: A11ySettings) {
  const root = document.documentElement.classList;
  root.toggle('a11y-zoom-1', settings.zoom === 1);
  root.toggle('a11y-zoom-2', settings.zoom === 2);
  root.toggle('a11y-contrast', settings.contrast);
  root.toggle('a11y-links', settings.links);
  root.toggle('a11y-font', settings.font);
  root.toggle('a11y-motion', settings.motion);
  root.toggle('a11y-grayscale', settings.grayscale);
}

/**
 * Inline script for the root layout: applies saved settings before first paint so a page never
 * flashes at the wrong size or contrast. Mirrors readA11y/applyA11y.
 */
export const a11yBootScript = `try{if(location.pathname.indexOf('/admin')===0)throw 0;var s=JSON.parse(localStorage.getItem('${A11Y_STORAGE_KEY}')||'{}'),c=document.documentElement.classList;if(s.zoom===1)c.add('a11y-zoom-1');if(s.zoom===2)c.add('a11y-zoom-2');['contrast','links','font','motion','grayscale'].forEach(function(k){if(s[k]===true)c.add('a11y-'+k)})}catch(e){}`;
