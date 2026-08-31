// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Image Preloader
 *
 * Preloads background images and character portraits for VN scenes.
 * Handles missing images gracefully with fallbacks.
 */

// ── Types ──────────────────────────────────────────────────

/** */
export interface PreloadResult {
  url: string;
  loaded: boolean;
  error?: string;
}

/** */
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

/**
 * @param url
 */
export function preloadImage(url: string,): Promise<PreloadResult> {
  // Check cache first
  if (imageCache.has(url,)) {
    return Promise.resolve({ url, loaded: true, },);
  }

  // Check if already queued
  if (preloadQueue.has(url,)) {
    return new Promise((resolve,) => {
      const check = setInterval(() => {
        if (preloadQueue.has(url,)) {
          return;
        }

        clearInterval(check,);
        const cached = imageCache.has(url,);
        resolve({ url, loaded: cached, },);
      }, 100,);
    },);
  }

  preloadQueue.add(url,);

  return new Promise((resolve,) => {
    const img = new Image();

    img.addEventListener("load", () => {
      imageCache.set(url, img,);
      preloadQueue.delete(url,);
      manageCacheSize();
      resolve({ url, loaded: true, },);
    },);

    img.addEventListener("error", () => {
      preloadQueue.delete(url,);
      resolve({
        url,
        loaded: false,
        error: `Failed to load: ${url}`,
      },);
    },);

    img.src = url;
  },);
}

// ── Batch Preloading ───────────────────────────────────────

/**
 * @param urls
 */
export async function preloadImages(urls: string[],): Promise<PreloadResult[]> {
  const settled = await Promise.allSettled(
    Array.from(urls, (url,) => preloadImage(url,),),
  );
  const out: PreloadResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") { out.push(r.value,); }
  }
  return out;
}

// ── Scene Preloading ───────────────────────────────────────

/** */
export interface SceneImages {
  backgroundUrl?: string;
  portraitUrl?: string;
}

/**
 * Collect background + portrait URLs from current and next N scenes.
 * @param scenes
 * @param currentIndex
 * @param preloadCount
 */
function collectSceneUrls(scenes: SceneImages[], currentIndex: number, preloadCount: number,): string[] {
  const urls: string[] = [];
  const indices = [currentIndex,];
  for (let i = 1; i <= preloadCount; i++) {
    if (currentIndex + i < scenes.length) { indices.push(currentIndex + i,); }
  }
  for (const idx of indices) {
    const scene = scenes[idx];
    if (scene?.backgroundUrl) { urls.push(scene.backgroundUrl,); }
    if (scene?.portraitUrl) { urls.push(scene.portraitUrl,); }
  }
  return [...new Set(urls,),];
}

/**
 * @param scenes
 * @param currentIndex
 * @param preloadCount
 */
export async function preloadSceneImages(
  scenes: SceneImages[],
  currentIndex: number,
  preloadCount = 2,
): Promise<PreloadStats> {
  const uniqueUrls = collectSceneUrls(scenes, currentIndex, preloadCount,);

  const urlsToFetch: string[] = [];
  for (const url of uniqueUrls) {
    if (!imageCache.has(url,)) { urlsToFetch.push(url,); }
  }

  if (urlsToFetch.length === 0) {
    return { total: uniqueUrls.length, loaded: 0, failed: 0, cached: uniqueUrls.length, };
  }

  const results = await preloadImages(urlsToFetch,);
  let loadedCount = 0;
  let failedCount = 0;
  for (const r of results) {
    if (r.loaded) { loadedCount++; }
    else { failedCount++; }
  }

  return {
    total: uniqueUrls.length,
    loaded: loadedCount,
    failed: failedCount,
    cached: uniqueUrls.length - urlsToFetch.length,
  };
}

// ── Cache Management ───────────────────────────────────────

/** */
function manageCacheSize(): void {
  if (imageCache.size <= MAX_CACHE_SIZE) {
    return;
  }

  // Remove oldest entries (first N entries)
  const entriesToRemove = imageCache.size - MAX_CACHE_SIZE;
  const keys = [...imageCache.keys(),];
  for (let i = 0; i < entriesToRemove; i++) {
    const key = keys[i];
    if (key) { imageCache.delete(key,); }
  }
}

/** */
export function clearCache(): void {
  imageCache.clear();
}

/** */
export function getCacheSize(): number {
  return imageCache.size;
}

// ── Utility Functions ──────────────────────────────────────

/**
 * @param url
 */
export function isImageCached(url: string,): boolean {
  return imageCache.has(url,);
}

/**
 * @param url
 */
export function getCachedImage(url: string,): HTMLImageElement | undefined {
  return imageCache.get(url,);
}

// ── Fallback Handling ──────────────────────────────────────

/**
 * @param url
 * @param fallback
 */
export function getImageWithFallback(
  url: string | undefined,
  fallback = "/images/vn-placeholder.png",
): string {
  if (!url) { return fallback; }
  return url;
}

// ── Loading Indicator ──────────────────────────────────────

/** */
export interface LoadingIndicator {
  show: () => void;
  hide: () => void;
  updateProgress: (loaded: number, total: number,) => void;
}

/**
 * @param container
 */
export function createLoadingIndicator(
  container: HTMLElement,
): LoadingIndicator {
  const indicator = document.createElement("div",);
  indicator.className = "vn-loading-indicator";
  indicator.style.display = "none";

  const text = document.createElement("span",);
  text.className = "vn-loading-text";
  text.textContent = "Loading images...";
  indicator.append(text,);

  const progress = document.createElement("div",);
  progress.className = "vn-loading-progress";
  indicator.append(progress,);

  container.append(indicator,);

  return {
    show: () => {
      indicator.style.display = "flex";
    },
    hide: () => {
      indicator.style.display = "none";
    },
    updateProgress: (loaded: number, total: number,) => {
      const percent = total > 0 ? Math.round((loaded / total) * 100,) : 0;
      text.textContent = `Loading images... ${loaded}/${total}`;
      progress.style.setProperty("--progress", String(percent / 100,),);
    },
  };
}
