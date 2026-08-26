import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Spec = {
  info: { version: string };
  components?: { schemas?: Record<string, { required?: string[] }> };
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: {
          content?: Record<string, { schema?: { $ref?: string } }>;
        };
        responses?: Record<string, unknown>;
      }
    >
  >;
};

describe('OpenAPI consumer contract', () => {
  const spec = JSON.parse(
    readFileSync(resolve(process.cwd(), '../docs/openapi.json'), 'utf8'),
  ) as Spec;

  it('publishes versioned key endpoint operations and DTO references', () => {
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const [path, method, response] of [
      ['/auth/login', 'post', '201'],
      ['/auth/refresh', 'post', '201'],
      ['/orders', 'post', '201'],
      ['/orders/{id}/status', 'patch', '200'],
      ['/orders/reports/overview', 'get', '200'],
      ['/users/{id}/activity', 'get', '200'],
      ['/maps', 'get', '200'],
    ] as const) {
      const operation = spec.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation?.responses?.[response]).toBeDefined();
    }
    expect(
      spec.paths['/auth/login']?.post?.requestBody?.content?.[
        'application/json'
      ]?.schema?.$ref,
    ).toBe('#/components/schemas/LoginDto');
    expect(
      spec.paths['/orders']?.post?.requestBody?.content?.['application/json']
        ?.schema?.$ref,
    ).toBe('#/components/schemas/CreateOrderDto');
    expect(spec.components?.schemas?.ApiErrorResponse?.required).toEqual([
      'statusCode',
      'errorCode',
      'message',
      'path',
      'method',
      'timestamp',
    ]);
  });
});
