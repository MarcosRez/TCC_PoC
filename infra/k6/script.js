import http from 'k6/http'
import { sleep } from 'k6'

export const options = { vus: Number(__ENV.VUS || 100), duration: __ENV.DURATION || '2m' }

const URL = (__ENV.BASE_URL || 'http://svc1:4001') + '/graphql'

const q = JSON.stringify({ query: '{ items { id name value } }' })

export default function () {
  http.post(URL, q, { headers: { 'Content-Type': 'application/json' } })
  sleep(0.2)
}
