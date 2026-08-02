import { runBusinessFlow } from './helpers.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '2m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    api_error_rate: ['rate<0.01'],
  },
};

export default function () {
  runBusinessFlow();
}
