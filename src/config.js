const path = require('path');
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  dbPath: path.join(process.cwd(), 'data', 'props-tool.db'),
  rainforestApiKey: process.env.RAINFOREST_API_KEY || '',
  amazonDomain: process.env.AMAZON_DOMAIN || 'amazon.co.uk',
  defaultDeliveryPostcode: process.env.DEFAULT_DELIVERY_POSTCODE || 'SW1A1AA',
  rainforestTimeoutMs: Number(process.env.RAINFOREST_TIMEOUT_MS || 180000),
  searchCandidateLimit: Number(process.env.SEARCH_CANDIDATE_LIMIT || 12),
  offersPagesMax: Number(process.env.OFFERS_PAGES_MAX || 1),
  cacheTtlHours: Number(process.env.CACHE_TTL_HOURS || 6),
  concurrencyLimit: Number(process.env.CONCURRENCY_LIMIT || 2),
};
