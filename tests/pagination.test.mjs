import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAll } from '../src/server/pagination.ts'

function queryFixture(count, cap = 500, failAt = Infinity) {
  const source = Array.from({ length: count }, (_, id) => ({ id, montant: 25000 }))
  const ranges = []
  const orders = []
  let from = 0, to = 0
  const query = {
    order(column, options) { orders.push({ column, options }); return query },
    range(start, end) { from = start; to = end; ranges.push([start, end]); return query },
    then(resolve, reject) {
      return Promise.resolve(from >= failAt
        ? { data: null, error: { message: 'private database failure', code: 'XX000' } }
        : { data: source.slice(from, Math.min(to + 1, from + cap)), error: null }).then(resolve, reject)
    },
  }
  return { query, source, ranges, orders }
}

test('API : pagination complète au-delà de mille paiements et tri stable', async () => {
  const fixture = queryFixture(1203)
  const { data } = await fetchAll(fixture.query)
  assert.deepEqual(data, fixture.source)
  assert.equal(data.reduce((total, row) => total + row.montant, 0), 30075000)
  assert.deepEqual(fixture.orders, [{ column: 'id', options: { ascending: true } }])
  assert.deepEqual(fixture.ranges.map(([from]) => from), [0, 500, 1000, 1203])
})

test('API : plafond serveur inférieur à la page demandée sans perte de lignes', async () => {
  const fixture = queryFixture(1101, 200)
  assert.deepEqual((await fetchAll(fixture.query)).data, fixture.source)
  assert.deepEqual(fixture.ranges.map(([from]) => from), [0, 200, 400, 600, 800, 1000, 1101])
})

test('API : panne sur page suivante ne retourne pas un revenu partiel', async () => {
  const fixture = queryFixture(1101, 500, 500)
  await assert.rejects(fetchAll(fixture.query), error => error.code === 'XX000' && !error.message.includes('private database failure'))
  assert.deepEqual(fixture.ranges.map(([from]) => from), [0, 500])
})
