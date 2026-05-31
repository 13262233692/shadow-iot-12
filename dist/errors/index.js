"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowValidationError = exports.ShadowNotFoundError = exports.ShadowConflictError = void 0;
class ShadowConflictError extends Error {
    constructor(thingName, currentVersion, requestedVersion, clientToken) {
        super(`Version conflict for thing ${thingName}: current version ${currentVersion}, requested ${requestedVersion}`);
        this.name = 'ShadowConflictError';
        this.code = 'Conflict';
        this.currentVersion = currentVersion;
        this.requestedVersion = requestedVersion;
        this.clientToken = clientToken;
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            clientToken: this.clientToken,
            currentVersion: this.currentVersion,
            requestedVersion: this.requestedVersion,
        };
    }
}
exports.ShadowConflictError = ShadowConflictError;
class ShadowNotFoundError extends Error {
    constructor(thingName) {
        super(`Shadow not found for thing ${thingName}`);
        this.name = 'ShadowNotFoundError';
        this.code = 'NotFound';
    }
}
exports.ShadowNotFoundError = ShadowNotFoundError;
class ShadowValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ShadowValidationError';
        this.code = 'ValidationError';
    }
}
exports.ShadowValidationError = ShadowValidationError;
//# sourceMappingURL=index.js.map