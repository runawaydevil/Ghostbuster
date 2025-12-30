/**
 * Simple integration test for the GitHub crawler
 */

import { createCrawler } from './crawl.js';
import { getConfigAndData } from './config.js';

async function testCrawler() {
  console.log('Testing Le Ghost GitHub crawler...\n');

  try {
    // Load configuration and data
    const { config, data } = getConfigAndData();
    
    console.log('✅ Configuration loaded successfully');
    console.log(`- Found ${data.sources.length} search queries`);
    console.log(`- Rate limit: ${config.crawler.rateLimit.requestsPerHour} requests/hour`);
    console.log(`- Cache TTL: ${config.crawler.cache.ttl}ms`);

    // Create crawler
    const crawler = createCrawler({
      token: config.github.token,
      rateLimit: config.crawler.rateLimit,
      cache: config.crawler.cache
    }, {
      maxPages: 1, // Limit to 1 page for testing
      delayBetweenQueries: 500,
      includeArchived: false,
      includeForks: true
    });

    console.log('\n✅ Crawler created successfully');

    // Test rate limit check
    const rateLimit = await crawler.getRateLimit();
    console.log(`\n📊 Current rate limit status:`);
    console.log(`- Limit: ${rateLimit.limit}`);
    console.log(`- Remaining: ${rateLimit.remaining}`);
    console.log(`- Reset: ${new Date(rateLimit.reset * 1000).toISOString()}`);

    // Test with a simple query (limit to 5 results for testing)
    const testQueries = data.sources.slice(0, 1).map((query: any) => ({
      ...query,
      maxResults: 5
    }));

    console.log(`\n🔍 Testing crawl with ${testQueries.length} query...`);
    const result = await crawler.crawl(testQueries);

    console.log(`\n📈 Crawl Results:`);
    console.log(`- Repositories found: ${result.repositories.length}`);
    console.log(`- API calls used: ${result.apiCallsUsed}`);
    console.log(`- Cache hits: ${result.cacheHits}`);
    console.log(`- Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (result.repositories.length > 0) {
      console.log(`\n📋 Sample repositories:`);
      result.repositories.slice(0, 3).forEach(repo => {
        console.log(`- ${repo.name} (${repo.full_name})`);
        console.log(`  Stars: ${repo.stargazers_count}, Topics: ${repo.topics.join(', ')}`);
        console.log(`  Archived: ${repo.archived}, Fork: ${repo.fork}`);
      });

      // Test metadata enrichment for first repository
      console.log(`\n🔍 Testing metadata enrichment for: ${result.repositories[0].full_name}`);
      const metadata = await crawler.getRepositoryMetadata(result.repositories[0]);
      console.log(`- Has README: ${metadata.readme !== null}`);
      console.log(`- Has Handlebars files: ${metadata.hasHandlebarsFiles}`);
      console.log(`- Has package.json: ${metadata.hasPackageJson}`);
      console.log(`- Has Ghost theme files: ${metadata.hasGhostThemeFiles}`);
    }

    console.log('\n✅ Crawler test completed successfully!');

  } catch (error) {
    console.error('❌ Crawler test failed:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.message.includes('GITHUB_TOKEN')) {
      console.log('\n💡 Tip: Make sure to set the GITHUB_TOKEN environment variable');
      console.log('   You can create a personal access token at: https://github.com/settings/tokens');
    }
    
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testCrawler();
}