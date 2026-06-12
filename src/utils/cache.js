/**
 * 本地缓存工具
 * 用于减少重复请求，提升用户体验
 */

const CACHE_PREFIX = 'toolbox_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 默认 5 分钟

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} data - 缓存数据
 * @param {number} ttl - 过期时间（毫秒），默认 5 分钟
 */
export function setCache(key, data, ttl = DEFAULT_TTL) {
  try {
    const item = {
      data,
      expiry: Date.now() + ttl,
      created: Date.now()
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
    return true;
  } catch (e) {
    console.warn('Cache set failed:', e);
    return false;
  }
}

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存数据，过期或不存在返回 null
 */
export function getCache(key) {
  try {
    const itemStr = localStorage.getItem(CACHE_PREFIX + key);
    if (!itemStr) return null;

    const item = JSON.parse(itemStr);
    
    // 检查是否过期
    if (Date.now() > item.expiry) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    
    return item.data;
  } catch (e) {
    console.warn('Cache get failed:', e);
    return null;
  }
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
export function removeCache(key) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 清空所有缓存
 */
export function clearAllCache() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return true;
  } catch (e) {
    console.warn('Cache clear failed:', e);
    return false;
  }
}

/**
 * 获取缓存信息（用于调试）
 */
export function getCacheInfo() {
  const info = {
    totalItems: 0,
    totalSize: 0,
    items: []
  };
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        const value = localStorage.getItem(key);
        info.totalItems++;
        info.totalSize += value.length;
        info.items.push({
          key: key.replace(CACHE_PREFIX, ''),
          size: value.length
        });
      }
    }
  } catch (e) {
    console.warn('Cache info failed:', e);
  }
  
  return info;
}

/**
 * 缓存键生成器
 * @param {string} url - 请求 URL
 * @param {object} params - 请求参数
 * @returns {string} 缓存键
 */
export function generateCacheKey(url, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return sortedParams ? `${url}?${sortedParams}` : url;
}