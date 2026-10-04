/**
 * API Discovery Service
 * Scans a domain to discover API endpoints through multiple methods:
 * 1. Common API path probing
 * 2. Sitemap/robots.txt parsing
 * 3. OpenAPI/Swagger spec detection
 * 4. Link crawling for API references
 */

const axios = require('axios');

class APIDiscoveryService {
  constructor() {
    // Common API paths to probe
    this.commonPaths = [
      // OpenAPI/Swagger specs
      '/swagger.json',
      '/swagger/v1/swagger.json',
      '/api-docs',
      '/api-docs.json',
      '/openapi.json',
      '/openapi.yaml',
      '/v1/openapi.json',
      '/v2/openapi.json',
      '/v3/openapi.json',
      '/docs/openapi.json',
      '/.well-known/openapi.json',

      // Common REST API endpoints
      '/api',
      '/api/v1',
      '/api/v2',
      '/api/v3',
      '/v1',
      '/v2',
      '/v3',

      // Health & status
      '/health',
      '/healthz',
      '/api/health',
      '/api/healthcheck',
      '/status',
      '/api/status',
      '/ping',
      '/api/ping',

      // Auth endpoints
      '/api/auth',
      '/api/auth/login',
      '/api/auth/register',
      '/api/login',
      '/api/register',
      '/auth/login',
      '/oauth/token',
      '/api/token',

      // User endpoints
      '/api/users',
      '/api/user',
      '/api/me',
      '/api/profile',
      '/users',
      '/user',

      // Common CRUD resources
      '/api/items',
      '/api/products',
      '/api/orders',
      '/api/posts',
      '/api/articles',
      '/api/comments',
      '/api/categories',
      '/api/tags',
      '/api/files',
      '/api/uploads',
      '/api/images',
      '/api/documents',
      '/api/notifications',
      '/api/messages',
      '/api/settings',
      '/api/config',

      // GraphQL
      '/graphql',
      '/api/graphql',
      '/v1/graphql',
    ];

    // HTTP methods to try for discovered endpoints
    this.methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    // Request timeout
    this.timeout = 5000;
  }

  /**
   * Main discovery function - scans a domain for APIs
   * @param {string} baseUrl - The base URL to scan (e.g., https://api.example.com)
   * @param {object} options - Scan options
   * @returns {Promise<object>} - Discovered endpoints and metadata
   */
  async discoverAPIs(baseUrl, options = {}) {
    const {
      includeSwagger = true,
      probeCommonPaths = true,
      checkRobots = true,
      maxEndpoints = 50,
      headers = {}
    } = options;

    // Normalize base URL
    baseUrl = this.normalizeUrl(baseUrl);

    const results = {
      baseUrl,
      scannedAt: new Date().toISOString(),
      endpoints: [],
      swaggerSpec: null,
      errors: []
    };

    try {
      // 1. Try to find and parse OpenAPI/Swagger spec first
      if (includeSwagger) {
        const swaggerEndpoints = await this.findSwaggerSpec(baseUrl, headers);
        if (swaggerEndpoints.spec) {
          results.swaggerSpec = swaggerEndpoints.specUrl;
          results.endpoints.push(...swaggerEndpoints.endpoints);
        }
      }

      // 2. Check robots.txt for API hints
      if (checkRobots) {
        const robotsEndpoints = await this.parseRobotsTxt(baseUrl, headers);
        this.mergeEndpoints(results.endpoints, robotsEndpoints);
      }

      // 3. Probe common API paths
      if (probeCommonPaths) {
        const probeResults = await this.probeCommonPaths(baseUrl, headers);
        this.mergeEndpoints(results.endpoints, probeResults);
      }

      // Limit results
      results.endpoints = results.endpoints.slice(0, maxEndpoints);

      // Sort by path
      results.endpoints.sort((a, b) => a.path.localeCompare(b.path));

    } catch (error) {
      results.errors.push({
        message: error.message,
        phase: 'discovery'
      });
    }

    return results;
  }

  /**
   * Normalize URL to ensure consistent format
   */
  normalizeUrl(url) {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    // Remove trailing slash
    return url.replace(/\/+$/, '');
  }

  /**
   * Find and parse OpenAPI/Swagger specification
   */
  async findSwaggerSpec(baseUrl, headers = {}) {
    const swaggerPaths = [
      '/swagger.json',
      '/swagger/v1/swagger.json',
      '/api-docs',
      '/api-docs.json',
      '/openapi.json',
      '/openapi.yaml',
      '/v1/openapi.json',
      '/v2/openapi.json',
      '/v3/openapi.json',
      '/docs/openapi.json',
    ];

    for (const path of swaggerPaths) {
      try {
        const response = await axios.get(`${baseUrl}${path}`, {
          timeout: this.timeout,
          headers,
          validateStatus: (status) => status === 200
        });

        if (response.data && (response.data.swagger || response.data.openapi || response.data.paths)) {
          return {
            spec: response.data,
            specUrl: `${baseUrl}${path}`,
            endpoints: this.parseSwaggerSpec(response.data, baseUrl)
          };
        }
      } catch (error) {
        // Continue to next path
      }
    }

    return { spec: null, specUrl: null, endpoints: [] };
  }

  /**
   * Parse OpenAPI/Swagger spec into endpoint list
   */
  parseSwaggerSpec(spec, baseUrl) {
    const endpoints = [];
    const paths = spec.paths || {};
    const basePath = spec.basePath || '';

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase())) {
          const fullPath = basePath + path;
          endpoints.push({
            path: fullPath,
            fullUrl: `${baseUrl}${fullPath}`,
            method: method.toUpperCase(),
            summary: details.summary || '',
            description: details.description || '',
            tags: details.tags || [],
            parameters: this.extractParameters(details.parameters || []),
            responses: Object.keys(details.responses || {}),
            source: 'swagger',
            requiresAuth: this.checkAuthRequired(details)
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Extract parameter info from Swagger spec
   */
  extractParameters(params) {
    return params.map(p => ({
      name: p.name,
      in: p.in, // path, query, header, body
      required: p.required || false,
      type: p.type || p.schema?.type || 'string'
    }));
  }

  /**
   * Check if endpoint requires authentication
   */
  checkAuthRequired(details) {
    return !!(details.security && details.security.length > 0);
  }

  /**
   * Parse robots.txt for API-related paths
   */
  async parseRobotsTxt(baseUrl, headers = {}) {
    const endpoints = [];

    try {
      const response = await axios.get(`${baseUrl}/robots.txt`, {
        timeout: this.timeout,
        headers,
        validateStatus: (status) => status === 200
      });

      const lines = response.data.split('\n');
      for (const line of lines) {
        // Look for Disallow or Allow directives with /api paths
        const match = line.match(/(?:Disallow|Allow):\s*(\S*api\S*)/i);
        if (match && match[1]) {
          const path = match[1].replace(/\*/g, '');
          if (path && path !== '/api') {
            endpoints.push({
              path,
              fullUrl: `${baseUrl}${path}`,
              method: 'GET',
              summary: 'Discovered from robots.txt',
              source: 'robots',
              requiresAuth: false
            });
          }
        }
      }
    } catch (error) {
      // robots.txt not found or not accessible
    }

    return endpoints;
  }

  /**
   * Probe common API paths to find active endpoints
   */
  async probeCommonPaths(baseUrl, headers = {}) {
    const endpoints = [];
    const probePromises = [];

    for (const path of this.commonPaths) {
      probePromises.push(this.probePath(baseUrl, path, headers));
    }

    const results = await Promise.allSettled(probePromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        endpoints.push(result.value);
      }
    }

    return endpoints;
  }

  /**
   * Probe a single path to check if it's an active endpoint
   */
  async probePath(baseUrl, path, headers = {}) {
    try {
      const url = `${baseUrl}${path}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers,
        validateStatus: (status) => status < 500 // Accept any non-server-error response
      });

      // Determine if this looks like an API endpoint
      const contentType = response.headers['content-type'] || '';
      const isJson = contentType.includes('application/json');
      const isApi = isJson ||
                   (response.status === 200 && typeof response.data === 'object') ||
                   response.status === 401 || // Auth required
                   response.status === 403;   // Forbidden (but exists)

      if (isApi) {
        return {
          path,
          fullUrl: url,
          method: 'GET',
          status: response.status,
          contentType,
          summary: this.generateSummary(path, response),
          source: 'probe',
          requiresAuth: response.status === 401 || response.status === 403,
          sampleResponse: isJson ? this.truncateResponse(response.data) : null
        };
      }
    } catch (error) {
      // Path doesn't exist or timeout
    }

    return null;
  }

  /**
   * Generate a summary for a discovered endpoint
   */
  generateSummary(path, response) {
    if (response.status === 401) return 'Authentication required';
    if (response.status === 403) return 'Access forbidden';

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1] || 'root';

    if (path.includes('health') || path.includes('ping')) return 'Health check endpoint';
    if (path.includes('auth') || path.includes('login')) return 'Authentication endpoint';
    if (path.includes('swagger') || path.includes('openapi')) return 'API documentation';
    if (path.includes('graphql')) return 'GraphQL endpoint';

    return `${resource} endpoint`;
  }

  /**
   * Truncate response data for preview
   */
  truncateResponse(data) {
    const str = JSON.stringify(data);
    if (str.length > 500) {
      return JSON.parse(str.substring(0, 500) + '..."');
    }
    return data;
  }

  /**
   * Merge endpoints without duplicates
   */
  mergeEndpoints(existing, newEndpoints) {
    for (const endpoint of newEndpoints) {
      const exists = existing.some(
        e => e.path === endpoint.path && e.method === endpoint.method
      );
      if (!exists) {
        existing.push(endpoint);
      }
    }
  }

  /**
   * Quick scan - just probe most common endpoints
   */
  async quickScan(baseUrl, headers = {}) {
    const quickPaths = [
      '/api',
      '/api/v1',
      '/health',
      '/api/health',
      '/swagger.json',
      '/openapi.json',
      '/graphql',
      '/api/users',
      '/api/auth/login'
    ];

    baseUrl = this.normalizeUrl(baseUrl);
    const endpoints = [];

    const probePromises = quickPaths.map(path => this.probePath(baseUrl, path, headers));
    const results = await Promise.allSettled(probePromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        endpoints.push(result.value);
      }
    }

    return {
      baseUrl,
      scannedAt: new Date().toISOString(),
      endpoints,
      scanType: 'quick'
    };
  }
}

module.exports = new APIDiscoveryService();
