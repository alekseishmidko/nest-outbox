import { runBusinessFlow } from './helpers.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    api_error_rate: ['rate<0.01'],
  },
};

export default function () {
  runBusinessFlow();
}
