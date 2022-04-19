import { SerializedValue } from 'acebase-core/types/transport';
import { RouteInitEnvironment, RouteRequest } from '../shared/env';
export declare const TRANSACTION_TIMEOUT_MS = 10000;
export declare class DataTransactionError extends Error {
    code: 'invalid_serialized_value';
    constructor(code: 'invalid_serialized_value', message: string);
}
export declare type ApiTransactionDetails = {
    id: string;
    value: SerializedValue;
};
export declare type StartRequestQuery = null;
export declare type StartRequestBody = {
    path: string;
};
export declare type StartResponseBody = ApiTransactionDetails | {
    code: string;
    message: string;
} | {
    code: 'unexpected';
    message: string;
};
export declare type StartRequest = RouteRequest<any, StartResponseBody, StartRequestBody, StartRequestQuery>;
export declare type FinishRequestQuery = null;
export declare type FinishRequestBody = ApiTransactionDetails & {
    path: string;
};
export declare type FinishResponseBody = 'done' | {
    code: string;
    message: string;
} | 'transaction not found' | string;
export declare type FinishRequest = RouteRequest<any, FinishResponseBody, FinishRequestBody, FinishRequestQuery>;
export declare const addRoutes: (env: RouteInitEnvironment) => void;
export default addRoutes;
