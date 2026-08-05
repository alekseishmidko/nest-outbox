import { check, sleep } from 'k6';
import {
  createMap,
  createOrder,
  createUser,
  generateAvatar,
  generateQr,
  parseJson,
  request,
} from './helpers.js';

export const options = {
  stages: [
    { duration: '20s', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:user_activity_offset}': ['p(95)<1000'],
    'http_req_duration{endpoint:user_activity_cursor}': ['p(95)<1000'],
    api_error_rate: ['rate<0.01'],
  },
};

export default function () {
  const user = createUser();

  if (!user || !user.id) {
    sleep(1);
    return;
  }

  const map = createMap(user.id);

  if (!map || !map.id) {
    sleep(1);
    return;
  }

  for (let index = 0; index < 3; index += 1) {
    createOrder(user.id, map.id);
  }

  generateAvatar(user.id);
  generateQr(map.id);

  const offsetResponse = request(
    'user_activity_offset',
    'GET',
    `/users/${user.id}/activity?pagination=offset&limit=2&offset=0`,
    null,
  );
  const cursorResponse = request(
    'user_activity_cursor',
    'GET',
    `/users/${user.id}/activity?pagination=cursor&limit=2`,
    null,
  );
  const cursorPage = parseJson(cursorResponse);

  check(parseJson(offsetResponse), {
    'offset page has items': (value) => Array.isArray(value?.items),
  });
  check(cursorPage, {
    'cursor page has items': (value) => Array.isArray(value?.items),
  });

  if (cursorPage?.pageInfo?.nextCursor) {
    request(
      'user_activity_cursor_next',
      'GET',
      `/users/${user.id}/activity?pagination=cursor&limit=2&cursor=${encodeURIComponent(
        cursorPage.pageInfo.nextCursor,
      )}`,
      null,
    );
  }

  sleep(1);
}
