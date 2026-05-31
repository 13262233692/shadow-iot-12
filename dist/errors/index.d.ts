import { ConflictError } from '../types/shadow';
export declare class ShadowConflictError extends Error {
    readonly code: string;
    readonly currentVersion: number;
    readonly requestedVersion: number;
    readonly clientToken?: string;
    constructor(thingName: string, currentVersion: number, requestedVersion: number, clientToken?: string);
    toJSON(): ConflictError;
}
export declare class ShadowNotFoundError extends Error {
    readonly code: string;
    constructor(thingName: string);
}
export declare class ShadowValidationError extends Error {
    readonly code: string;
    constructor(message: string);
}
