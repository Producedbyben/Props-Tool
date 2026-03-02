const { amazonDomain, rainforestApiKey, searchCandidateLimit, offersPagesMax, rainforestTimeoutMs } = require('../config');
const { fetchWithRetry } = require('../services/http');

function londonTomorrowISO() {
  const now = new Date();
  const london = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  london.setDate(london.getDate() + 1);
  return london.toISOString().slice(0, 10);
}

function nextDayFromOffer(offer) {
  const upsell = offer?.delivery?.upsell?.value || '';
  const comments = offer?.delivery?.comments || '';
  const text = `${upsell} ${comments}`.toLowerCase();
  if (!text.includes('tomorrow')) return null;
  return {
    isNextDayConfirmed: true,
    expectedDateISO: londonTomorrowISO(),
    message: (offer?.delivery?.upsell?.value || offer?.delivery?.comments || 'Tomorrow').trim(),
  };
}

class RainforestProvider {
  constructor(queue, auditLogger) {
    this.name = 'rainforest';
    this.queue = queue;
    this.auditLogger = auditLogger;
  }

  async _call(type, params, ctx = {}) {
    const started = Date.now();
    const qs = new URLSearchParams({
      api_key: rainforestApiKey,
      type,
      amazon_domain: amazonDomain,
      ...params,
    });
    const url = `https://api.rainforestapi.com/request?${qs.toString()}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), rainforestTimeoutMs);
      const res = await this.queue.push(() => fetchWithRetry(url, { signal: ctrl.signal }, 3));
      clearTimeout(t);
      const json = await res.json();
      await this.auditLogger({ provider: 'rainforest', type, success: res.ok ? 1 : 0, latencyMs: Date.now() - started, creditsUsed: json?.request_info?.credits_used, errorCode: res.ok ? null : String(res.status), ...ctx });
      if (!res.ok) throw new Error(`Rainforest ${type} failed: ${res.status}`);
      return json;
    } catch (error) {
      await this.auditLogger({ provider: 'rainforest', type, success: 0, latencyMs: Date.now() - started, creditsUsed: null, errorCode: error.name || 'error', ...ctx });
      throw error;
    }
  }

  async findOptions(prop, query, ctx = {}) {
    const searchData = await this._call('search', {
      search_term: query,
      exclude_sponsored: 'true',
      sort_by: 'price_low_to_high',
      number_of_results: String(Math.max(searchCandidateLimit, 20)),
    }, ctx);

    const candidates = (searchData.search_results || []).slice(0, searchCandidateLimit);
    const validOffers = [];

    for (const item of candidates) {
      const asin = item.asin;
      if (!asin) continue;
      for (let page = 1; page <= offersPagesMax; page += 1) {
        const offersData = await this._call('offers', {
          asin,
          offers_prime: 'true',
          offers_condition_new: 'true',
          page: String(page),
        }, { ...ctx, asin });

        for (const offer of offersData.offers || []) {
          if (!offer?.is_prime) continue;
          const delivery = nextDayFromOffer(offer);
          if (!delivery) continue;
          const amount = Number(offer?.price?.value || offer?.price?.raw?.replace(/[£,]/g, ''));
          if (!Number.isFinite(amount)) continue;
          const product = offersData.product || {};
          validOffers.push({
            provider: 'rainforest',
            asin,
            title: product.title || item.title || 'Unknown product',
            url: `https://www.amazon.co.uk/dp/${asin}`,
            imageUrl: product.image || item.thumbnail || null,
            price: { amount, currency: 'GBP' },
            primeEligible: true,
            delivery,
            rating: product.rating ? { stars: Number(product.rating), count: Number(product.ratings_total || 0) } : null,
            merchant: {
              soldBy: offer?.seller?.name || null,
              fulfilledByAmazon: /amazon/i.test(offer?.fulfillment?.name || ''),
            },
            raw: {
              delivery: offer?.delivery,
              seller: offer?.seller,
              price: offer?.price,
            },
          });
        }
      }
    }

    validOffers.sort((a, b) => {
      if (a.price.amount !== b.price.amount) return a.price.amount - b.price.amount;
      const starsDiff = (b.rating?.stars || 0) - (a.rating?.stars || 0);
      if (starsDiff !== 0) return starsDiff;
      return (b.rating?.count || 0) - (a.rating?.count || 0);
    });

    const seen = new Set();
    const unique = [];
    for (const v of validOffers) {
      const key = `${v.asin}-${v.price.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(v);
      if (unique.length === 3) break;
    }
    return unique;
  }
}

module.exports = RainforestProvider;
