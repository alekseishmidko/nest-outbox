import { readFile } from 'node:fs/promises';

type OpenApi = {
  info?: { version?: string };
  paths?: Record<string, Record<string, Operation>>;
};
type Operation = {
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Schema }>;
  };
  responses?: Record<string, unknown>;
};
type Schema = { required?: string[] };

async function main(): Promise<void> {
  const [basePath, currentPath] = process.argv.slice(2);
  if (!basePath || !currentPath)
    throw new Error('Usage: check-breaking <base-spec> <current-spec>');
  const base = JSON.parse(await readFile(basePath, 'utf8')) as OpenApi;
  const current = JSON.parse(await readFile(currentPath, 'utf8')) as OpenApi;
  const breaking: string[] = [];

  for (const [path, methods] of Object.entries(base.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters') continue;
      const next = current.paths?.[path]?.[method];
      if (!next) {
        breaking.push(`removed operation ${method.toUpperCase()} ${path}`);
        continue;
      }
      const baseRequired = requiredBodyFields(operation);
      const nextRequired = requiredBodyFields(next);
      for (const field of baseRequired) {
        if (!nextRequired.has(field)) continue;
      }
      for (const field of nextRequired) {
        if (!baseRequired.has(field))
          breaking.push(
            `new required request field ${method.toUpperCase()} ${path}: ${field}`,
          );
      }
      const baseResponses = Object.keys(operation.responses ?? {});
      const nextResponses = Object.keys(next.responses ?? {});
      for (const status of baseResponses) {
        if (!nextResponses.includes(status))
          breaking.push(
            `removed response ${status} from ${method.toUpperCase()} ${path}`,
          );
      }
    }
  }

  if (breaking.length && base.info?.version === current.info?.version) {
    throw new Error(
      `Breaking OpenAPI changes require API version change (${current.info?.version}):\n${breaking.join('\n')}`,
    );
  }
  console.log(
    breaking.length
      ? `Breaking changes accepted by version bump: ${base.info?.version} -> ${current.info?.version}`
      : 'No breaking OpenAPI changes detected',
  );
}

function requiredBodyFields(operation: Operation): Set<string> {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  return new Set(schema?.required ?? []);
}

void main();
