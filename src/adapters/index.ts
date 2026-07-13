/**
 * Pre-built, zero-dependency upload adapters for standard servers, AWS S3, and Cloudflare R2.
 *
 * @module adapters
 */

export { fetchUploadAdapter } from "./fetch";
export type { FetchUploadAdapterOptions } from "./fetch";

export { s3UploadAdapter } from "./s3";
export type { S3UploadAdapterOptions } from "./s3";
