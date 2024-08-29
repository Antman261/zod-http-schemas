import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as pathToRegExp from 'path-to-regexp';
import {
  Anonymize,
  NamedParams,
  Paths,
  RequestBody,
  RequestBodyInput,
  ResponseBody,
} from '../util';
import { HttpSchema, Method } from '../shared';

/** Returns a strongly typed object for making requests to a remote HTTP server that implements the given `schema`. */
export function createHttpClient<S extends HttpSchema>(
  schema: S,
  options?: Partial<HttpClientOptions>
): HttpClient<S> {
  const axiosClient = axios.create({
    ...options,
    validateStatus: options?.validateStatus ?? ((status) => status < 500),
  });

  return {
    get: (path, info?) => request('GET', path, info),
    post: (path, info?) => request('POST', path, info),
    put: (path, info?) => request('PUT', path, info),
    patch: (path, info?) => request('PATCH', path, info),
    delete: (path, info?) => request('DELETE', path, info),
  };

  async function request(
    method: Method,
    path: string,
    info?: {
      params?: any;
      body?: any;
      queryParams?: AxiosRequestConfig['params'];
    }
  ) {
    // Create the actual URL by substituting params (if any) into the path pattern.
    // NB: what axios calls `params` are really queryparams, so different from our `params`,
    // which are part of the path that is pattern-matched by express on the server.
    // NB2: pathToRegExp doesn't handle '*' wildcards like express, so we substitute those manually below.
    let i = 0;
    const url = pathToRegExp
      .compile(path)(info?.params)
      .replace(/\*/g, () => info?.params[i++]);

    // here we pick the schema definition from given method & path
    // then we'll parse the response payload
    // this will ensure we have correct types in the Frontend (e.g.: Date instance, not a string of date)
    const responseBodySchema = schema[`${method} ${path}`].responseBody;

    return axiosClient({
      method,
      url,
      data: info?.body,
      params: info?.queryParams
    }).then((response) => {
      // if we fail to parse here, mean our API is returning something weird
      // an Exception would be thrown by Zod
      response.data = responseBodySchema.parse(response.data);

      return response;
    });
  }
}

export type HttpClientOptions = AxiosRequestConfig;

/** Strongly typed object for making requests to a remote HTTP server that implements the schema `S`. */
export type HttpClient<S extends HttpSchema> = {
  [M in Method as Lowercase<M>]: <P extends Paths<S, M>>(
    path: P,
    ...info: HasNamedParamsOrBody<S, M, P> extends false
      ? [RequestInfo<S, M, P>?] // make the `info` arg optional if this route has no params/body
      : [RequestInfo<S, M, P>] // make the `info` arg required if this route does have params/body
  ) => Promise<AxiosResponse<ResponseBody<S, M, P>>>;
};

/** Strongly-typed object used to provide details for a HTTP request to a specific route. */
type RequestInfo<
  S extends HttpSchema,
  M extends Method,
  P extends S[keyof S]['path'] = string
> = Anonymize<
  (HasNamedParams<S, M, P> extends true
    ? { params: Record<NamedParams<S, M, P>, string> } // make `params` required if this route does have named params
    : { params?: Record<string, never> }) & // make `params` optional if this route has no named params
    (HasBody<S, M, P> extends true
      ? { body: RequestBodyInput<S, M, P> } // make `body` required if this route does have a body
      : { body?: never }) & { queryParams?: AxiosRequestConfig['params'] } // make `body` optional if this route has no body
>;

/** Helper type that resolves to `true` if the route for the given method/path has defined namedParams. */
type HasNamedParams<
  S extends HttpSchema,
  M extends Method,
  P extends S[keyof S]['path']
> = NamedParams<S, M, P> extends never ? false : true;

/** Helper type that resolves to `true` if the route for the given method/path has defined requestBody. */
type HasBody<
  S extends HttpSchema,
  M extends Method,
  P extends S[keyof S]['path']
> = RequestBody<S, M, P> extends undefined ? false : true;

/** Helper type that resolves to `true` if the route for the given method/path has namedParams and/or requestBody. */
type HasNamedParamsOrBody<
  S extends HttpSchema,
  M extends Method,
  P extends S[keyof S]['path']
> = HasNamedParams<S, M, P> extends true ? true : HasBody<S, M, P>;
