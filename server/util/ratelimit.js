// 内存级失败次数限制，用于防止暴力猜测验证码 / 管理员密码
function createLimiter(maxFails, windowMs) {
  const hits = new Map();

  function prune(key, now) {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    blocked(key) {
      return prune(key, Date.now()).length >= maxFails;
    },
    fail(key) {
      const now = Date.now();
      const list = prune(key, now);
      list.push(now);
      hits.set(key, list);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { createLimiter };
