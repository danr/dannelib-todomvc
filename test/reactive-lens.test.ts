import { Store, Store as L } from './../src/reactive-lens'
import * as test from "tape"

function reverse<A>(xs: A[]): A[] {
  return xs.slice().reverse()
}

/** Refer to two arrays after each other */
function glue<A>(a: Store<A[]>, b: Store<A[]>): Store<A[]> {
  return a.substore(
    () => ([] as A[]).concat(a.get(), b.get()),
    (v: A[]) => {
      const al = a.get().length
      a.transaction(() => {
        a.set(v.slice(0, al))
        b.set(v.slice(al))
      })
    }
  )
}

function init<S>(s0: S, assert: test.Test): {store: Store<S>, after(s: string, x: any, count?: number): void} {
  const store = Store.init(s0)
  let current = store.get()
  let transaction_count = 0
  let oracle_count = 0
  store.on(x => {
    current = x
    transaction_count++
  })
  return {
    store,
    after: (s, x, count=1) => {
      assert.deepEqual(current, x, 'after ' + s)
      oracle_count += count
      assert.equal(transaction_count, oracle_count,
        count + ' new transaction' + (count > 1 ? 's' : ''))
    }
  }
}

test('reactive-lens', assert => {
  let initial_state = {a: 1, b: [2, 3], c: {d: [3, 4], e: 4}}
  let initial_copy = {a: 1, b: [2, 3], c: {d: [3, 4], e: 4}}
  const {store, after} = init(initial_state, assert)

  const r_a = store.at('a')
  const r_c_e = store.at('c').at('e')
  const r_a_and_c_e = L.record({a: r_a, e: r_c_e})

  r_a.set(999)
  after('set', {a: 999, b: [2, 3], c: {d: [3, 4], e: 4}})

  r_c_e.set(998)
  after('nested set', {a: 999, b: [2, 3], c: {d: [3, 4], e: 998}})

  assert.assert([r_a_and_c_e.at('a').get(), r_a_and_c_e.get()['a']].every(x => x == 999))
  r_a_and_c_e.set({a: 10, e: 20})
  assert.assert([r_a_and_c_e.at('a').get(), r_a_and_c_e.get()['a']].every(x => x == 10))
  after('record set', {a: 10, b: [2, 3], c: {d: [3, 4], e: 20}})

  const r_bs = store.at('b')
  L.each(r_bs)[1].set(882)
  after('each set', {a: 10, b: [2, 882], c: {d: [3, 4], e: 20}})

  r_bs.via(L.index(0)).via(L.def(0)).modify(x => x + 1)
  after('index modify', {a: 10, b: [3, 882], c: {d: [3, 4], e: 20}})

  L.each(glue(r_bs, store.at('c').at('d'))).map(r => r.via(L.def(0)).modify(x => x + 1))
  after('glue', {a: 10, b: [4, 883], c: {d: [4, 5], e: 20}}, 4)

  r_bs.via(L.iso(reverse, reverse)).via(L.index(0)).set(42)
  after('iso reverse', {a: 10, b: [4, 42], c: {d: [4, 5], e: 20}})

  let a: any
  const unsubscribe = r_a.on(v => a = v)
  r_a.set(404)
  after('set', {a: 404, b: [4, 42], c: {d: [4, 5], e: 20}})
  assert.equal(a, 404, 'intercepted on')

  unsubscribe()

  r_a.set(405)
  after('set', {a: 405, b: [4, 42], c: {d: [4, 5], e: 20}})
  assert.equal(a, 404, 'not intercepted on after unsubscribe')

  assert.deepEqual(initial_state, initial_copy, 'original state unchanged')

  assert.end()
})

test('array removal', assert => {
  const {store, after} = init([0,1,2], assert)
  store.via(L.index(1)).set(undefined)
  after('removing 1', [0,2])
  store.via(L.index(1)).via(L.def(0)).set(0)
  after('removing 2 via def', [0])
  assert.end()
})

test('array insertion', assert => {
  const {store, after} = init([0,1,2], assert)
  store.via(L.index(3)).set(3)
  after('inserting 3', [0,1,2,3])
  store.via(L.index(4)).via(L.def(0)).set(4)
  after('inserting 4 with def', [0,1,2,3,4])
  assert.end()
})

test('array insertion far out', assert => {
  const {store, after} = init([0,1,2], assert)
  const r4 = store.via(L.index(4))
  r4.set(4)
  after('inserting 4', [0,1,2,void 0,4])
  r4.set(undefined)
  console.log(store.get())
  const us = store.get().slice()
  us.splice(4,5)
  console.log(us)
  after('removing 4', [0,1,2])
  console.log(store.get())
  assert.end()
})

test('key', assert => {
  const {store, after} = init({apa: 1, bepa: 2} as Record<string, number>, assert)
  const apa = store.key('apa')
  const bepa = store.key('bepa')
  const cepa = store.key('cepa')
  apa.set(3)
  after('setting apa', {apa: 3, bepa: 2})
  apa.set(undefined)
  after('removing apa', {bepa: 2})
  bepa.via(L.def(0)).set(0)
  after('removing bepa via def', {})
  cepa.via(L.def(0)).set(3)
  after('inserting cepa via def', {cepa: 3})
  assert.is(cepa.get(), 3, 'get')
  assert.is(apa.get(), undefined, 'get missing')
  assert.end()
})

test('paginate', assert => {
  const {store, after} = init([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], assert)

  const empty_default = L.def([] as number[])

  const p = store.via(L.paginate(3))
  p.via(L.index(1)).via(empty_default).modify(xs => xs.map(x => -x))
  after('paginated modify', [1, 2, 3, -4, -5, -6, 7, 8, 9, 10, 11])

  p.via(L.index(3)).via(empty_default).modify(xs => xs.map(x => -x))
  after('paginated chopped modify', [1, 2, 3, -4, -5, -6, 7, 8, 9, -10, -11])

  p.via(L.index(1)).via(empty_default).modify(xs => [])
  after('paginated remove', [1, 2, 3, 7, 8, 9, -10, -11])

  store.transaction(() => {
    L.each(p.via(L.index(1)).via(empty_default)).map(r => r.modify(x => x === undefined || x > 8 ? undefined : x))
  })
  after('paginated filtering', [1, 2, 3, 7, 8, -10, -11])

  store.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(
    store.via(L.paginate(i => i)).get(),
    [[], [0], [1, 2], [3, 4, 5], [6, 7, 8, 9]],
    'triangulate'
  )

  assert.end()
})

test('arr', assert => {
  const {store, after} = init([0,1,2,3,4], assert)
  assert.deepEqual(L.arr(store, 'splice')(1,3,9,10), [1,2,3], 'return value')
  after('splicing', [0,9,10,4])
  assert.end()
})

test('subarray', assert => {
  const {store, after} = init([0,1,2,3,4], assert)
  assert.deepEqual(store.via(L.first(2)).get(), [0,1], 'first 2')
  assert.deepEqual(store.via(L.drop(2)).get(), [2,3,4], 'drop 2')
  assert.deepEqual(store.via(L.last(2)).get(), [3,4], 'last 2')
  assert.deepEqual(store.via(L.drop_end(2)).get(), [0,1,2], 'drop_end 2')

  assert.deepEqual(store.via(L.first(6)).get(), [0,1,2,3,4], 'first 6')
  assert.deepEqual(store.via(L.drop(6)).get(), [], 'drop 6')
  assert.deepEqual(store.via(L.last(6)).get(), [0,1,2,3,4], 'last 6')
  assert.deepEqual(store.via(L.drop_end(6)).get(), [], 'drop_end 6')

  const f2 = store.via(L.first(2))
  const d2 = store.via(L.drop(2))
  const l2 = store.via(L.last(2))
  const d2e = store.via(L.drop_end(2))
  f2.set([9,8,7])
  after('set first 2', [9,8,7,2,3,4])
  f2.set([])
  after('set first 2', [7,2,3,4])
  d2.set([9,8,7])
  after('set drop 2', [7,2,9,8,7])
  d2.set([])
  after('set drop 2', [7,2])
  f2.set([])
  after('set first 2', [])
  d2.set([1000])
  after('set drop 2', [1000])
  store.set([1,2,3,4,5])
  after('reset', [1,2,3,4,5])
  l2.set([])
  after('set last 2 end', [1,2,3])
  l2.set([8,9,1000])
  after('set last 2 end', [1,8,9,1000])
  d2e.set([999])
  after('set drop 2 end', [999,9,1000])
  d2e.set([])
  after('set drop 2 end', [9,1000])
  store.set([1,2,3,4,5])
  after('reset', [1,2,3,4,5])
  d2e.set([])
  after('set drop 2 end', [4,5])
  assert.end()
})

