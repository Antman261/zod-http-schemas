// NB: express imports will be elided in the built js code, since we are only importing types.
import * as express from 'express';
import {
  IRouter,
  RequestHandler as ExpressRequestHandler,
  ErrorRequestHandler,
} from 'express';
import { HttpSchema, Method } from '../shared';
import { Paths } from '../util';
import { RequestHandler } from './create-request-handler';
import { ZodType, ZodTypeAny } from 'zod';
import * as z from 'zod';
import { ZodRawShape, ZodTypeDef } from 'zod/lib/types';

/** Options for decorateExpressRouter. */
export interface DecorateExpressRouterOptions<
  Schema extends HttpSchema,
  App extends IRouter,
  ReqProps extends ZodTypeAny
> {
  /** Type schema describing the endpoints handled by the express server. */
  schema: Schema;

  /** Express app or router. Default value is `express.Router()`. */
  router?: App;

  /** TODO: doc... */
  requestProps?: ReqProps;

  /**
   * Optional request handler to delegate to if a server-side validation error occurs. If this option is not
   * specified, the default behaviour is to respond with a 400 status code.
   */
  onValidationError?: ErrorRequestHandler;
  /**
   * Optional response handler to delegate to if a server-side validation error occurs. If this option is not
   * specified, the default behaviour is to respond with an Internal Server Error
   */
  onResponseValidationError?: ErrorRequestHandler;
}

/**
 * Returns a decorated copy of the given express application or router, with strongly-typed `get`/`post` methods
 * and runtime validation checks on request/response bodies. The given app/router is not modified.
 */
export function decorateExpressRouter<
  Schema extends HttpSchema,
  App extends IRouter,
  ReqProps extends ZodTypeAny = ZodType<{}>
>(options: DecorateExpressRouterOptions<Schema, App, ReqProps>) {
  // Return a new app/router with some overridden methods. The original app/router is left unchanged.
  let router = options.router ?? express.Router();
  let result: ExpressRequestHandler = (req, res, next) =>
    router(req, res, next);
  Object.assign(result, {
    ...options.router,
    get: (path: string, ...handlers: ExpressRequestHandler[]) =>
      handle('GET', path, ...handlers),
    post: (path: string, ...handlers: ExpressRequestHandler[]) =>
      handle('POST', path, ...handlers),
    put: (path: string, ...handlers: ExpressRequestHandler[]) =>
      handle('PUT', path, ...handlers),
  });
  return result as unknown as DecoratedExpressRouter<Schema, App, ReqProps>;

  // This function wraps express' normal get/post methods, adding runtime checks for schema conformance.
  function handle(
    method: Method,
    path: string,
    ...handlers: ExpressRequestHandler[]
  ) {
    // Get the route info from the schema for this method/path.
    let matchingRoutes = Object.values(options.schema).filter(
      (r) => r.method === method && r.path === path
    );
    let routeInfo = matchingRoutes[0];
    if (matchingRoutes.length !== 1) {
      const problem =
        matchingRoutes.length > 1 ? 'multiple routes' : 'no route';
      throw new Error(
        `Schema has ${problem} for method '${method}' and path '${path}'`
      );
    }

    // Elements of `handlers` can actually be arrays, so flatten the `handlers` array before proceeding.
    handlers = flatDeep(handlers);

    // Wrap each handler to ensure that if it throws or rejects, then it calls `next` with the error.
    // This ensures that *all* unhandled errors in route handlers are propagated to error middleware (if any).
    let errorPropagatingHandlers: ExpressRequestHandler[] = handlers.map(
      (handler) => async (req, res, next) => {
        try {
          // If `handler` throws (sync) or rejects (async), we'll hit the catch clause either way.
          await (handler as ExpressRequestHandler)(req, res, next);
        } catch (err) {
          // Unhandled error from handler - call `next` with the error to trigger error middleware (if any).
          next(err);
        }
      }
    );

    // Register the list of wrapped handlers for the given method/path with the underlying express app/router.
    // Also prepend middleware that ensures req/res objects are validated and have excess properties removed.
    const m = method.toLowerCase() as Lowercase<Method>;
    const validateRequestProps = createRequestPropValidationMiddleware(
      options.requestProps || z.unknown()
    );
    const validateBodies = createBodyValidationMiddleware(
      routeInfo,
      options.onValidationError,
      options.onResponseValidationError
    );
    router[m](
      path,
      validateRequestProps,
      validateBodies,
      ...errorPropagatingHandlers
    );
  }
}

/** A strongly-typed express application/router. */
export type DecoratedExpressRouter<
  S extends HttpSchema,
  R extends IRouter,
  ReqProps extends ZodTypeAny
> = ExpressRequestHandler &
  Omit<R, Lowercase<Method>> & {
    [M in Method as Lowercase<M>]: <P extends Paths<S, M>>(
      path: P,
      ...handlers: Array<
        | RequestHandler<S, M, P, ReqProps['_output']>
        | Array<ExpressRequestHandler | ErrorRequestHandler>
      >
    ) => void;
  };

/** Creates a middleware function that validates request properties against the given schema. */
function createRequestPropValidationMiddleware(
  requestProps: ZodTypeAny
): ExpressRequestHandler {
  return (req, _, next) => {
    requestProps.parse(req);
    next();
  };
}

/** Creates a middleware function that validates request params/body and response body for the given `routeInfo`. */
function createBodyValidationMiddleware(
  routeInfo: HttpSchema[any],
  onValidationError?: ErrorRequestHandler,
  onResponseValidationError?: ErrorRequestHandler,
): ExpressRequestHandler {
  onValidationError =
    onValidationError ??
    ((err, _, res) => {
      res.status(400).json(err);
    });
  
  onResponseValidationError = 
    onResponseValidationError ??
    ((err, _, res) => {
      res.status(500).json(err);
    });

  return (req, res, next) => {
    // Validate the incoming request params (parsed out of the request path by express) against the schema.
    // If the params object is not as expected, it is likely a server-side configuration error, such as `path`
    // and `params` not matching properly in the HTTP schema. Since the error is likely server-side, pass the
    // error to `next`. This will skip subsequent middleware and trigger error middleware (if any).
    let actualNamedParams = Object.keys(req.params);
    let expectedNamedParams = routeInfo.namedParams || [];
    let missingNamedParams = expectedNamedParams.filter(
      (p) => !actualNamedParams.includes(p)
    );
    let excessNamedParams = actualNamedParams.filter(
      (p) => !expectedNamedParams.includes(p)
    );
    if (missingNamedParams.length > 0 || excessNamedParams.length > 0) {
      let msg = 'The named parameters in the request do not match the schema.';
      if (missingNamedParams.length > 0)
        msg += ` Missing: "${missingNamedParams.join('", "')}".`;
      if (excessNamedParams.length > 0)
        msg += ` Excess: "${excessNamedParams.join('", "')}".`;
      return next(new Error(msg));
    }

    // Validate and clean the incoming request body against the schema. If the request body is invalid,
    // delegate to the `onValidationError` handler, which is expected to respond appropriately.
    // If no `onValidationError` callback is given, the default behaviour is to send a 400 response, since
    // having an invalid request structure signifies a client error.
    try {
      // TODO: test that this actually replaces the req.body value
      req.body = validateAndClean(
        req.body,
        routeInfo.requestBody ?? z.union([z.object({}), z.undefined()])
      );
    } catch (err) {
      onValidationError!(err, req, res, next);
      return;
    }

    // Ensure outgoing response bodies are validated and cleaned against the schema before they are sent.
    // This is done by wrapping methods on the `res` object, so subsequent handlers call the wrapped versions.
    // Note that validation errors will throw in the handler that caused them, in which case the error will
    // be passed to `next` and hence any error handling middleware (by default will respond with a 500 error).
    const { json, jsonp, send } = res; // the original json/jsonp/send methods to be wrapped
    res = Object.assign(res, {
      json: (body: unknown) => {
        console.log("HERE")
        try {
          json.call(res, validateAndClean(body, routeInfo.responseBody));
        } catch (err) {
          if (onResponseValidationError && !res.locals.errorHandled) {
            res.locals.errorHandled = true;
            onResponseValidationError(err, req, res, next);
          }
          if(!res.locals.errorHandled){
            throw err;
          }
        }
      },
      jsonp: (body: unknown) => {
        try {
          jsonp.call(res, validateAndClean(body, routeInfo.responseBody));
        } catch (err) {
          if (onResponseValidationError && !res.locals.errorHandled) {
            res.locals.errorHandled = true;
            onResponseValidationError(err, req, res, next);
            return;
          }
          if(res.locals.errorHandled){
            return;
          }
          throw err;
        }
      },
      send: (body: unknown) => {
        return typeof body === 'string' ? send.call(res, body) : res.json(body)
      },
    });
    
    // Param/body checking is done. Pass on to subsequent middleware for further processing.
    next();
  };

  // Helper function to runtime-validate that the body is the expected type, and to remove excess properties.
  function validateAndClean(value: unknown, type: ZodTypeAny = z.undefined()) {
    return type.parse(value);
  }
}

// Helper function - equivelent of Array#flat, which is newish.
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
function flatDeep(arr: any): any {
  return arr.reduce(
    (acc: any, val: any) =>
      acc.concat(Array.isArray(val) ? flatDeep(val) : val),
    []
  );
}
