import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { createTestClient } from './fixtures/test-client';
import { createGetOnlyServer, createTestServer } from './fixtures/test-server';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('Implementing a HTTP client and server', () => {
  const client = createTestClient();
  const server = createTestServer();
  before(server.start);
  after(server.stop);
  it('GET /random-numbers', async () => {
    const rnds = await client.get('/random-numbers', {
      queryParams: { foo: 'bar' },
    });
    expect(rnds).to.be.an('array');
    rnds.every((n) => expect(n).to.be.a('number'));
  });
  it('POST /add', async () => {
    const sum = await client.post('/sum', { body: [1, 2, 3, 4] });
    expect(sum).equals(10);
  });
  it('POST /product', async () => {
    const prod = await client.post('/product', { body: [10, 20, 30, 40] });
    expect(prod).equals(240_000);
  });
  it('GET *', async () => {
    const msg = await client.get('*', {
      params: { 0: '/hello' },
      body: { name: 'foo' },
    });
    expect(msg).equals('Hello, foo!');
  });
  it('GET * (invalid)', async () => {
    const getMsg = () =>
      client.get('*', { params: { 0: '/ciao' }, body: { name: 'bella' } });
    await expect(getMsg()).to.eventually.be.rejected;
  });
  it('PUT /multiply', async () => {
    const prod = await client.put('/multiply', {
      body: { first: 2, second: 5 },
    });
    expect(prod).equals(10);
  });
  it('Server-side validation error', async () => {
    const invalid = await client.post('/sum', {
      body: [1, '2', 3, 4] as number[],
    });
    expect(invalid).to.include({
      success: false,
      code: 'MY_CUSTOM_VALIDATION_ERROR',
    });
  });
  it('Type refinement produces server-side validation error', async () => {
    const invalid = await client.post('/sum/negative', { body: [-1, 2, -3] });
    expect(invalid).to.include({
      success: false,
      code: 'MY_CUSTOM_VALIDATION_ERROR',
    });
  });
  it('Type refinement produces server-side validation error with buggy handler', async () => {
    const p = client.post('/sum/negative-broken', { body: [-1, -2, -3] });
    await expect(p).to.eventually.be.rejected;
  });
  it('Type transformations work as expected for request bodies', async () => {
    const res = await client.post('/sum/transform-string', {
      body: ['1', '2', '3'],
    });
    await expect(res).eq(6);
  });
  it('Type transformations work as expected for response bodies', async () => {
    const res = await client.post('/sum/transform-response', {
      body: [1, 2, 3],
    });
    await expect(res).eq('6');
  });
});

describe('HTTP Server without JSON parser', () => {
  const client = createTestClient();
  const server = createGetOnlyServer();
  before(server.start);
  after(server.stop);

  it('GET /random-numbers works without json body parser', async () => {
    const rnds = await client.get('/random-numbers');
    expect(rnds).to.be.an('array');
    rnds.every((n) => expect(n).to.be.a('number'));
  });
});
