/**
 * Unit tests for A2A Well-Known Manifest helpers
 */

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('wellKnown', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('fetchManifest', () => {
        it('should fetch manifest successfully', async () => {
            const { fetchManifest } = await import('../wellKnown');

            const mockManifest = {
                name: 'Test Agent',
                url: 'https://test.com',
                protocol_version: 'A2A/1.0',
                authentication: { type: 'amorce', public_key: 'test-key' }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockManifest)
            });

            const result = await fetchManifest('test-agent-id');

            expect(result).toEqual(mockManifest);
            expect(result.protocol_version).toBe('A2A/1.0');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/agents/test-agent-id/manifest')
            );
        });

        it('should throw on 404', async () => {
            const { fetchManifest } = await import('../wellKnown');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            await expect(fetchManifest('nonexistent')).rejects.toThrow('404');
        });

        it('should use custom directory URL', async () => {
            const { fetchManifest } = await import('../wellKnown');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ name: 'test' })
            });

            await fetchManifest('test-id', 'https://custom-dir.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://custom-dir.com/api/v1/agents/test-id/manifest'
            );
        });
    });

    describe('serveWellKnown', () => {
        it('should create middleware that handles /.well-known/agent.json', async () => {
            const { serveWellKnown } = await import('../wellKnown');

            const mockManifest = { name: 'test', protocol_version: 'A2A/1.0' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockManifest)
            });

            const middleware = serveWellKnown({ agentId: 'test-agent' });

            // Create mock request/response
            const req = { path: '/.well-known/agent.json' };
            const res = {
                setHeader: jest.fn(),
                json: jest.fn()
            };
            const next = jest.fn();

            await middleware(req, res, next);

            expect(res.json).toHaveBeenCalledWith(mockManifest);
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
            expect(next).not.toHaveBeenCalled();
        });

        it('should call next() for non-matching paths', async () => {
            const { serveWellKnown } = await import('../wellKnown');

            const middleware = serveWellKnown({ agentId: 'test-agent' });

            const req = { path: '/api/other' };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });

        it('should cache manifest for configured TTL', async () => {
            const { serveWellKnown } = await import('../wellKnown');

            const mockManifest = { name: 'cached', protocol_version: 'A2A/1.0' };
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockManifest)
            });

            const middleware = serveWellKnown({ agentId: 'test', cacheTtl: 60 });

            const req = { path: '/.well-known/agent.json' };
            const res1 = { setHeader: jest.fn(), json: jest.fn() };
            const res2 = { setHeader: jest.fn(), json: jest.fn() };

            // First call - should fetch
            await middleware(req, res1, jest.fn());
            // Second call - should use cache
            await middleware(req, res2, jest.fn());

            // Fetch should only be called once due to caching
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(res2.json).toHaveBeenCalledWith(mockManifest);
        });
    });

    describe('createWellKnownHandler', () => {
        it('should create Next.js handler', async () => {
            const { createWellKnownHandler } = await import('../wellKnown');

            const mockManifest = { name: 'nextjs', protocol_version: 'A2A/1.0' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockManifest)
            });

            const handler = createWellKnownHandler({ agentId: 'next-agent' });

            const mockRequest = new Request('https://test.com/.well-known/agent.json');
            const response = await handler(mockRequest);

            expect(response).toBeInstanceOf(Response);
            expect(response.headers.get('Content-Type')).toBe('application/json');

            const body = await response.json();
            expect(body).toEqual(mockManifest);
        });

        it('should return 500 on fetch error', async () => {
            const { createWellKnownHandler } = await import('../wellKnown');

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error'
            });

            const handler = createWellKnownHandler({ agentId: 'error-agent' });
            const response = await handler(new Request('https://test.com'));

            expect(response.status).toBe(500);
        });
    });

    describe('generateManifestJson', () => {
        it('should generate formatted JSON string', async () => {
            const { generateManifestJson } = await import('../wellKnown');

            const mockManifest = {
                name: 'generated',
                protocol_version: 'A2A/1.0',
                capabilities: ['test']
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockManifest)
            });

            const result = await generateManifestJson('gen-agent');

            expect(typeof result).toBe('string');
            const parsed = JSON.parse(result);
            expect(parsed).toEqual(mockManifest);
            expect(result).toContain('\n'); // Should be pretty-printed
        });
    });
});
