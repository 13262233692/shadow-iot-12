import { ShadowState, ShadowMetadata, ShadowDocument } from '../types/shadow';
export declare class MergeEngine {
    static mergeReported(current: ShadowDocument, reported: ShadowState, timestamp: number): {
        state: ShadowState;
        metadata: ShadowMetadata;
    };
    static mergeDesired(current: ShadowDocument, desired: ShadowState, timestamp: number, expectedVersion?: number): {
        state: ShadowState;
        metadata: ShadowMetadata;
    };
    static calculateDelta(reported: ShadowState, desired: ShadowState): ShadowState;
    private static calculateDeltaRecursive;
    private static setNestedValue;
    private static deepMerge;
    private static updateMetadata;
    private static updateMetadataRecursive;
    static checkVersionConflict(currentVersion: number, requestedVersion?: number): boolean;
    static createEmptyDocument(thingName: string): ShadowDocument;
}
