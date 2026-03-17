import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ScoreEntry {
    username: string;
    score: bigint;
    timestamp: Time;
}
export type Time = bigint;
export interface backendInterface {
    getTopScores(): Promise<Array<ScoreEntry>>;
    submitScore(username: string, score: bigint): Promise<void>;
}
