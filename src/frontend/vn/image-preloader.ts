/**
 * VN Image Preloader
 *
 * Preloads background images and character portraits for VN scenes.
 * Handles missing images gracefully with fallbacks.
 */

// ── Types ──────────────────────────────────────────────────

export interface PreloadResult {
  url: string;
  loaded: boolean;
  error?: string;
}

export interface PreloadStats {
  total: number;
  loaded: number;
  failed: number;
  cached: number;
}

// ── Image Cache ────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
const preloadQueue = new Set<string>();
const MAX_CACHE_SIZE = 50;

// ── Core Preload Function ──────────────────────────────────

export function preloadImage(url: string): Promise<PreloadResult> {
  // Check cache first
  if (imageCache.has(url)) {
    return Promise.resolve({ url, loaded: true },);
  }

  // Check if already queued
  if (preloadQueue.has(url)) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!preloadQueue.has(url)) {
          clearInterval(check,);
          const cached = imageCache.has(url);
          resolve({ url, loaded: cached },);
        }
      }, 100,);
    },);
  }

  preloadQueue.add(url,);

  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      imageCache.set(url, img,);
      preloadQueue.delete(url,);
      manageCacheSize();
      resolve({ url, loaded: true },);
    };

    img.onerror = () => {
      preloadQueue.delete(url,);
      resolve({
        url,
        loaded: false,
        error: `Failed to load: ${url}`,
      },);
    };

    img.src = url;
  },);
}

// ── Batch Preloading ───────────────────────────────────────

export async function preloadImages(urls: string[]): Promise<PreloadResult[]> {
  const results = await Promise.all(
    urls.map((url) => preloadImage(url),),
  );
  return results;
}

// ── Scene Preloading ───────────────────────────────────────

export interface SceneImages {
  backgroundUrl?: string;
  portraitUrl?: string;
}

export async function preloadSceneImages(
  scenes: SceneImages[],
  currentIndex: number,
  preloadCount: number = 2,
): Promise<PreloadStats> {
  const urlsToPreload: string[] = [];
  
  // Current scene
  const current = scenes[currentIndex];
  if (current) {
    if (current.backgroundUrl) { urlsToPreload.push(current.backgroundUrl,); }
    if (current.portraitUrl) { urlsToPreload.push(current.portraitUrl,); }
  }

  // Next N scenes
  for (let i = 1; i <= preloadCount; i++) {
    const nextIndex = currentIndex + i;
    if (nextIndex < scenes.length) {
      const next = scenes[nextIndex];
      if (next) {
        if (next.backgroundUrl) { urlsToPreload.push(next.backgroundUrl,); }
        if (next.portraitUrl) { urlsToPreload.push(next.portraitUrl,); }
      }
    }
  }

  // Deduplicate
  const uniqueUrls = [...new Set(urlsToPreload,)];
  
  // Filter out already cached
  const urlsToFetch = uniqueUrls.filter((url) => !imageCache.has(url,));

  if (urlsToFetch.length === 0) {
    return {
      total: uniqueUrls.length,
      loaded: 0,
      failed: 0,
      cached: uniqueUrls.length,
    };
  }

  const results = await preloadImages(urlsToFetch,);

  return {
    total: uniqueUrls.length,
    loaded: results.filter((r) => r.loaded,).length,
    failed: results.filter((r) => !r.loaded,).length,
    cached: uniqueUrls.length - urlsToFetch.length,
  };
}

// ── Cache Management ───────────────────────────────────────

function manageCacheSize(): void {
  if (imageCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entries (first N entries)
    const entriesToRemove = imageCache.size - MAX_CACHE_SIZE;
    const keys = [...imageCache.keys()];
    for (let i = 0; i < entriesToRemove; i++) {
      const key = keys[i];
      if (key) { imageCache.delete(key,); }
    }
  }
}

export function clearCache(): void {
  imageCache.clear();
}

export function getCacheSize(): number {
  return imageCache.size;
}

// ── Utility Functions ──────────────────────────────────────

export function isImageCached(url: string): boolean {
  return imageCache.has(url,);
}

export function getCachedImage(url: string): HTMLImageElement | undefined {
  return imageCache.get(url,);
}

// ── Fallback Handling ──────────────────────────────────────

export function getImageWithFallback(
  url: string | undefined,
  fallback: string = "/images/vn-placeholder.png",
): string {
  if (!url) { return fallback; }
  return url;
}

// ── Loading Indicator ──────────────────────────────────────

export interface LoadingIndicator {
  show: () => void;
  hide: () => void;
  updateProgress: (loaded: number, total: number) => void;
}

export function createLoadingIndicator(
  container: HTMLElement,
): LoadingIndicator {
  const indicator = document.createElement("div",);
  indicator.className = "vn-loading-indicator";
  indicator.style.display = "none";
  
  const text = document.createElement("span",);
  text.className = "vn-loading-text";
  text.textContent = "Loading images...";
  indicator.appendChild(text,);

  const progress = document.createElement("div",);
  progress.className = "vn-loading-progress";
  indicator.appendChild(progress,);

  container.appendChild(indicator,);

  return {
    show: () => { indicator.style.display = "flex"; },
    hide: () => { indicator.style.display = "none"; },
    updateProgress: (loaded: number, total: number) => {
      const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
      text.textContent = `Loading images... ${loaded}/${total}`;
      progress.style.setProperty("--progress", String(percent / 100),);
    },
  };
}
