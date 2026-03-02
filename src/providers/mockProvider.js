class MockProvider {
  constructor() {
    this.name = 'mock';
  }

  async findOptions(prop, query) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return Array.from({ length: 3 }).map((_, i) => ({
      provider: 'mock',
      asin: `MOCKASIN${prop.id}${i + 1}`,
      title: `${prop.prop_name} Option ${i + 1}`,
      url: `https://www.amazon.co.uk/dp/MOCKASIN${prop.id}${i + 1}`,
      imageUrl: 'https://via.placeholder.com/120?text=Mock',
      price: { amount: Number((7.99 + i * 3.2).toFixed(2)), currency: 'GBP' },
      primeEligible: true,
      delivery: { isNextDayConfirmed: true, expectedDateISO: tomorrow, message: 'Tomorrow by 1pm' },
      rating: { stars: 4.2 - i * 0.1, count: 600 - i * 42 },
      merchant: { soldBy: 'Mock Seller', fulfilledByAmazon: true },
      raw: { query },
    }));
  }
}

module.exports = MockProvider;
