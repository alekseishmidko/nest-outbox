import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const apiErrorRate = new Rate('api_error_rate');
export const businessFlowDuration = new Trend('business_flow_duration');

export function request(name, method, path, body, expectedStatuses = [200, 201]) {
  const params = {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-request-id': `k6-${name}-${__VU}-${__ITER}`,
    },
    tags: {
      endpoint: name,
    },
  };

  const payload = body ? JSON.stringify(body) : null;
  const startedAt = Date.now();
  const response = http.request(method, `${BASE_URL}${path}`, payload, params);

  businessFlowDuration.add(Date.now() - startedAt, { endpoint: name });

  const isExpected = expectedStatuses.includes(response.status);
  apiErrorRate.add(!isExpected, { endpoint: name });

  check(response, {
    [`${name}: status is expected`]: () => isExpected,
  });

  return response;
}

export function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export function uniqueEmail() {
  return `k6-${__VU}-${__ITER}-${Date.now()}@example.com`;
}

export function createUser() {
  const response = request('create_user', 'POST', '/users', {
    email: uniqueEmail(),
    name: `K6 User ${__VU}-${__ITER}`,
    avatarSeed: `k6-seed-${__VU}-${__ITER}-${Date.now()}`,
  });

  return parseJson(response);
}

export function createMap(userId) {
  const response = request('create_map', 'POST', '/maps', {
    title: `K6 Park ${__VU}-${__ITER}`,
    description: 'Load-test map for QR generation.',
    latitude: 40.785091,
    longitude: -73.968285,
    ownerUserId: userId,
  });

  return parseJson(response);
}

export function createOrder(userId, mapId) {
  const response = request('create_order', 'POST', '/orders', {
    userId,
    mapId,
    totalAmount: 99.9,
  });

  return parseJson(response);
}

export function generateAvatar(userId) {
  return request('generate_avatar', 'POST', `/media/users/${userId}/avatar`, {});
}

export function generateQr(mapId) {
  return request('generate_qr', 'POST', `/media/maps/${mapId}/qr`, {
    payload: `${BASE_URL}/maps/${mapId}`,
  });
}

export function readLists(userId, mapId) {
  request('list_users', 'GET', '/users?limit=20&offset=0', null);
  request('list_maps', 'GET', '/maps?limit=20&offset=0', null);
  request('list_orders', 'GET', '/orders?limit=20&offset=0', null);
  request(
    'orders_by_user',
    'GET',
    `/orders/users/${userId}?limit=20&offset=0`,
    null,
  );
  request('orders_by_map', 'GET', `/orders/maps/${mapId}?limit=20&offset=0`, null);
  request(
    'orders_join_overview',
    'GET',
    '/orders/reports/overview?limit=20&offset=0',
    null,
  );
  request(
    'user_activity_offset',
    'GET',
    `/users/${userId}/activity?pagination=offset&limit=20&offset=0`,
    null,
  );
  request(
    'user_activity_cursor',
    'GET',
    `/users/${userId}/activity?pagination=cursor&limit=20`,
    null,
  );
}

export function runBusinessFlow() {
  const user = createUser();
  check(user, {
    'user was created': (value) => value && Number.isInteger(value.id),
  });

  if (!user || !user.id) {
    sleep(1);
    return;
  }

  const map = createMap(user.id);
  check(map, {
    'map was created': (value) => value && Number.isInteger(value.id),
  });

  if (!map || !map.id) {
    sleep(1);
    return;
  }

  const order = createOrder(user.id, map.id);
  check(order, {
    'order was created': (value) => value && Number.isInteger(value.id),
  });

  generateAvatar(user.id);
  generateQr(map.id);
  readLists(user.id, map.id);
  sleep(1);
}
