async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        attempt += 1;
        await sleep(300 * (2 ** attempt));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt += 1;
      await sleep(300 * (2 ** attempt));
    }
  }
}

module.exports = { fetchWithRetry };
