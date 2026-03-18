// Set up test environment
process.env.NODE_ENV = 'test';
process.env.ENCRYPTSECRET = 'test-secret-key';

// Helper function to create mock requests
export function createMockRequest(
  overrides?: Partial<Record<string, unknown>>
) {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: {},
    queryStringParameters: {},
    body: '',
    isBase64Encoded: false,
    requestContext: {
      appId: 'test-app-id',
      envId: 'test-env-id',
      requestId: 'test-request-id',
      uin: '123456'
    },
    ...overrides
  };
}

// Helper to wait for async operations
export function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
